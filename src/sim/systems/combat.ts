import { Stance } from '../../data/combat';
import { UNIT_DEFS, type UnitType } from '../../data/units';
import { FP_ONE, FP_SHIFT, fixedLength } from '../../engine/fixed';
import {
  attackDistance,
  attackOf,
  enterBuilding,
  garrisonCapacity,
  inAttackRange,
  isAttackable,
  isHostile,
  meleeCapacity,
  strike,
  updateProjectiles,
} from '../combat';
import { Comp, MoveState, Order, Task } from '../entities';
import type { AttackStats } from '../stats';
import type { Simulation } from '../simulation';
import { approachTarget, inReach } from '../world';
import { stopUnit } from './movement';

/** Cada cuántos ticks busca objetivo una unidad ociosa (escalonado por id para repartir el trabajo). */
const ACQUIRE_EVERY = 8;
/** Distancia máxima a la que se aleja una unidad defensiva de su punto de guardia (casillas). */
const DEFENSIVE_LEASH = 6;
/** Hasta dónde persiguen los animales hostiles (lobos) lejos de su guarida (casillas): luego vuelven a ella. */
const WILD_LEASH = 9;
/** Ticks entre cada punto de vida que recupera una unidad guarecida. */
const HEAL_EVERY = 20;

/**
 * Reparto de objetivos en una batalla: cuántos atacantes cuerpo a cuerpo y a distancia tiene ya cada enemigo
 * (se rehace en cada tick y se actualiza al elegir objetivo), y qué puestos de alrededor de cada unidad ya
 * están cogidos por quien le pega cuerpo a cuerpo.
 */
interface Crowd {
  readonly melee: Uint16Array;
  readonly ranged: Uint16Array;
  /** Objetivo → máscara de las 8 direcciones ocupadas a su alrededor. */
  readonly slots: Map<number, number>;
  /** Objetivo × 8 + dirección → quién tiene ese puesto (el que ya lo tenía lo conserva). */
  readonly owners: Map<number, number>;
}

/** Penalización al elegir un enemigo que ya tiene atacantes (punto fijo: 256 = una casilla de distancia). */
const MELEE_CROWD = 200;
const RANGED_CROWD = 96;
/** Un enemigo con todos sus puestos cuerpo a cuerpo cogidos cuenta como si estuviera 8 casillas más lejos. */
const FULL_CROWD = 8 * FP_ONE;

/** Direcciones alrededor de un objetivo (E, SE, S, SO, O, NO, N, NE), de longitud 256. */
const AROUND: readonly (readonly [number, number])[] = [
  [256, 0],
  [181, 181],
  [0, 256],
  [-181, 181],
  [-256, 0],
  [-181, -181],
  [0, -256],
  [181, -181],
];
/** Orden en que se prueban los puestos: el del lado por el que llega, y luego los de al lado. */
const SLOT_ORDER = [0, 1, -1, 2, -2, 3, -3, 4];

/** Dirección (0–7 de AROUND) de un vector, sin trigonometría: tan(22,5°) ≈ 0,414. */
function dir8(dx: number, dy: number): number {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ay * 1000 <= ax * 414) return dx >= 0 ? 0 : 4;
  if (ax * 1000 <= ay * 414) return dy >= 0 ? 2 : 6;
  if (dx >= 0) return dy >= 0 ? 1 : 7;
  return dy >= 0 ? 3 : 5;
}

export function runCombat(sim: Simulation): void {
  const e = sim.entities;
  const crowd: Crowd = { melee: new Uint16Array(e.highWater), ranged: new Uint16Array(e.highWater), slots: new Map(), owners: new Map() };
  for (const id of sim.unitIds) {
    const t = e.attackTarget[id];
    if (!t || (e.mask[id] & Comp.Position) === 0 || t >= e.highWater) continue;
    const a = attackOf(sim, id);
    if (!a) continue;
    if (a.range > 0) crowd.ranged[t]++;
    else crowd.melee[t]++;
    // Quien ya tenía un puesto alrededor de su objetivo lo conserva (así nadie se lo quita y no se cambian de sitio).
    const slot = e.meleeSlot[id];
    if (slot && (slot - 1) >> 3 === t && !crowd.owners.has(slot - 1)) {
      crowd.owners.set(slot - 1, id);
      crowd.slots.set(t, (crowd.slots.get(t) ?? 0) | (1 << ((slot - 1) & 7)));
    }
  }
  for (const id of sim.unitIds) {
    // Puede haber muerto (o ser ya un cadáver de caza) en este mismo tick.
    if ((e.mask[id] & Comp.Unit) === 0) continue;
    if ((e.mask[id] & Comp.Position) === 0) {
      // Guarecida: se cura poco a poco.
      if (e.garrisonedIn[id] && (sim.tick + id) % HEAL_EVERY === 0 && e.hp[id] < e.maxHp[id]) e.hp[id]++;
      continue;
    }
    if ((e.mask[id] & Comp.Worker) === 0) e.working[id] = 0;
    if (e.attackCooldown[id] > 0) e.attackCooldown[id]--;
    if (e.fleeTicks[id] > 0) {
      e.fleeTicks[id]--;
      continue;
    }
    updateOrder(sim, id);
    if (e.order[id] === Order.Garrison) {
      garrisonStep(sim, id);
      continue;
    }
    const def = UNIT_DEFS[e.unitType[id] as UnitType];
    if (def.deployTime && e.deployTicks[id] > 0 && --e.deployTicks[id] === 0) {
      e.deployState[id] = e.deployState[id] === 1 ? 2 : 0;
    }
    if (def.monk) {
      monkStep(sim, id);
      continue;
    }
    const attack = attackOf(sim, id);
    if (!attack) continue;

    let target = e.attackTarget[id];
    if (target && !isAttackable(sim, id, target)) {
      target = 0;
      dropTarget(sim, id);
    }
    if (!target && (sim.tick + id) % ACQUIRE_EVERY === 0 && canAcquire(sim, id)) {
      target = acquire(sim, id, attack, crowd);
      e.attackTarget[id] = target;
      if (target) {
        if (attack.range > 0) crowd.ranged[target]++;
        else crowd.melee[target]++;
      }
    }
    if (target) engage(sim, id, target, attack, crowd);
  }

  // Edificios que disparan (centro de la villa, torres): una flecha y una más por unidad guarecida.
  for (const b of sim.buildingIds) {
    const attack = attackOf(sim, b);
    if (!attack) continue;
    if (e.attackCooldown[b] > 0) {
      e.attackCooldown[b]--;
      continue;
    }
    const target = acquire(sim, b, attack);
    if (!target) continue;
    const arrows = 1 + Math.min(sim.garrisonCount.get(b) ?? 0, garrisonCapacity(sim, b));
    for (let k = 0; k < arrows; k++) strike(sim, b, target, attack);
    e.attackCooldown[b] = attack.reloadTicks;
  }

  updateProjectiles(sim);
}

/** Intentos de alcanzar a un objetivo antes de darlo por inalcanzable. */
const CHASE_TRIES = 4;
/** Segundos que una presa inalcanzable queda vetada. */
const BLOCKED_SECONDS = 120;

/** Abandona un objetivo al que no se puede llegar. Si era una presa, nadie volverá a por ella en un rato. */
function giveUpChase(sim: Simulation, id: number, target: number): void {
  const e = sim.entities;
  e.chaseFails[id] = 0;
  if (e.mask[target] & Comp.Resource) e.blockedUntil[target] = sim.tick + BLOCKED_SECONDS * sim.tickRate;
  dropTarget(sim, id);
  if ((e.mask[id] & Comp.Worker) !== 0 && e.task[id] === Task.Gather && e.taskTarget[id] === target) {
    e.task[id] = Task.None;
    e.taskTarget[id] = 0;
  }
}

/** Cierra órdenes cumplidas: llegada de un movimiento o de un ataque-mover. */
function updateOrder(sim: Simulation, id: number): void {
  const e = sim.entities;
  const order = e.order[id];
  if (order === Order.Move && e.moveState[id] === MoveState.Idle) {
    setIdle(sim, id);
  } else if (order === Order.AttackMove && e.attackTarget[id] === 0 && e.moveState[id] === MoveState.Idle) {
    const dist = fixedLength(e.orderX[id] - e.x[id], e.orderY[id] - e.y[id]);
    if (dist <= 2 * FP_ONE || e.taskFails[id] >= 3) {
      setIdle(sim, id);
    } else {
      // Tras una escaramuza, sigue hacia el destino.
      e.taskFails[id]++;
      e.goalX[id] = e.orderX[id];
      e.goalY[id] = e.orderY[id];
      e.repaths[id] = 0;
      sim.pathing.request(id);
    }
  }
}

/** Sin orden: se queda donde está, que pasa a ser su punto de guardia (postura defensiva). */
function setIdle(sim: Simulation, id: number): void {
  const e = sim.entities;
  e.order[id] = Order.None;
  e.orderX[id] = e.x[id];
  e.orderY[id] = e.y[id];
  e.taskFails[id] = 0;
}

function dropTarget(sim: Simulation, id: number): void {
  const e = sim.entities;
  e.attackTarget[id] = 0;
  e.chaseFails[id] = 0;
  if (e.order[id] === Order.Attack) setIdle(sim, id);
  if (e.order[id] === Order.AttackMove) e.taskFails[id] = 0;
}

/**
 * Correa de una unidad que pelea por su cuenta: hasta qué distancia de su punto de guardia (en punto fijo) va
 * a por un enemigo, o 0 si no tiene. Los lobos defienden su guarida, no persiguen por medio mapa.
 */
function leashOf(sim: Simulation, id: number): number {
  const e = sim.entities;
  if (e.order[id] !== Order.None || (e.mask[id] & Comp.Worker) !== 0) return 0;
  if (e.owner[id] === 0) return WILD_LEASH * FP_ONE;
  return e.stance[id] === Stance.Defensive ? DEFENSIVE_LEASH * FP_ONE : 0;
}

const beyondLeash = (sim: Simulation, id: number, target: number, leash: number) =>
  leash > 0 && fixedLength(sim.entities.x[target] - sim.entities.orderX[id], sim.entities.y[target] - sim.entities.orderY[id]) > leash;

/** ¿Busca enemigos por su cuenta? Según la postura, la orden actual y quién es. */
function canAcquire(sim: Simulation, id: number): boolean {
  const e = sim.entities;
  const stance = e.stance[id];
  if (stance === Stance.NoAttack) return false;
  const order = e.order[id];
  if (order !== Order.None && order !== Order.AttackMove) return false;
  if ((e.mask[id] & Comp.Worker) !== 0 && e.task[id] !== Task.None) return false;
  // La naturaleza solo ataca por su cuenta si es un animal hostil (lobos).
  if (e.owner[id] === 0) return UNIT_DEFS[e.unitType[id] as UnitType].hostile === true;
  return true;
}

/**
 * Enemigo más cercano a la vista (o al alcance, si mantiene posición, o si es un edificio). Prefiere unidades;
 * si no hay ninguna, edificios. Con `crowd`, los enemigos que ya tienen atacantes cuentan como más lejanos (y
 * mucho más si no queda sitio a su alrededor): así un grupo se reparte entre los enemigos en vez de echarse
 * entero sobre el primero.
 */
function acquire(sim: Simulation, id: number, attack: AttackStats, crowd?: Crowd): number {
  const e = sim.entities;
  const isBuilding = (e.mask[id] & Comp.Building) !== 0;
  const radius = isBuilding || e.stance[id] === Stance.StandGround ? attack.range + (isBuilding ? 0 : e.radius[id] + 64) : e.los[id] * FP_ONE;
  const reachTiles = Math.ceil(radius / FP_ONE) + (isBuilding ? e.size[id] : 0) + 1;
  const cx = e.x[id] >> FP_SHIFT;
  const cy = e.y[id] >> FP_SHIFT;
  const hash = sim.spatial;
  const leash = isBuilding ? 0 : leashOf(sim, id);
  let best = 0;
  let bestD = Infinity;
  for (let ty = cy - reachTiles; ty <= cy + reachTiles; ty++) {
    for (let tx = cx - reachTiles; tx <= cx + reachTiles; tx++) {
      for (let t = hash.first(tx, ty); t !== -1; t = hash.next(t)) {
        if (!isAttackable(sim, id, t) || !isHostile(sim, id, t) || beyondLeash(sim, id, t, leash)) continue;
        const d = attackDistance(sim, id, t);
        if (d > radius) continue;
        const score = crowd ? d + crowdPenalty(sim, t, attack, crowd) : d;
        if (score < bestD || (score === bestD && t < best)) {
          bestD = score;
          best = t;
        }
      }
    }
  }
  if (best || isBuilding || e.owner[id] === 0) return best;
  for (const b of sim.buildingIds) {
    if (!isAttackable(sim, id, b) || !isHostile(sim, id, b) || beyondLeash(sim, id, b, leash)) continue;
    const d = attackDistance(sim, id, b);
    if (d > radius) continue;
    if (d < bestD || (d === bestD && b < best)) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

/** Cuánto más lejos parece un enemigo por los atacantes que ya tiene. */
function crowdPenalty(sim: Simulation, t: number, attack: AttackStats, crowd: Crowd): number {
  if (attack.range > 0) return crowd.ranged[t] * RANGED_CROWD;
  const n = crowd.melee[t];
  return n * MELEE_CROWD + (n >= meleeCapacity(sim, t) ? FULL_CROWD : 0);
}

/**
 * Puesto cuerpo a cuerpo de `id` alrededor de la unidad `target`: el del lado por el que llega si está libre,
 * o el libre más cercano. Lo reserva para este tick y devuelve el punto (punto fijo) al que tiene que ir.
 */
function meleeSlot(sim: Simulation, id: number, target: number, crowd: Crowd): [number, number] {
  const e = sim.entities;
  const mine = e.meleeSlot[id];
  let dir = -1;
  if (mine && (mine - 1) >> 3 === target && crowd.owners.get(mine - 1) === id) dir = (mine - 1) & 7;
  if (dir < 0) {
    const taken = crowd.slots.get(target) ?? 0;
    const base = dir8(e.x[id] - e.x[target], e.y[id] - e.y[target]);
    dir = base;
    for (const k of SLOT_ORDER) {
      const d = (base + k + 8) % 8;
      if ((taken & (1 << d)) === 0) {
        dir = d;
        break;
      }
    }
    crowd.slots.set(target, taken | (1 << dir));
    crowd.owners.set(target * 8 + dir, id);
    e.meleeSlot[id] = target * 8 + dir + 1;
  }
  // Pegado a él, sin solaparse: la suma de los dos radios y un poco más.
  const reach = e.radius[target] + e.radius[id] + 24;
  return [e.x[target] + ((AROUND[dir][0] * reach) >> 8), e.y[target] + ((AROUND[dir][1] * reach) >> 8)];
}

/** Va a un punto concreto (un puesto alrededor del objetivo). */
function approachPoint(sim: Simulation, id: number, x: number, y: number): void {
  const e = sim.entities;
  const grid = sim.grid;
  e.goalX[id] = Math.max(0, Math.min(grid.width * FP_ONE - 1, x));
  e.goalY[id] = Math.max(0, Math.min(grid.height * FP_ONE - 1, y));
  e.repaths[id] = 0;
  sim.pathing.request(id);
  e.taskPathed[id] = 1;
}

/** Al alcance, golpea cuando pueda; si no, persigue (salvo que la postura se lo impida). */
function engage(sim: Simulation, id: number, target: number, attack: AttackStats, crowd: Crowd): void {
  const e = sim.entities;
  // Cuerpo a cuerpo contra una unidad plantada (peleando o quieta): cada uno por su lado, rodeándola, en vez de
  // amontonarse delante. A una que se mueve o huye (un ciervo, un batidor) se la persigue a ella.
  const standing = e.moveState[target] === MoveState.Idle && e.fleeTicks[target] === 0;
  const slot =
    attack.range === 0 && standing && e.size[target] === 0 && (e.mask[target] & Comp.Unit) !== 0 && (e.mask[id] & Comp.Worker) === 0
      ? meleeSlot(sim, id, target, crowd)
      : null;
  if (inAttackRange(sim, id, target, attack)) {
    e.chaseFails[id] = 0;
    e.taskPathed[id] = 0;
    // Al alcance pero lejos de su puesto: sigue hasta él (pegando ya), para rodearlo en vez de quedarse delante.
    const offSlot = slot !== null && fixedLength(e.x[id] - slot[0], e.y[id] - slot[1]) > 100;
    if (offSlot && slot) {
      if (fixedLength(e.goalX[id] - slot[0], e.goalY[id] - slot[1]) > 64) {
        approachPoint(sim, id, slot[0], slot[1]);
        e.taskPathed[id] = 0;
      }
    } else if (e.moveState[id] !== MoveState.Idle) stopUnit(e, id);
    // Asedio que se monta: primero montarlo, y solo dispara montado.
    if (UNIT_DEFS[e.unitType[id] as UnitType].deployTime) {
      if (e.deployState[id] === 0) {
        e.deployState[id] = 1;
        e.deployTicks[id] = sim.deployTicks(e.unitType[id]);
      }
      if (e.deployState[id] !== 2) return;
    }
    e.working[id] = 1;
    if (e.attackCooldown[id] === 0) {
      strike(sim, id, target, attack);
      e.attackCooldown[id] = attack.reloadTicks;
    }
    return;
  }
  const explicit = e.order[id] === Order.Attack || (e.mask[id] & Comp.Worker) !== 0;
  if (!explicit && e.stance[id] === Stance.StandGround) {
    e.attackTarget[id] = 0;
    return;
  }
  if (!explicit) {
    if (beyondLeash(sim, id, target, leashOf(sim, id))) {
      // Demasiado lejos: vuelve a su sitio.
      e.attackTarget[id] = 0;
      e.goalX[id] = e.orderX[id];
      e.goalY[id] = e.orderY[id];
      sim.pathing.request(id);
      return;
    }
  }
  // Persiguiendo, cada uno a su paso (ya no marcha en formación).
  e.speedCap[id] = 0;
  if (e.moveState[id] === MoveState.Idle) {
    // El camino terminó sin llegar: tras varios intentos, el objetivo es inalcanzable y se abandona.
    if (e.taskPathed[id]) {
      e.taskPathed[id] = 0;
      if (++e.chaseFails[id] >= CHASE_TRIES) {
        giveUpChase(sim, id, target);
        return;
      }
    }
    if (slot) approachPoint(sim, id, slot[0], slot[1]);
    else approachTarget(sim, id, target);
  } else if (e.size[target] === 0 && (sim.tick + id) % 10 === 0) {
    // Objetivo móvil (o su puesto ha cambiado): si se ha alejado de donde íbamos, se recalcula.
    const [gx, gy] = slot ?? [e.x[target], e.y[target]];
    if (fixedLength(e.goalX[id] - gx, e.goalY[id] - gy) > (slot ? 160 : FP_ONE)) {
      if (slot) approachPoint(sim, id, gx, gy);
      else approachTarget(sim, id, target);
    }
  }
}

/** Va hacia el edificio y, al llegar, entra si cabe. */
function garrisonStep(sim: Simulation, id: number): void {
  const e = sim.entities;
  const building = e.orderTarget[id];
  const capacity = garrisonCapacity(sim, building);
  if (capacity === 0 || e.owner[building] !== e.owner[id] || (sim.garrisonCount.get(building) ?? 0) >= capacity) {
    setIdle(sim, id);
    return;
  }
  if (inReach(sim, id, building)) {
    enterBuilding(sim, id, building);
    return;
  }
  if (e.moveState[id] === MoveState.Idle) {
    if (e.taskFails[id]++ >= 3 || !approachTarget(sim, id, building)) setIdle(sim, id);
  }
}

// ── Monjes ──────────────────────────────────────────────────────────────

/** Distancia a la que cura un monje (casillas). */
const HEAL_RANGE = 4;
/** Ticks entre cada punto de vida curado (sin Hospitalarios). */
const HEAL_EVERY_BASE = 12;
/** Segundos que necesita un monje para volver a convertir. */
const CONVERT_RECHARGE = 20;

/**
 * Monje: si tiene objetivo, lo convierte (tarda entre 4 y 10 segundos, al azar con el PRNG de la partida);
 * si no, cura a la unidad propia herida más cercana que vea.
 */
function monkStep(sim: Simulation, id: number): void {
  const e = sim.entities;
  const target = e.attackTarget[id];
  if (target) {
    if (!isConvertible(sim, id, target)) {
      e.channel[id] = 0;
      dropTarget(sim, id);
      return;
    }
    if (attackDistance(sim, id, target) <= sim.stats.convertRange(e.owner[id])) {
      if (e.moveState[id] !== MoveState.Idle) stopUnit(e, id);
      if (e.attackCooldown[id] > 0) return; // recargando la fe
      e.working[id] = 1;
      if (e.channel[id] === 0) e.channel[id] = sim.rng.nextRange(4 * sim.tickRate, 10 * sim.tickRate);
      if (--e.channel[id] === 0) {
        convert(sim, target, e.owner[id]);
        e.attackCooldown[id] = CONVERT_RECHARGE * sim.tickRate;
        dropTarget(sim, id);
      }
    } else {
      e.channel[id] = 0;
      if (e.moveState[id] === MoveState.Idle) approachTarget(sim, id, target);
    }
    return;
  }
  if (e.order[id] !== Order.None) return;
  let patient = e.taskTarget[id];
  if (!isPatient(sim, id, patient) || (sim.tick + id) % 10 === 0) patient = findPatient(sim, id);
  e.taskTarget[id] = patient;
  if (!patient) return;
  const d = fixedLength(e.x[patient] - e.x[id], e.y[patient] - e.y[id]);
  if (d <= HEAL_RANGE * FP_ONE) {
    if (e.moveState[id] !== MoveState.Idle) stopUnit(e, id);
    e.working[id] = 1;
    const every = Math.max(1, Math.round((HEAL_EVERY_BASE * 100) / (100 + sim.stats.healPct(e.owner[id]))));
    if ((sim.tick + id) % every === 0) {
      e.hp[patient] = Math.min(e.maxHp[patient], e.hp[patient] + 1);
      if ((sim.tick + id) % (every * 8) === 0) sim.emit({ kind: 'heal', x: e.x[patient], y: e.y[patient] });
    }
  } else if (e.moveState[id] === MoveState.Idle && e.stance[id] !== Stance.StandGround) {
    approachTarget(sim, id, patient);
  }
}

/** Unidades enemigas (no animales, monjes ni edificios). */
function isConvertible(sim: Simulation, monk: number, target: number): boolean {
  const e = sim.entities;
  if (!isAttackable(sim, monk, target) || (e.mask[target] & Comp.Unit) === 0 || e.owner[target] === 0) return false;
  return !UNIT_DEFS[e.unitType[target] as UnitType].monk;
}

function isPatient(sim: Simulation, monk: number, id: number): boolean {
  const e = sim.entities;
  if (!e.has(id, Comp.Unit | Comp.Position) || e.owner[id] !== e.owner[monk] || id === monk) return false;
  if (UNIT_DEFS[e.unitType[id] as UnitType].classes.includes('siege')) return false;
  return e.hp[id] < e.maxHp[id];
}

function findPatient(sim: Simulation, monk: number): number {
  const e = sim.entities;
  const reach = e.los[monk];
  const cx = e.x[monk] >> FP_SHIFT;
  const cy = e.y[monk] >> FP_SHIFT;
  let best = 0;
  let bestD = Infinity;
  for (let ty = cy - reach; ty <= cy + reach; ty++) {
    for (let tx = cx - reach; tx <= cx + reach; tx++) {
      for (let t = sim.spatial.first(tx, ty); t !== -1; t = sim.spatial.next(t)) {
        if (!isPatient(sim, monk, t)) continue;
        const d = fixedLength(e.x[t] - e.x[monk], e.y[t] - e.y[monk]);
        if (d <= reach * FP_ONE && (d < bestD || (d === bestD && t < best))) {
          bestD = d;
          best = t;
        }
      }
    }
  }
  return best;
}

/** La unidad cambia de bando: deja lo que hacía y toma las estadísticas de su nuevo dueño. */
function convert(sim: Simulation, target: number, owner: number): void {
  const e = sim.entities;
  sim.emit({ kind: 'convert', x: e.x[target], y: e.y[target], from: e.owner[target], to: owner });
  stopUnit(e, target);
  e.owner[target] = owner;
  e.attackTarget[target] = 0;
  e.order[target] = Order.None;
  e.task[target] = Task.None;
  e.taskTarget[target] = 0;
  e.buildQueue[target] = null;
  e.carryAmount[target] = 0;
  const stats = sim.stats.unit(owner, e.unitType[target] as UnitType);
  e.hp[target] = Math.max(1, Math.round((e.hp[target] * stats.hp) / Math.max(1, e.maxHp[target])));
  e.maxHp[target] = stats.hp;
  e.speed[target] = stats.speed;
  e.los[target] = stats.los;
}
