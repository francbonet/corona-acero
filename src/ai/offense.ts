import { BUILDING_DEFS, BuildingType } from '../data/buildings';
import { UNIT_DEFS, type UnitType } from '../data/units';
import { FP_ONE, FP_SHIFT, tileCenterFixed } from '../engine/fixed';
import { attackOf, computeDamage } from '../sim/combat';
import { Comp, MoveState, Order } from '../sim/entities';
import { nearestPassableTiles } from '../sim/slots';
import type { AiPlayer } from './ai-player';
import type { AiContext } from './context';
import { planApproach, recentFailure, type Approach } from './tactics';

interface Point { x: number; y: number }
export interface Campaign {
  members: number[];
  generations: Map<number, number>;
  target: number;
  goal: Point | null;
  initialSize: number;
  lastOrder: number;
  tactic?: 'assault' | 'flank' | 'raid' | 'siege';
  approach?: Approach;
  progress?: { point: Point; tick: number; targetHp: number };
  lastRaid?: number;
  raidTarget?: number;
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) / FP_ONE;
const position = (ctx: AiContext, id: number): Point => ({ x: ctx.sim.entities.x[id], y: ctx.sim.entities.y[id] });
const center = (b: Point): Point => ({ x: tileCenterFixed(b.x), y: tileCenterFixed(b.y) });

/** Centro del bloque principal: los refuerzos lejanos no arrastran el centro del ejército hacia casa. */
function mainBody(ctx: AiContext, ids: readonly number[]): { point: Point; units: number[] } {
  let units: number[] = [];
  for (const id of ids) {
    const nearby = ids.filter((other) => distance(position(ctx, id), position(ctx, other)) <= 9);
    if (nearby.length > units.length) units = nearby;
  }
  return {
    units,
    point: {
      x: Math.round(units.reduce((sum, id) => sum + ctx.sim.entities.x[id], 0) / units.length),
      y: Math.round(units.reduce((sum, id) => sum + ctx.sim.entities.y[id], 0) / units.length),
    },
  };
}

/** Fuerza aproximada con vida actual, mejoras, cadencia y daño contra la composición que tiene delante. */
function power(ctx: AiContext, ids: readonly number[], opponents: readonly number[]): number {
  const sim = ctx.sim;
  const e = sim.entities;
  // Un representante por tipo y dueño basta para estimar armaduras y bonus sin comparar cada pareja.
  const sample = [...new Map(opponents.map((id) => [`${e.owner[id]}:${e.unitType[id]}`, id])).values()];
  return ids.reduce((sum, id) => {
    const attack = attackOf(sim, id);
    if (!attack || UNIT_DEFS[e.unitType[id] as UnitType].buildingsOnly) return sum;
    const damage = sample.length > 0
      ? sample.reduce((total, target) => total + computeDamage(sim, attack, target), 0) / sample.length
      : attack.melee + attack.pierce;
    const dps = damage * sim.tickRate / Math.max(1, attack.reloadTicks);
    return sum + Math.sqrt(Math.max(0, e.hp[id]) * dps) * (attack.range > 0 ? 1.15 : 1);
  }, 0);
}

/** Reúne también a quienes tienen una orden antigua; no espera a que queden ociosos en el frente. */
function assemble(ai: AiPlayer, ctx: AiContext, ids: readonly number[], rally: Point): void {
  const e = ctx.sim.entities;
  const far = ids.filter((id) => distance(position(ctx, id), rally) > 4 &&
    !(e.order[id] === Order.Move && e.moveState[id] !== MoveState.Idle &&
      distance({ x: e.goalX[id], y: e.goalY[id] }, rally) < 5));
  if (far.length > 0) ai.send({ type: 'move', player: ctx.player, units: far, ...rally });
}

function withdraw(ai: AiPlayer, ctx: AiContext, rally: Point, ids: number[]): void {
  const plan = ai.campaign;
  const target = plan && ai.memory.enemyBuildings.get(plan.target);
  if (plan && target) {
    ai.failedAttacks ??= new Map();
    ai.failedAttacks.set(plan.target, { x: target.x, y: target.y, tick: ctx.sim.tick, side: plan.approach?.side ?? 0 });
  }
  ai.campaign = null;
  ai.attackState = 'gather';
  ai.regroupUntil = ctx.sim.tick + 25 * ctx.sim.tickRate;
  // Incluye a los que están peleando: quedarse atacando no es una retirada.
  if (ids.length > 0) ai.send({ type: 'move', player: ctx.player, units: ids, ...rally });
}

/** Valor militar/económico; no se distrae con una granja si puede cortar la producción. */
function targetValue(type: BuildingType): number {
  const def = BUILDING_DEFS[type];
  if (def.wonder) return 100;
  if (type === BuildingType.TownCenter) return 24;
  if (type === BuildingType.SiegeWorkshop || type === BuildingType.Foundry) return 20;
  if (def.trains.length > 0 || type === BuildingType.Castle) return 16;
  if (type === BuildingType.Market || type === BuildingType.Monastery) return 12;
  if (def.dropsite.length > 0) return 10;
  if (def.wall) return 1;
  return type === BuildingType.Farm ? 2 : 5;
}

function selectTarget(ai: AiPlayer, ctx: AiContext, from: Point, army: number[], siege: number[]): number {
  let best = 0;
  let bestScore = -Infinity;
  const strength = Math.max(1, power(ctx, army, ctx.enemies));
  for (const [id, b] of ai.memory.enemyBuildings) {
    const point = center(b);
    let defenses = 0;
    // Solo edificios recordados y soldados visibles. No consulta ejércitos ocultos en la niebla.
    for (const other of ai.memory.enemyBuildings.values()) {
      const def = BUILDING_DEFS[other.type as BuildingType];
      if (def.attack && distance(point, center(other)) <= def.attack.range + def.size / 2 + 4) {
        defenses += other.type === BuildingType.Castle ? 45 : 18;
      }
    }
    const defenders = ctx.enemies.filter((enemy) => distance(position(ctx, enemy), point) <= 12);
    const risk = power(ctx, defenders, army) / strength;
    const raidBonus = isRaidingArmy(ctx, army, siege) && isEconomic(b.type as BuildingType) && defenses === 0 && risk < 0.6 ? 20 : 0;
    const score = targetValue(b.type as BuildingType) + raidBonus - distance(from, point) * 0.45 -
      defenses * (siege.length > 0 ? 0.2 : 1) - risk * 24 - (recentFailure(ai, ctx, id) ? 35 : 0);
    if (score > bestScore || (score === bestScore && id < best)) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

function isEconomic(type: BuildingType): boolean {
  return BUILDING_DEFS[type].dropsite.length > 0 && type !== BuildingType.TownCenter ||
    type === BuildingType.Farm || type === BuildingType.Market;
}

function isRaidingArmy(ctx: AiContext, army: number[], siege: number[]): boolean {
  return siege.length === 0 && army.filter((id) =>
    UNIT_DEFS[ctx.sim.entities.unitType[id] as UnitType].classes.includes('cavalry')).length >= army.length * 0.6;
}

/** Asedio a distancia: la escolta espera fuera del fuego de la fortaleza mientras se abre la brecha. */
function objective(ai: AiPlayer, ctx: AiContext, target: number, from: Point, siege: number[]): Point | null {
  const b = ai.memory.enemyBuildings.get(target);
  if (!b) return searchPoint(ai, ctx);
  const point = center(b);
  const def = BUILDING_DEFS[b.type as BuildingType];
  const reach = def.attack ? def.attack.range + def.size / 2 + 3 : 0;
  const rangedSiege = canBombard(ctx, b.type as BuildingType, siege);
  if (!reach || !rangedSiege) return point;
  const d = distance(from, point);
  if (d < 1) return point;
  const x = Math.round((point.x + (from.x - point.x) * reach / d) / FP_ONE);
  const y = Math.round((point.y + (from.y - point.y) * reach / d) / FP_ONE);
  const tile = nearestPassableTiles(ctx.sim.grid, x, y, 1)[0];
  return tile === undefined ? point : center({ x: tile % ctx.sim.grid.width, y: Math.floor(tile / ctx.sim.grid.width) });
}

function canBombard(ctx: AiContext, type: BuildingType, siege: number[]): boolean {
  const defense = BUILDING_DEFS[type].attack;
  return !!defense && siege.some((id) => (attackOf(ctx.sim, id)?.range ?? 0) / FP_ONE >= defense.range + 3);
}

export function runOffense(ai: AiPlayer, ctx: AiContext, rally: Point): void {
  const sim = ctx.sim;
  const e = sim.entities;
  ai.failedAttacks ??= new Map();
  for (const [id] of ai.failedAttacks) if (!recentFailure(ai, ctx, id)) ai.failedAttacks.delete(id);
  const army = ctx.army.filter((id) => id !== ai.explorer);
  const all = [...army, ...ctx.siege, ...ctx.monks];
  const wave = Math.max(4, Math.round((ai.diff.waveSize[ctx.era] ?? 99) * ai.strategy.aggression));
  const radius = Math.max(7, Math.ceil(Math.sqrt(all.length)));
  const ready = army.filter((id) => distance(position(ctx, id), rally) <= radius);

  // Las partidas antiguas no tienen campaña: se reúnen sin invalidar el guardado.
  if (!ai.campaign || ai.attackState === 'gather') {
    ai.campaign = null;
    ai.attackState = 'gather';
    assemble(ai, ctx, all, rally);
    if (ctx.minute < ai.diff.firstAttackMinute || sim.tick < (ai.regroupUntil ?? 0) || ready.length < wave) return;
    const support = [...ctx.siege, ...ctx.monks].filter((id) => distance(position(ctx, id), rally) <= radius);
    const members = [...ready, ...support];
    ai.campaign = {
      members, generations: new Map(members.map((id) => [id, e.generation[id]])),
      target: 0, goal: null, initialSize: ready.length, lastOrder: -Infinity,
    };
    ai.attackState = 'attack';
  }

  const plan = ai.campaign;
  const available = new Set(all);
  plan.members = plan.members.filter((id) => available.has(id) && plan.generations.get(id) === e.generation[id]);
  let deployed = army.filter((id) => plan.members.includes(id));
  if (deployed.length < Math.max(3, Math.ceil(plan.initialSize * 0.35))) {
    withdraw(ai, ctx, rally, all);
    return;
  }
  const body = mainBody(ctx, deployed);
  const nearbyEnemies = ctx.enemies.filter((id) => distance(position(ctx, id), body.point) <= 12);
  let danger = power(ctx, nearbyEnemies, body.units);
  const deployedSiege = ctx.siege.filter((id) => plan.members.includes(id));
  const besieged = ai.memory.enemyBuildings.get(plan.target);
  if (besieged && plan.goal && BUILDING_DEFS[besieged.type as BuildingType].attack &&
    distance(plan.goal, center(besieged)) > 3 && !canBombard(ctx, besieged.type as BuildingType, deployedSiege)) {
    // Si cae la artillería, no se queda esperando para siempre fuera del castillo.
    withdraw(ai, ctx, rally, all);
    return;
  }
  for (const [id, b] of ai.memory.enemyBuildings) {
    const def = BUILDING_DEFS[b.type as BuildingType];
    if (!def.attack || !sim.visibility.isVisible(ctx.player, b.x, b.y) || !e.built[id]) continue;
    if (distance(body.point, center(b)) > def.attack.range + def.size / 2 + 3) continue;
    const attack = attackOf(sim, id);
    if (attack) danger += Math.sqrt(e.hp[id] * (attack.melee + attack.pierce) * sim.tickRate /
      attack.reloadTicks) * (deployedSiege.length > 0 ? 0.25 : 1);
  }
  if (danger > power(ctx, body.units, nearbyEnemies) * 1.5 && distance(body.point, rally) > 12) {
    withdraw(ai, ctx, rally, all);
    return;
  }

  // Los refuerzos salen en destacamento. Un recluta aislado nunca recibe la orden de cruzar el mapa solo.
  const reserves = all.filter((id) => !plan.members.includes(id));
  const recruits = ready.filter((id) => !plan.members.includes(id));
  assemble(ai, ctx, reserves, rally);
  const reinforcements = recruits.length >= Math.max(3, Math.ceil(wave * 0.3))
    ? reserves.filter((id) => distance(position(ctx, id), rally) <= radius) : [];
  if (reinforcements.length > 0) {
    plan.members.push(...reinforcements);
    for (const id of reinforcements) plan.generations.set(id, e.generation[id]);
    deployed = army.filter((id) => plan.members.includes(id));
    ai.send({ type: 'attackMove', player: ctx.player, units: reinforcements, escort: true, ...body.point });
  }

  // Conserva el objetivo hasta destruirlo: los nuevos avistamientos no fragmentan la ofensiva.
  const changed = !plan.goal || (plan.target !== 0 && !ai.memory.enemyBuildings.has(plan.target));
  if (changed) {
    plan.target = selectTarget(ai, ctx, body.point, deployed, deployedSiege);
    plan.goal = objective(ai, ctx, plan.target, body.point, deployedSiege);
    plan.lastOrder = -Infinity;
    plan.approach = undefined;
    plan.progress = undefined;
    plan.raidTarget = undefined;
  } else if (plan.target === 0 && ai.memory.enemyBuildings.size > 0) {
    plan.goal = null; // El siguiente turno sustituye la búsqueda por un objetivo descubierto.
    return;
  }
  const objectivePoint = plan.goal;
  if (!objectivePoint) return;
  const fighting = deployed.some((id) => e.attackTarget[id] !== 0);
  const target = ai.memory.enemyBuildings.get(plan.target);
  const targetHp = target && sim.visibility.isVisible(ctx.player, target.x, target.y) ? e.hp[plan.target] : -1;
  const progress = plan.progress;
  if (!progress || distance(body.point, progress.point) > 2 || (targetHp >= 0 && targetHp < progress.targetHp) || fighting) {
    plan.progress = { point: body.point, tick: sim.tick, targetHp };
  } else if (sim.tick - progress.tick > 45 * sim.tickRate) {
    withdraw(ai, ctx, rally, all);
    return;
  }
  let waypointChanged = false;
  const newDefense = plan.approach && [...ai.memory.enemyBuildings].some(([id, b]) =>
    BUILDING_DEFS[b.type as BuildingType].attack && !plan.approach!.defenses.includes(id));
  if (target && (!plan.approach || (!fighting && newDefense))) {
    plan.approach = planApproach(ai, ctx, body.point, objectivePoint, deployedSiege.length > 0, recentFailure(ai, ctx, plan.target));
    plan.tactic = canBombard(ctx, target.type as BuildingType, deployedSiege) ? 'siege'
      : isRaidingArmy(ctx, deployed, deployedSiege) && isEconomic(target.type as BuildingType) ? 'raid'
      : plan.approach.side ? 'flank' : 'assault';
    waypointChanged = true;
  }
  const approach = plan.approach;
  if (approach && approach.index < approach.points.length - 1 && distance(body.point, approach.points[approach.index]) < 4) {
    approach.index++;
    waypointChanged = true;
  }
  if (waypointChanged) plan.lastOrder = -Infinity;
  const goal = approach?.points[approach.index] ?? objectivePoint;
  const elapsed = sim.tick - plan.lastOrder;
  const needsMarch = changed || waypointChanged || deployed.some((id) => e.moveState[id] === MoveState.Idle &&
    e.attackTarget[id] === 0 && distance(position(ctx, id), goal) > radius);
  if (needsMarch && elapsed >= 8 * sim.tickRate && (!fighting || changed)) {
    const marching = plan.members.filter((id) => !reinforcements.includes(id) &&
      !(e.order[id] === Order.Attack && e.orderTarget[id] === plan.target));
    // Una sola orden aprovecha la formación del motor: cuerpo a cuerpo delante, apoyo detrás y paso común.
    ai.send({ type: 'attackMove', player: ctx.player, units: marching, escort: true, ...goal });
    plan.lastOrder = sim.tick;
  }

  if (target && (!approach || approach.index === approach.points.length - 1) && sim.visibility.isVisible(ctx.player, target.x, target.y)) {
    for (const id of deployedSiege) {
      const attack = attackOf(sim, id);
      const escorted = body.units.some((soldier) => distance(position(ctx, soldier), position(ctx, id)) <= 8);
      const inPosition = distance(position(ctx, id), center(target)) <= (attack?.range ?? 0) / FP_ONE + 6;
      if (escorted && inPosition && e.orderTarget[id] !== plan.target) {
        ai.send({ type: 'attack', player: ctx.player, units: [id], target: plan.target });
      }
    }
  }
  if (plan.tactic === 'raid' && target && plan.raidTarget) {
    const worker = plan.raidTarget;
    if (!ctx.enemies.includes(worker) || !(e.mask[worker] & Comp.Worker) || distance(position(ctx, worker), center(target)) > 10) {
      const chasing = deployed.filter((id) => e.order[id] === Order.Attack && e.orderTarget[id] === worker);
      if (chasing.length > 0) ai.send({ type: 'attackMove', player: ctx.player, units: chasing, escort: true, ...goal });
      plan.raidTarget = undefined;
      plan.lastRaid = sim.tick;
    }
  }
  // La caballería que hostiga la economía prioriza a sus trabajadores, sin dividir la fuerza ni perseguirlos lejos.
  if (plan.tactic === 'raid' && target && sim.tick - (plan.lastRaid ?? -Infinity) >= 8 * sim.tickRate &&
    !nearbyEnemies.some((id) => !(e.mask[id] & Comp.Worker) && attackOf(sim, id))) {
    const workers = ctx.enemies.filter((id) => (e.mask[id] & Comp.Worker) &&
      distance(position(ctx, id), center(target)) <= 8 && distance(position(ctx, id), body.point) <= 7);
    workers.sort((a, b) => distance(position(ctx, a), body.point) - distance(position(ctx, b), body.point) || a - b);
    if (workers.length > 0 && !deployed.some((id) => workers.includes(e.attackTarget[id]))) {
      const raiders = body.units.filter((id) => UNIT_DEFS[e.unitType[id] as UnitType].classes.includes('cavalry'));
      if (raiders.length >= 3) {
        ai.send({ type: 'attack', player: ctx.player, units: raiders, target: workers[0] });
        plan.lastRaid = sim.tick;
        plan.raidTarget = workers[0];
      }
    }
  }
  // La búsqueda también avanza como un bloque; no envía cada unidad ociosa a un punto distinto.
  if (!plan.target && distance(body.point, goal) < 5 && !fighting) plan.goal = null;
}

/** Sin edificios conocidos, últimas unidades vistas o una rejilla de exploración determinista. */
function searchPoint(ai: AiPlayer, ctx: AiContext): Point | null {
  const seen = ai.memory.lastEnemy;
  if (seen && ctx.sim.tick - seen.tick < 120 * ctx.sim.tickRate &&
    !ctx.sim.visibility.isVisible(ctx.player, seen.x >> FP_SHIFT, seen.y >> FP_SHIFT)) return { x: seen.x, y: seen.y };
  if (ai.huntPoints.length === 0) {
    const w = ctx.sim.grid.width;
    const h = ctx.sim.grid.height;
    const from = seen ? { x: seen.x >> FP_SHIFT, y: seen.y >> FP_SHIFT } : { x: w >> 1, y: h >> 1 };
    for (let y = 6; y < h; y += 10) for (let x = 6; x < w; x += 10) ai.huntPoints.push([x, y]);
    ai.huntPoints.sort((a, b) => Math.abs(a[0] - from.x) + Math.abs(a[1] - from.y) -
      (Math.abs(b[0] - from.x) + Math.abs(b[1] - from.y)) || a[0] - b[0] || a[1] - b[1]);
  }
  for (let k = 0; k < ai.huntPoints.length; k++) {
    const [x, y] = ai.huntPoints[ai.armyWp++ % ai.huntPoints.length];
    if (!ctx.sim.visibility.isVisible(ctx.player, x, y)) return center({ x, y });
  }
  return seen ? { x: seen.x, y: seen.y } : null;
}
