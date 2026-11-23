import { BUILDING_DEFS, type BuildingType } from '../data/buildings';
import { type DamagePair, PROJECTILE_SPEED, type ProjectileKind, Stance, type UnitClass } from '../data/combat';
import { NodeType } from '../data/nodes';
import { UNIT_DEFS, type UnitType } from '../data/units';
import { FP_ONE, FP_SHIFT, fixedLength, idiv, tileCenterFixed } from '../engine/fixed';
import { Comp, MoveState, Order } from './entities';
import type { AttackStats } from './stats';
import { nearestPassableTiles } from './slots';
import type { SimEvent } from './events';
import type { Simulation } from './simulation';
import { stopUnit } from './systems/movement';
import { TECH_BASE, isTechItem } from './tech';
import { TECH_COUNT } from '../data/techs';
import { WORK_REACH, distanceToTarget, removeEntity } from './world';

export type { SimEvent };

/** Proyectil en vuelo. El daño se calcula al disparar y se aplica al llegar (no falla: sigue al objetivo). */
export interface Projectile {
  readonly x0: number;
  readonly y0: number;
  readonly target: number;
  tx: number;
  ty: number;
  ticks: number;
  readonly total: number;
  readonly damage: number;
  readonly attacker: number;
  readonly kind: ProjectileKind;
}

const BUILDING_CLASSES: ReadonlySet<UnitClass> = new Set(['building']);

export function attackOf(sim: Simulation, id: number): AttackStats | null {
  const e = sim.entities;
  if (e.mask[id] & Comp.Unit) return sim.stats.unit(e.owner[id], e.unitType[id] as UnitType).attack;
  if (e.mask[id] & Comp.Building) return e.built[id] ? sim.stats.building(e.owner[id], e.buildingType[id] as BuildingType).attack : null;
  return null;
}

function armorOf(sim: Simulation, id: number): DamagePair {
  const e = sim.entities;
  return e.mask[id] & Comp.Unit
    ? sim.stats.unit(e.owner[id], e.unitType[id] as UnitType).armor
    : sim.stats.building(e.owner[id], e.buildingType[id] as BuildingType).armor;
}

function classesOf(sim: Simulation, id: number): ReadonlySet<UnitClass> {
  const e = sim.entities;
  return e.mask[id] & Comp.Unit ? sim.stats.unit(e.owner[id], e.unitType[id] as UnitType).classes : BUILDING_CLASSES;
}

/** Avance de un proyectil por tick (punto fijo). */
function projectileStep(sim: Simulation, kind: ProjectileKind): number {
  return Math.max(1, Math.round((PROJECTILE_SPEED[kind] * FP_ONE) / sim.tickRate));
}

/** Daño de un golpe: suma por tipo de max(0, ataque − armadura) + bonus por clase; como mínimo 1. */
export function computeDamage(sim: Simulation, attack: AttackStats, target: number): number {
  const armor = armorOf(sim, target);
  const classes = classesOf(sim, target);
  let damage = Math.max(0, attack.melee - armor.melee) + Math.max(0, attack.pierce - armor.pierce);
  for (const b of attack.bonus) if (classes.has(b.vs)) damage += b.damage;
  return Math.max(1, damage);
}

/**
 * ¿Se puede atacar a `target`? Vivo, fuera de edificios, unidad o edificio, y de otro dueño.
 * Los arietes solo atacan edificios.
 */
export function isAttackable(sim: Simulation, id: number, target: number): boolean {
  const e = sim.entities;
  if (!e.isAlive(target) || target === id || (e.mask[target] & Comp.Position) === 0) return false;
  if ((e.mask[target] & (Comp.Unit | Comp.Building)) === 0) return false;
  if (e.owner[target] === e.owner[id]) return false;
  if (e.mask[id] & Comp.Unit && UNIT_DEFS[e.unitType[id] as UnitType].buildingsOnly && (e.mask[target] & Comp.Building) === 0) return false;
  return true;
}

/**
 * ¿Lo atacaría por iniciativa propia? Jugadores distintos son enemigos; la naturaleza es neutral salvo
 * los animales hostiles (lobos), que atacan y son atacados por todos. Las ovejas no se atacan solas.
 */
export function isHostile(sim: Simulation, a: number, b: number): boolean {
  const e = sim.entities;
  const oa = e.owner[a];
  const ob = e.owner[b];
  if (oa === ob) return false;
  const hostileAnimal = (id: number) => (e.mask[id] & Comp.Unit) !== 0 && UNIT_DEFS[e.unitType[id] as UnitType].hostile === true;
  if (oa === 0) return hostileAnimal(a) && ob !== 0;
  if (ob === 0) return hostileAnimal(b);
  if (e.mask[b] & Comp.Unit && UNIT_DEFS[e.unitType[b] as UnitType].classes.includes('herdable')) return false;
  return true;
}

/** Distancia de ataque: al borde de la huella o al cuerpo del objetivo; desde el borde si el atacante es un edificio. */
export function attackDistance(sim: Simulation, attacker: number, target: number): number {
  const e = sim.entities;
  if (e.size[attacker] > 0 && e.mask[attacker] & Comp.Building) {
    return Math.max(0, distanceToTarget(sim, attacker, e.x[target], e.y[target]) - e.radius[target]);
  }
  const d = distanceToTarget(sim, target, e.x[attacker], e.y[attacker]);
  return e.size[target] > 0 ? d : Math.max(0, d - e.radius[target]);
}

/**
 * Cuántos pueden pegar cuerpo a cuerpo a la vez a un objetivo sin estorbarse: unos 4 alrededor de un hombre a
 * pie, 5 alrededor de un jinete o un asedio, y muchos más alrededor de un edificio (según su tamaño).
 */
export function meleeCapacity(sim: Simulation, target: number): number {
  const e = sim.entities;
  if (e.size[target] > 0) return 4 + 3 * e.size[target];
  return e.radius[target] >= 90 ? 5 : 4;
}

export function inAttackRange(sim: Simulation, attacker: number, target: number, attack: AttackStats): boolean {
  const e = sim.entities;
  const reach = attack.range > 0 ? attack.range : e.size[target] > 0 ? WORK_REACH : e.radius[attacker] + 64;
  const d = attackDistance(sim, attacker, target);
  return d <= reach && d >= attack.minRange;
}

/** Ataca ya: cuerpo a cuerpo hace daño en el acto; a distancia lanza una flecha. */
export function strike(sim: Simulation, attacker: number, target: number, attack: AttackStats): void {
  const e = sim.entities;
  const damage = computeDamage(sim, attack, target);
  if (attack.range > 0) {
    const dist = fixedLength(e.x[target] - e.x[attacker], e.y[target] - e.y[attacker]);
    sim.emit({ kind: 'shoot', x: e.x[attacker], y: e.y[attacker], projectile: attack.projectile });
    sim.projectiles.push({
      x0: e.x[attacker],
      y0: e.y[attacker],
      target,
      tx: e.x[target],
      ty: e.y[target],
      ticks: 0,
      total: Math.max(1, Math.ceil(dist / projectileStep(sim, attack.projectile))),
      damage,
      attacker,
      kind: attack.projectile,
    });
  } else {
    sim.emit({ kind: 'hit', x: e.x[target], y: e.y[target] });
    applyDamage(sim, target, damage, attacker);
  }
}

/** Avanza las flechas en vuelo y aplica su daño al llegar. */
export function updateProjectiles(sim: Simulation): void {
  const e = sim.entities;
  const list = sim.projectiles;
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    p.ticks++;
    const alive = e.isAlive(p.target) && (e.mask[p.target] & Comp.Position) !== 0;
    if (alive) {
      p.tx = e.x[p.target];
      p.ty = e.y[p.target];
    }
    if (p.ticks < p.total) {
      list[w++] = p;
      continue;
    }
    sim.emit({ kind: 'impact', x: p.tx, y: p.ty, projectile: p.kind });
    if (alive) applyDamage(sim, p.target, p.damage, p.attacker);
  }
  list.length = w;
}

/** Resta vida y provoca la reacción del objetivo: huir, devolver el golpe o morir. */
export function applyDamage(sim: Simulation, target: number, damage: number, attacker: number): void {
  const e = sim.entities;
  if (!e.isAlive(target) || (e.mask[target] & Comp.Position) === 0) return;
  e.hp[target] -= damage;
  if (e.owner[target] !== 0 && e.isAlive(attacker) && e.owner[attacker] !== 0) {
    sim.emit({ kind: 'attacked', player: e.owner[target], x: e.x[target], y: e.y[target] });
  }
  if (e.hp[target] <= 0) {
    kill(sim, target);
    return;
  }
  if ((e.mask[target] & Comp.Unit) === 0 || !e.isAlive(attacker)) return;
  const def = UNIT_DEFS[e.unitType[target] as UnitType];
  if (def.flees) {
    flee(sim, target, attacker);
    return;
  }
  // Devolver el golpe si está ociosa y su postura lo permite.
  const idle = e.attackTarget[target] === 0 && e.order[target] === Order.None && (e.mask[target] & Comp.Worker ? e.task[target] === 0 : true);
  if (idle && e.stance[target] !== Stance.NoAttack && attackOf(sim, target) && isAttackable(sim, target, attacker)) {
    e.attackTarget[target] = attacker;
  }
}

/** Muere: los edificios sueltan su guarnición y desaparecen; los animales con carne quedan como fuente de comida. */
export function kill(sim: Simulation, id: number): void {
  const e = sim.entities;
  const building = (e.mask[id] & Comp.Building) !== 0;
  sim.emit({
    kind: 'death',
    id,
    x: e.x[id],
    y: e.y[id],
    owner: e.owner[id],
    unitType: building ? e.buildingType[id] : e.unitType[id],
    building,
    size: e.size[id],
  });
  if (building) {
    // Lo que investigaba se pierde, pero se podrá volver a investigar en otro edificio.
    for (const item of e.queue[id] ?? []) {
      if (isTechItem(item)) sim.players.researching[e.owner[id] * TECH_COUNT + item - TECH_BASE] = 0;
    }
    ungarrisonAll(sim, id);
    removeEntity(sim, id);
    return;
  }
  if ((e.mask[id] & Comp.Resource) !== 0 && e.resAmount[id] > 0) {
    stopUnit(e, id);
    e.variant[id] = e.unitType[id]; // para dibujar la carne del animal que era
    e.mask[id] &= ~(Comp.Unit | Comp.Mover);
    e.nodeType[id] = NodeType.Carcass;
    e.owner[id] = 0;
    e.attackTarget[id] = 0;
    e.hp[id] = 0;
    return;
  }
  removeEntity(sim, id);
}

/** Echa a correr en dirección contraria al atacante durante un par de segundos. */
function flee(sim: Simulation, id: number, from: number): void {
  const e = sim.entities;
  if (e.fleeTicks[id] > 0) return;
  let dx = e.x[id] - e.x[from];
  let dy = e.y[id] - e.y[from];
  if (dx === 0 && dy === 0) dx = 1;
  const len = fixedLength(dx, dy);
  dx = idiv(dx * 4 * FP_ONE, len);
  dy = idiv(dy * 4 * FP_ONE, len);
  const grid = sim.grid;
  const gx = Math.max(0, Math.min(grid.width - 1, (e.x[id] + dx) >> FP_SHIFT));
  const gy = Math.max(0, Math.min(grid.height - 1, (e.y[id] + dy) >> FP_SHIFT));
  const tile = nearestPassableTiles(grid, gx, gy, 1)[0];
  if (tile === undefined) return;
  e.goalX[id] = tileCenterFixed(tile % grid.width);
  e.goalY[id] = tileCenterFixed(Math.floor(tile / grid.width));
  e.fleeTicks[id] = 2 * sim.tickRate;
  e.attackTarget[id] = 0;
  sim.pathing.request(id);
}

// ── Guarnición ──────────────────────────────────────────────────────────

export function garrisonCapacity(sim: Simulation, building: number): number {
  const e = sim.entities;
  if (!e.has(building, Comp.Building) || !e.built[building]) return 0;
  return BUILDING_DEFS[e.buildingType[building] as BuildingType].garrison ?? 0;
}

/** Mete la unidad en el edificio: deja de estar en el mapa (sin Position) hasta que la saquen. */
export function enterBuilding(sim: Simulation, id: number, building: number): void {
  const e = sim.entities;
  stopUnit(e, id);
  e.garrisonedIn[id] = building;
  e.mask[id] &= ~Comp.Position;
  e.attackTarget[id] = 0;
  e.order[id] = Order.None;
  e.task[id] = 0;
  e.buildQueue[id] = null;
  sim.garrisonCount.set(building, (sim.garrisonCount.get(building) ?? 0) + 1);
}

/** Saca a todas las unidades guarecidas, repartidas por las casillas libres alrededor. */
export function ungarrisonAll(sim: Simulation, building: number): void {
  const e = sim.entities;
  const inside: number[] = [];
  for (let id = 1; id < e.highWater; id++) if (e.garrisonedIn[id] === building && e.isAlive(id)) inside.push(id);
  if (inside.length === 0) return;
  const size = e.size[building];
  const cx = e.tileX[building] + (size >> 1);
  const cy = e.tileY[building] + (size >> 1);
  const exits = nearestPassableTiles(sim.grid, cx, cy, inside.length);
  inside.forEach((id, i) => {
    const tile = exits[i % Math.max(1, exits.length)];
    e.garrisonedIn[id] = 0;
    e.mask[id] |= Comp.Position;
    if (tile !== undefined) {
      e.x[id] = e.prevX[id] = tileCenterFixed(tile % sim.grid.width);
      e.y[id] = e.prevY[id] = tileCenterFixed(Math.floor(tile / sim.grid.width));
    }
    e.moveState[id] = MoveState.Idle;
  });
  sim.garrisonCount.delete(building);
}
