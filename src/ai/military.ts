import { BuildingType } from '../data/buildings';
import { Stance, type UnitClass } from '../data/combat';
import { Resource } from '../data/resources';
import { UNIT_DEFS, UnitType } from '../data/units';
import { FP_SHIFT, tileCenterFixed } from '../engine/fixed';
import { garrisonCapacity } from '../sim/combat';
import { Comp, MoveState, Order } from '../sim/entities';
import { trainBlocker } from '../sim/orders';
import type { AiPlayer } from './ai-player';
import type { AiContext } from './context';

/** Edificios donde la IA entrena su ejército. */
const MILITARY: readonly BuildingType[] = [
  // El asedio primero: si no llega el oro para él, el resto del ejército espera.
  BuildingType.SiegeWorkshop,
  BuildingType.Foundry,
  BuildingType.Barracks,
  BuildingType.ArcheryRange,
  BuildingType.Stable,
  BuildingType.Castle,
];
const SCOUTS: readonly UnitType[] = [UnitType.Scout, UnitType.LightCavalry, UnitType.VeteranLightCavalry];

export function runMilitary(ai: AiPlayer, ctx: AiContext): void {
  setRallyPoints(ai, ctx);
  train(ai, ctx);
  explore(ai, ctx);
  if (ctx.threats.length > 0) {
    defend(ai, ctx);
  } else {
    attack(ai, ctx);
  }
  calmDown(ai, ctx);
}

/** Radio (casillas) alrededor del centro de la villa en el que los soldados enemigos hacen tocar a rebato. */
const BELL_RADIUS = 14;

/** Soldados enemigos (no aldeanos) cerca de algún centro de la villa propio: el peligro para los aldeanos. */
function dangerAtHome(ctx: AiContext): number[] {
  const e = ctx.sim.entities;
  const tcs = ctx.buildings[BuildingType.TownCenter].filter((b) => e.built[b]);
  return ctx.threats.filter((t) => {
    if (e.mask[t] & Comp.Worker) return false;
    const tx = e.x[t] >> FP_SHIFT;
    const ty = e.y[t] >> FP_SHIFT;
    return tcs.some((b) => Math.abs(e.tileX[b] + (e.size[b] >> 1) - tx) <= BELL_RADIUS && Math.abs(e.tileY[b] + (e.size[b] >> 1) - ty) <= BELL_RADIUS);
  });
}

/** Punto de reunión del ejército: un poco por delante del centro de la villa, hacia el centro del mapa. */
function gatherPoint(ctx: AiContext): { x: number; y: number } {
  const cx = ctx.sim.grid.width >> 1;
  const cy = ctx.sim.grid.height >> 1;
  const dx = Math.sign(cx - ctx.homeX);
  const dy = Math.sign(cy - ctx.homeY);
  return { x: tileCenterFixed(ctx.homeX + dx * 7), y: tileCenterFixed(ctx.homeY + dy * 7) };
}

function setRallyPoints(ai: AiPlayer, ctx: AiContext): void {
  const e = ctx.sim.entities;
  const p = gatherPoint(ctx);
  for (const type of MILITARY) {
    for (const b of ctx.buildings[type]) {
      if (!e.built[b] || ai.rallied.has(b)) continue;
      ai.rallied.add(b);
      ai.send({ type: 'rally', player: ctx.player, buildings: [b], x: p.x, y: p.y, target: 0 });
    }
  }
}

/** Papel de una unidad en el triángulo de contraataques. */
type Role = 'spear' | 'lightCavalry' | 'heavyCavalry' | 'skirmisherCavalry' | 'archer' | 'shock' | 'other';

function roleOf(u: UnitType): Role {
  const classes = UNIT_DEFS[u].classes;
  if (classes.includes('spear')) return 'spear';
  if (classes.includes('archer')) return 'archer';
  if (classes.includes('cavalry')) {
    if (u === UnitType.Knight || u === UnitType.Gendarme) return 'heavyCavalry';
    return u === UnitType.Jinete ? 'skirmisherCavalry' : 'lightCavalry';
  }
  if (classes.includes('infantry')) return 'shock';
  return 'other';
}

/** Cuánto conviene cada papel según la proporción de cada clase enemiga vista (>0 la contrarresta, <0 sufre). */
const COUNTERS: Readonly<Record<Role, Partial<Record<UnitClass, number>>>> = {
  spear: { cavalry: 2.5, archer: -0.8, infantry: -0.3 },
  lightCavalry: { archer: 2, siege: 2, monk: 1, spear: -2.5 },
  heavyCavalry: { archer: 1, infantry: 0.5, spear: -2 },
  skirmisherCavalry: { archer: 1.5, infantry: 1, spear: -1.5 },
  archer: { infantry: 1.5, cavalry: -1.2 },
  shock: { spear: 2, infantry: 0.3, archer: -1, cavalry: -0.5 },
  other: {},
};

/**
 * Pesos de cada unidad: los de la estrategia más los contraataques que pide lo que se ha visto del
 * enemigo, multiplicados por lo bien o mal que le va a cada papel contra ese ejército.
 */
export function unitWeights(ai: AiPlayer): Map<UnitType, number> {
  const m = ai.memory;
  const w = new Map<UnitType, number>();
  for (const [t, v] of Object.entries(ai.strategy.army)) w.set(Number(t) as UnitType, v ?? 0);
  const add = (t: UnitType, v: number) => w.set(t, (w.get(t) ?? 0) + v);
  if (m.share('cavalry') > 0.35) add(UnitType.Spearman, 3);
  if (m.share('archer') > 0.35) add(UnitType.Scout, 2);
  if (m.share('infantry') - m.share('spear') > 0.4) add(UnitType.Archer, 2);
  if (m.share('spear') > 0.3) add(UnitType.Militia, 3);
  if (m.share('siege') > 0.15) add(UnitType.Scout, 2);
  for (const [t, v] of w) {
    let factor = 1;
    for (const [c, k] of Object.entries(COUNTERS[roleOf(t)]) as [UnitClass, number][]) factor += k * m.share(c);
    w.set(t, v * Math.max(0.15, factor));
  }
  return w;
}

function train(ai: AiPlayer, ctx: AiContext): void {
  const sim = ctx.sim;
  const e = sim.entities;
  const P = ctx.player;
  if (ai.hold) return;
  // Primero la economía: hasta tener una base de aldeanos, solo una pequeña guardia (más si atacan, o ya en la era III).
  const base = Math.min(Math.round(ai.diff.villagers * 0.55), 28);
  const guard = ctx.villagers.length >= 14 ? Math.floor(ctx.villagers.length / 6) : 0;
  if (ctx.villagers.length < base && ctx.threats.length === 0 && ctx.era < 2 && ctx.army.length >= guard) return;
  const cap = 200 - ai.diff.villagers;
  if (ctx.army.length + ctx.siege.length >= cap || ctx.room <= 0) return;
  const weights = unitWeights(ai);
  // Asedio en proporción al ejército (los soldados apenas arañan los edificios), con tope por dificultad.
  let siege = ctx.siege.length;
  for (const type of [BuildingType.SiegeWorkshop, BuildingType.Foundry]) {
    for (const b of ctx.buildings[type]) for (const item of e.queue[b] ?? []) if (UNIT_DEFS[item as UnitType]?.classes.includes('siege')) siege++;
  }
  const siegeCap = ai.diff.villagers >= 80 ? 7 : ai.diff.villagers >= 55 ? 5 : 3;
  const siegeWanted = ctx.era >= 2 ? Math.min(siegeCap, 1 + Math.floor(ctx.army.length / 6)) : 0;
  // Falta asedio y hay taller: el oro se guarda para él.
  const saveGold = siege < siegeWanted && ctx.buildings[BuildingType.SiegeWorkshop].some((b) => e.built[b]);
  for (const type of MILITARY) {
    for (const b of ctx.buildings[type]) {
      if (!e.built[b] || (e.queue[b]?.length ?? 0) >= 3) continue;
      const options = (sim.stats.trainsFor(P, type) as readonly UnitType[]).filter((u: UnitType) => {
        if (trainBlocker(sim, P, u)) return false;
        const cost = sim.stats.unitCost(P, sim.stats.trainedType(P, u));
        if (UNIT_DEFS[u].classes.includes('siege')) {
          if (siege >= siegeWanted) return false;
        } else if ((weights.get(u) ?? 0) <= 0 || (saveGold && cost[Resource.Gold] > 0)) return false;
        return sim.players.canAfford(P, cost);
      });
      if (options.length === 0) continue;
      const siegeOptions = options.filter((u) => UNIT_DEFS[u].classes.includes('siege'));
      if (siegeOptions.length > 0) {
        // Arietes y trabuquetes a partes iguales; las bombardas, en la fundición.
        const pick = siegeOptions[ai.rng.nextInt(siegeOptions.length)];
        ai.send({ type: 'train', player: P, building: b, unitType: pick });
        siege++;
        continue;
      }
      let total = 0;
      for (const u of options) total += weights.get(u) ?? 0;
      let roll = ai.rng.nextFloat() * total;
      let pick = options[0];
      for (const u of options) {
        roll -= weights.get(u) ?? 0;
        if (roll <= 0) {
          pick = u;
          break;
        }
      }
      ai.send({ type: 'train', player: P, building: b, unitType: pick });
    }
  }
}

/** Puntos que visitar para encontrar al enemigo: un anillo alrededor del centro del mapa y el propio centro. */
export function waypoints(ctx: AiContext): [number, number][] {
  const w = ctx.sim.grid.width;
  const h = ctx.sim.grid.height;
  const cx = w >> 1;
  const cy = h >> 1;
  const r = Math.floor(Math.min(w, h) * 0.33);
  const d = Math.round(r * 0.7071);
  const pts: [number, number][] = [
    [cx + r, cy], [cx + d, cy + d], [cx, cy + r], [cx - d, cy + d],
    [cx - r, cy], [cx - d, cy - d], [cx, cy - r], [cx + d, cy - d], [cx, cy],
  ];
  return pts
    .filter(([x, y]) => Math.abs(x - ctx.homeX) + Math.abs(y - ctx.homeY) > 12)
    .sort((a, b) => Math.abs(a[0] - ctx.homeX) + Math.abs(a[1] - ctx.homeY) - (Math.abs(b[0] - ctx.homeX) + Math.abs(b[1] - ctx.homeY)) || a[0] - b[0] || a[1] - b[1]);
}

/** Un batidor recorre el mapa (sin pararse a pelear) para descubrir dónde está el enemigo. */
function explore(ai: AiPlayer, ctx: AiContext): void {
  const e = ctx.sim.entities;
  if (ai.waypoints.length === 0) ai.waypoints = waypoints(ctx);
  if (!e.has(ai.explorer, Comp.Unit | Comp.Position) || e.owner[ai.explorer] !== ctx.player) {
    ai.explorer = ctx.army.find((id) => SCOUTS.includes(e.unitType[id] as UnitType)) ?? 0;
    // Sin batidores (el primero ha caído) y sin saber aún dónde está el enemigo: explora el soldado más rápido.
    if (!ai.explorer && ai.memory.enemyBuildings.size === 0 && ctx.army.length > 0) {
      ai.explorer = ctx.army.reduce((best, id) => (e.speed[id] > e.speed[best] || (e.speed[id] === e.speed[best] && id < best) ? id : best), ctx.army[0]);
    }
    if (!ai.explorer) return;
    ai.send({ type: 'stance', player: ctx.player, units: [ai.explorer], stance: Stance.NoAttack });
  }
  const id = ai.explorer;
  if (e.moveState[id] !== MoveState.Idle || ai.waypoints.length === 0) return;
  const [x, y] = ai.waypoints[ai.wpIndex % ai.waypoints.length];
  ai.wpIndex++;
  ai.send({ type: 'move', player: ctx.player, units: [id], x: tileCenterFixed(x), y: tileCenterFixed(y) });
}

/** Soldados disponibles (sin el explorador). */
function soldiers(ai: AiPlayer, ctx: AiContext): number[] {
  return ctx.army.filter((id) => id !== ai.explorer);
}

function centroid(ctx: AiContext, ids: readonly number[]): { x: number; y: number } {
  const e = ctx.sim.entities;
  let x = 0;
  let y = 0;
  for (const id of ids) {
    x += e.x[id];
    y += e.y[id];
  }
  return { x: Math.round(x / ids.length), y: Math.round(y / ids.length) };
}

/** Enemigos en casa: todo el ejército a por ellos; si nos superan, los aldeanos se refugian en el centro de la villa. */
function defend(ai: AiPlayer, ctx: AiContext): void {
  const sim = ctx.sim;
  const e = sim.entities;
  ai.lastThreat = sim.tick;
  const target = centroid(ctx, ctx.threats);
  const army = soldiers(ai, ctx);
  const busy = (id: number) => e.attackTarget[id] !== 0;
  const free = army.filter((id) => !busy(id) && (e.order[id] !== Order.AttackMove || ai.thinks % 5 === 0));
  if (free.length > 0) ai.send({ type: 'attackMove', player: ctx.player, units: free, x: target.x, y: target.y });
  ai.attackState = 'gather';

  // Toque a rebato si los soldados enemigos que hay junto al centro de la villa superan claramente al ejército
  // (no por aldeanos enemigos ni por escaramuzas junto a un campamento lejano).
  const threat = dangerAtHome(ctx).length;
  if (threat >= 3 && army.length < threat * 0.8 && !ai.alarm) {
    for (const tc of ctx.buildings[BuildingType.TownCenter]) {
      if (!e.built[tc]) continue;
      const room = garrisonCapacity(sim, tc) - (sim.garrisonCount.get(tc) ?? 0);
      const near = ctx.villagers
        .filter((v) => Math.abs((e.x[v] >> FP_SHIFT) - e.tileX[tc]) < 14 && Math.abs((e.y[v] >> FP_SHIFT) - e.tileY[tc]) < 14)
        .slice(0, Math.max(0, room));
      if (near.length > 0) ai.send({ type: 'garrison', player: ctx.player, units: near, target: tc });
    }
    ai.alarm = true;
    ai.lastDanger = sim.tick;
  }
}

/**
 * Pasado el peligro, los aldeanos vuelven a trabajar: cuando lleva 15 segundos sin haber soldados enemigos
 * junto al centro de la villa, aunque sigan rondando por otros sitios (antes esperaba a que no hubiera
 * ningún enemigo cerca de ningún edificio, y a veces no salían en toda la partida).
 */
function calmDown(ai: AiPlayer, ctx: AiContext): void {
  const sim = ctx.sim;
  if (!ai.alarm) return;
  if (dangerAtHome(ctx).length > 0) {
    ai.lastDanger = sim.tick;
    return;
  }
  if (sim.tick - ai.lastDanger < 15 * sim.tickRate) return;
  const tcs = ctx.buildings[BuildingType.TownCenter].filter((b) => (sim.garrisonCount.get(b) ?? 0) > 0);
  if (tcs.length > 0) ai.send({ type: 'ungarrison', player: ctx.player, buildings: tcs });
  ai.alarm = false;
}

/** Oleadas: con suficiente ejército, a por el edificio enemigo conocido más cercano; si no se conoce ninguno, a explorar. */
function attack(ai: AiPlayer, ctx: AiContext): void {
  const sim = ctx.sim;
  const e = sim.entities;
  const army = soldiers(ai, ctx);
  const wave = Math.max(4, Math.round((ai.diff.waveSize[ctx.era] ?? 99) * ai.strategy.aggression));
  const known = [...ai.memory.enemyBuildings.values()];
  const idle = army.filter((id) => e.order[id] === Order.None && e.attackTarget[id] === 0);

  if (ai.attackState === 'gather') {
    if (ctx.minute < ai.diff.firstAttackMinute || army.length < wave) return;
    if (known.length === 0) {
      // No conocemos edificios enemigos: a donde se vio al enemigo por última vez, o a explorar.
      hunt(ai, ctx, idle);
      return;
    }
    ai.attackState = 'attack';
  }

  if (known.length === 0 && army.length >= Math.max(3, wave * 0.35)) {
    hunt(ai, ctx, idle);
    return;
  }
  if (army.length < Math.max(3, wave * 0.35) || known.length === 0) {
    // Retirada: a reagruparse en casa.
    ai.attackState = 'gather';
    const p = gatherPoint(ctx);
    const back = army.filter((id) => e.attackTarget[id] === 0);
    if (back.length > 0) ai.send({ type: 'move', player: ctx.player, units: back, x: p.x, y: p.y });
    return;
  }
  const from = army.length > 0 ? centroid(ctx, army) : { x: tileCenterFixed(ctx.homeX), y: tileCenterFixed(ctx.homeY) };
  const dist = (b: { x: number; y: number }) => {
    const dx = tileCenterFixed(b.x) - from.x;
    const dy = tileCenterFixed(b.y) - from.y;
    return dx * dx + dy * dy;
  };
  const targets = [...ai.memory.enemyBuildings].sort((a, b) => dist(a[1]) - dist(b[1]) || a[0] - b[0]);
  if (targets.length === 0) return;
  // Sin defensores a la vista, el ejército se reparte en grupos de 6 para derribar varios edificios a la vez.
  const groups = ctx.enemies.length < 3 ? Math.max(1, Math.min(targets.length, Math.floor(idle.length / 6))) : 1;
  for (let g = 0; g < groups; g++) {
    const units = groups === 1 ? idle : idle.filter((_, i) => i % groups === g);
    const t = targets[g][1];
    if (units.length > 0) ai.send({ type: 'attackMove', player: ctx.player, units, x: tileCenterFixed(t.x), y: tileCenterFixed(t.y) });
  }
  // El asedio, directo a los edificios (repartido igual que el ejército).
  const siegeTargets = ctx.enemies.length < 3 ? Math.min(targets.length, Math.max(1, ctx.siege.length)) : 1;
  ctx.siege.forEach((id, i) => {
    const current = e.orderTarget[id] || e.attackTarget[id];
    if (current && e.isAlive(current) && ai.memory.enemyBuildings.has(current)) return; // ya va a por uno
    const best = targets[i % siegeTargets][0];
    if (e.isAlive(best)) ai.send({ type: 'attack', player: ctx.player, units: [id], target: best });
  });
  // Los monjes acompañan al ejército para curar.
  const monks = ctx.monks.filter((id) => e.moveState[id] === MoveState.Idle && e.attackTarget[id] === 0);
  if (monks.length > 0 && army.length > 0) {
    const c = centroid(ctx, army);
    ai.send({ type: 'move', player: ctx.player, units: monks, x: c.x, y: c.y });
  }
}

/** Sin edificios enemigos conocidos: a por las últimas unidades vistas, o recorrer el mapa buscándolas. */
function hunt(ai: AiPlayer, ctx: AiContext, idle: readonly number[]): void {
  if (idle.length === 0 || ai.thinks % 2 !== 0) return;
  const seen = ai.memory.lastEnemy;
  if (seen && ctx.sim.tick - seen.tick < 120 * ctx.sim.tickRate) {
    ai.send({ type: 'attackMove', player: ctx.player, units: idle, x: seen.x, y: seen.y });
    return;
  }
  // Recorre una rejilla que cubre todo el mapa, empezando por donde se vio al enemigo, saltando lo que ya se ve.
  if (ai.huntPoints.length === 0) {
    const w = ctx.sim.grid.width;
    const h = ctx.sim.grid.height;
    const from = seen ? { x: seen.x >> FP_SHIFT, y: seen.y >> FP_SHIFT } : { x: w >> 1, y: h >> 1 };
    for (let y = 6; y < h; y += 10) for (let x = 6; x < w; x += 10) ai.huntPoints.push([x, y]);
    ai.huntPoints.sort((a, b) => Math.abs(a[0] - from.x) + Math.abs(a[1] - from.y) - (Math.abs(b[0] - from.x) + Math.abs(b[1] - from.y)) || a[0] - b[0] || a[1] - b[1]);
  }
  const vis = ctx.sim.visibility;
  for (let k = 0; k < ai.huntPoints.length; k++) {
    const [x, y] = ai.huntPoints[ai.armyWp % ai.huntPoints.length];
    ai.armyWp++;
    if (vis.isVisible(ctx.player, x, y)) continue;
    ai.send({ type: 'attackMove', player: ctx.player, units: idle, x: tileCenterFixed(x), y: tileCenterFixed(y) });
    return;
  }
}
