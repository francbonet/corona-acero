import { BUILDING_DEFS, BuildingType } from '../data/buildings';
import { NodeType } from '../data/nodes';
import { RESOURCE_COUNT, Resource } from '../data/resources';
import { TECH_DEFS, TechType } from '../data/techs';
import { UNIT_DEFS, UnitType } from '../data/units';
import { FP_ONE, FP_SHIFT, fixedLength } from '../engine/fixed';
import { Comp } from '../sim/entities';
import { repairPrice } from '../sim/systems/construction';
import { findNode, needsBuilder } from '../sim/systems/workers';
import { researchBlocker } from '../sim/tech';
import { nearestDropsite } from '../sim/world';
import type { AiPlayer } from './ai-player';
import type { AiContext } from './context';
import { unitWeights } from './military';
import { findSpot } from './placement';

const ADVANCES: readonly TechType[] = [TechType.AdvanceBurgos, TechType.AdvanceCoronas, TechType.AdvancePolvora];

/** Edificios que cuentan para avanzar desde cada era, en orden de preferencia. */
const ERA_BUILDINGS: readonly (readonly BuildingType[])[] = [
  [BuildingType.Mill, BuildingType.LumberCamp, BuildingType.Barracks, BuildingType.MiningCamp],
  [BuildingType.Blacksmith, BuildingType.Market, BuildingType.ArcheryRange, BuildingType.Stable],
  [BuildingType.University, BuildingType.SiegeWorkshop, BuildingType.Monastery, BuildingType.Castle],
];

/** Tecnologías por orden de prioridad; cada dificultad llega hasta una parte de la lista. */
const TECH_PRIORITY: readonly TechType[] = [
  TechType.IronAxes,
  TechType.Fallow,
  TechType.GoldShafts,
  TechType.ManAtArms,
  TechType.LightCavalry,
  TechType.Forging,
  TechType.Fletching,
  TechType.PaddedArmor,
  TechType.Angarillas,
  TechType.Crossbowman,
  TechType.Pikeman,
  TechType.WaterSawmill,
  TechType.WaterMill,
  TechType.Tempering,
  TechType.MailArmor,
  TechType.TemperedBolts,
  TechType.Mesta,
  TechType.Stakes,
  TechType.GothicMasonry,
  TechType.StoneWedges,
  TechType.OxCart,
  TechType.Swordsman,
  TechType.VeteranLightCavalry,
  TechType.ArcFire,
  TechType.HeavyKnight,
  TechType.ToledoSteel,
  TechType.PlateArmor,
  TechType.CropRotation,
  TechType.Halberdier,
  TechType.Paveser,
  TechType.VeteranSwordsman,
  TechType.Gambeson,
];

/** Edificios cuyas tecnologías son de economía. */
const ECONOMIC_BUILDINGS: readonly BuildingType[] = [
  BuildingType.TownCenter,
  BuildingType.Mill,
  BuildingType.LumberCamp,
  BuildingType.MiningCamp,
  BuildingType.Market,
];

/** Fuentes de comida "naturales" que se prefieren antes que las granjas. */
const WILD_FOOD = [NodeType.Carcass, NodeType.Deer, NodeType.Berries];

export function runEconomy(ai: AiPlayer, ctx: AiContext): void {
  trainVillagers(ai, ctx);
  buildHouses(ai, ctx);
  advanceEra(ai, ctx);
  followBuildOrder(ai, ctx);
  buildDropsites(ai, ctx);
  if (ai.thinks % 6 === 0) finishFoundations(ai, ctx);
  if (ai.thinks % 4 === 2) repairBuildings(ai, ctx);
  assignIdle(ai, ctx);
  if (ai.thinks % 10 === 0) rebalance(ai, ctx);
  if (ai.thinks % 5 === 0) useMarket(ai, ctx);
  researchTechs(ai, ctx);
}

/** Mercado: vende lo que sobra (piedra, oro de más) y compra la comida o madera que falte. */
function useMarket(ai: AiPlayer, ctx: AiContext): void {
  const sim = ctx.sim;
  const P = ctx.player;
  if (!ctx.buildings[BuildingType.Market].some((b) => sim.entities.built[b])) return;
  const stock = (r: Resource) => sim.players.get(P, r);
  const price = (r: Resource) => sim.players.prices[P * 3 + r];
  for (const r of [Resource.Food, Resource.Wood]) {
    if (stock(r) < 150 && stock(Resource.Gold) > price(r) + 400) {
      ai.send({ type: 'market', player: P, resource: r, buy: true });
      return;
    }
  }
  // Sin oro (o con las minas agotadas): vende lo que sobra, empezando por lo que más se acumula.
  const surplus = [Resource.Food, Resource.Wood, Resource.Stone].sort((a, b) => stock(b) - stock(a) || a - b);
  for (const r of surplus) {
    const limit = r === Resource.Stone ? (ctx.buildings[BuildingType.Castle].length > 0 ? 300 : 900) : 700;
    if (stock(r) > limit && (stock(Resource.Gold) < 300 || stock(r) > 2 * limit)) {
      ai.send({ type: 'market', player: P, resource: r, buy: false });
      return;
    }
  }
}

// ── Aldeanos y casas ────────────────────────────────────────────────────

function trainVillagers(ai: AiPlayer, ctx: AiContext): void {
  const sim = ctx.sim;
  const e = sim.entities;
  if (ai.hold || ctx.villagers.length >= ai.diff.villagers) return;
  for (const tc of ctx.buildings[BuildingType.TownCenter]) {
    if (!e.built[tc] || (e.queue[tc]?.length ?? 0) >= 2) continue;
    if (!sim.players.canAfford(ctx.player, sim.stats.unitCost(ctx.player, UnitType.Villager))) return;
    ai.send({ type: 'train', player: ctx.player, building: tc, unitType: UnitType.Villager });
  }
}

function buildHouses(ai: AiPlayer, ctx: AiContext): void {
  const sim = ctx.sim;
  if (sim.players.popCap[ctx.player] >= 200) return;
  const producers = ctx.buildings.flat().filter((b) => sim.entities.has(b, Comp.Producer) && sim.entities.built[b]).length;
  const pending = ctx.buildings[BuildingType.House].filter((b) => !sim.entities.built[b]).length;
  if (ctx.room > 3 + 2 * Math.min(4, producers) || pending >= (ctx.villagers.length > 25 ? 2 : 1)) return;
  // Con la base llena, más lejos.
  // Las primeras, cerca; luego fuera del anillo de las granjas. Con la base llena, más lejos.
  const inner = ctx.buildings[BuildingType.House].length < 4 ? 5 : 10;
  const spot =
    findSpot(sim, BuildingType.House, ctx.homeX, ctx.homeY, { margin: 1, minRadius: inner, maxRadius: 20, avoidResources: true }) ??
    findSpot(sim, BuildingType.House, ctx.homeX, ctx.homeY, { margin: 0, minRadius: 10, maxRadius: 30, avoidResources: false });
  if (spot) ai.build(ctx, BuildingType.House, spot);
}

// ── Eras y orden de construcción ────────────────────────────────────────

/** Avanza de era cuando toca: construye los edificios que falten y ahorra comida (sin aldeanos) si hace falta. */
function advanceEra(ai: AiPlayer, ctx: AiContext): void {
  const sim = ctx.sim;
  const P = ctx.player;
  ai.hold = false;
  const tech = ADVANCES[ctx.era];
  if (tech === undefined || ctx.era >= ai.diff.maxEra || sim.players.isResearching(P, tech)) return;
  const wanted = Math.min(ai.strategy.advanceAt[ctx.era], ai.diff.villagers - 2);
  if (ctx.villagers.length < wanted) return;
  const blocker = researchBlocker(sim, P, tech);
  if (blocker === null) {
    if (sim.players.canAfford(P, TECH_DEFS[tech].cost)) {
      const tc = ctx.buildings[BuildingType.TownCenter].find((b) => sim.entities.built[b] && (sim.entities.queue[b]?.length ?? 0) <= 2);
      if (tc) ai.send({ type: 'research', player: P, building: tc, tech });
    } else {
      ai.hold = true;
    }
    return;
  }
  // Faltan edificios de la era actual: el primero que no tengamos.
  for (const type of ERA_BUILDINGS[ctx.era] ?? []) {
    if (ctx.buildings[type].length > 0) continue;
    if (sim.players.era[P] < (BUILDING_DEFS[type].era ?? 0)) continue;
    const req = BUILDING_DEFS[type].requires;
    if (req !== undefined && !ctx.buildings[req].some((b) => sim.entities.built[b])) continue;
    if (placeForType(ai, ctx, type)) return;
  }
}

function followBuildOrder(ai: AiPlayer, ctx: AiContext): void {
  const sim = ctx.sim;
  for (const step of ai.strategy.build) {
    if ((step.villagers ?? 0) > ctx.villagers.length || (step.era ?? 0) > ctx.era) continue;
    if (ctx.buildings[step.building].length >= (step.count ?? 1)) continue;
    const def = BUILDING_DEFS[step.building];
    if (def.requires !== undefined && !ctx.buildings[def.requires].some((b) => sim.entities.built[b])) continue;
    if (placeForType(ai, ctx, step.building)) return;
    return; // de uno en uno, por orden
  }
  // Más edificios militares cuanto mayor es la economía (del tipo que entrena la unidad principal).
  const military = [BuildingType.Barracks, BuildingType.ArcheryRange, BuildingType.Stable];
  const have = military.reduce((n, t) => n + ctx.buildings[t].length, 0);
  const wanted = ctx.era >= 1 ? Math.min(5, 2 + Math.floor(Math.max(0, ctx.villagers.length - 30) / 12)) : 1;
  if (have < wanted && sim.players.get(ctx.player, Resource.Wood) > 250) {
    const main = mainBuilding(ai, ctx);
    if (main !== undefined && placeForType(ai, ctx, main)) return;
  }
  // Segundo centro de la villa (media y difícil) para producir más aldeanos.
  if (ai.diff.villagers >= 50 && ctx.era >= 1 && ctx.villagers.length >= 32 && ctx.buildings[BuildingType.TownCenter].length < 2) {
    placeForType(ai, ctx, BuildingType.TownCenter);
  }
}

/**
 * Edificio militar que más falta: el que entrena las unidades con más peso ahora mismo (estrategia y
 * contraataques), repartido entre los que ya hay de ese tipo.
 */
function mainBuilding(ai: AiPlayer, ctx: AiContext): BuildingType | undefined {
  const weights = unitWeights(ai);
  let best: BuildingType | undefined;
  let bestScore = 0;
  for (const t of [BuildingType.Barracks, BuildingType.ArcheryRange, BuildingType.Stable]) {
    if ((BUILDING_DEFS[t].era ?? 0) > ctx.era) continue;
    let sum = 0;
    for (const u of BUILDING_DEFS[t].trains) if ((UNIT_DEFS[u].era ?? 0) <= ctx.era) sum += weights.get(u) ?? 0;
    const score = sum / (1 + ctx.buildings[t].length);
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

/** Coloca un edificio donde tenga sentido: puntos de entrega junto a su recurso; el resto, cerca de casa. */
export function placeForType(ai: AiPlayer, ctx: AiContext, type: BuildingType): boolean {
  const sim = ctx.sim;
  if (!sim.players.canAfford(ctx.player, sim.stats.buildingCost(ctx.player, type))) return false;
  let spot: [number, number] | null = null;
  const nearNode = (types: number[]) => {
    const v = ctx.villagers[0];
    if (!v || !ctx.home) return 0;
    return findNode(sim, v, types, sim.entities.x[ctx.home], sim.entities.y[ctx.home], 30, 0);
  };
  if (type === BuildingType.LumberCamp || type === BuildingType.MiningCamp || type === BuildingType.Mill) {
    const types = type === BuildingType.LumberCamp ? [NodeType.Tree] : type === BuildingType.MiningCamp ? [NodeType.Gold, NodeType.Stone] : [NodeType.Berries];
    // El segundo aserradero, junto a otro bosque (lejos del primero).
    const node = nearNode(types);
    if (node) spot = findSpot(sim, type, sim.entities.tileX[node], sim.entities.tileY[node], { margin: 0, minRadius: 1, maxRadius: 6 });
    if (!spot && type === BuildingType.Mill) spot = findSpot(sim, type, ctx.homeX, ctx.homeY, { margin: 1, minRadius: 4, maxRadius: 14 });
  } else if (type === BuildingType.TownCenter) {
    const gold = nearNode([NodeType.Gold]);
    const x = gold ? sim.entities.tileX[gold] : ctx.homeX + 10;
    const y = gold ? sim.entities.tileY[gold] : ctx.homeY;
    spot = findSpot(sim, type, x, y, { margin: 1, minRadius: 4, maxRadius: 16, avoidResources: true });
  } else {
    const size = BUILDING_DEFS[type].size;
    // Fuera del anillo de las granjas.
    spot = findSpot(sim, type, ctx.homeX, ctx.homeY, { margin: 1, minRadius: 10 + (size >> 1), maxRadius: 24, avoidResources: true });
  }
  return spot !== null && ai.build(ctx, type, spot);
}

/** Puntos de entrega nuevos cuando los recolectores tienen que andar demasiado. */
function buildDropsites(ai: AiPlayer, ctx: AiContext): void {
  if (ai.thinks % 4 !== 0) return;
  const sim = ctx.sim;
  const e = sim.entities;
  const pairs: [Resource, BuildingType][] = [
    [Resource.Wood, BuildingType.LumberCamp],
    [Resource.Gold, BuildingType.MiningCamp],
    [Resource.Stone, BuildingType.MiningCamp],
  ];
  for (const [r, type] of pairs) {
    if (ctx.buildings[type].some((b) => !e.built[b])) continue;
    const far = ctx.gatherers[r].filter((v) => {
      const node = e.homeNode[v];
      if (!e.isAlive(node)) return false;
      const site = nearestDropsite(sim, ctx.player, r, e.x[node], e.y[node]);
      return !site || fixedLength(e.x[site] - e.x[node], e.y[site] - e.y[node]) > 7 * FP_ONE;
    });
    if (far.length < 3) continue;
    const node = e.homeNode[far[0]];
    const spot = findSpot(sim, type, e.x[node] >> FP_SHIFT, e.y[node] >> FP_SHIFT, { margin: 0, minRadius: 1, maxRadius: 6 });
    if (spot && ai.build(ctx, type, spot)) return;
  }
}

/** Cimientos sin nadie trabajando en ellos: mandar a un aldeano. */
function finishFoundations(ai: AiPlayer, ctx: AiContext): void {
  const e = ctx.sim.entities;
  for (const b of ctx.buildings.flat()) {
    if (e.built[b] || ctx.builders.some((v) => e.taskTarget[v] === b)) continue;
    const v = ai.takeWorker(ctx);
    if (!v) return;
    ai.send({ type: 'construct', player: ctx.player, units: [v], target: b, queue: false });
  }
}

/** Edificios clave: se reparan antes (con menos daño) y con más aldeanos. */
const KEY_BUILDINGS: ReadonlySet<BuildingType> = new Set([BuildingType.TownCenter, BuildingType.Castle, BuildingType.WatchTower]);
/** Casillas alrededor de un edificio en las que un enemigo impide repararlo (los aldeanos morirían). */
const REPAIR_SAFE_RADIUS = 6;
/** Vida de prueba para ver si se puede pagar la reparación. */
const REPAIR_PROBE_HP = 50;

/**
 * Repara los edificios dañados que no estén en pleno combate: los clave (centro de la villa, castillo, torres)
 * por debajo del 85 % de vida y con hasta 3 aldeanos (1 en las torres), el resto por debajo del 70 % con uno.
 */
function repairBuildings(ai: AiPlayer, ctx: AiContext): void {
  const sim = ctx.sim;
  const e = sim.entities;
  const damaged = ctx.buildings
    .flat()
    .filter((b) => {
      if (!needsBuilder(sim, b) || !e.built[b]) return false;
      const key = KEY_BUILDINGS.has(e.buildingType[b] as BuildingType);
      return e.hp[b] * 100 < e.maxHp[b] * (key ? 85 : 70);
    })
    .sort((a, b) => priorityOf(e.buildingType[a]) - priorityOf(e.buildingType[b]) || e.hp[a] * e.maxHp[b] - e.hp[b] * e.maxHp[a] || a - b);
  for (const b of damaged) {
    const size = e.size[b];
    const near = ctx.threats.some((t) => {
      const tx = e.x[t] >> FP_SHIFT;
      const ty = e.y[t] >> FP_SHIFT;
      return tx >= e.tileX[b] - REPAIR_SAFE_RADIUS && tx < e.tileX[b] + size + REPAIR_SAFE_RADIUS && ty >= e.tileY[b] - REPAIR_SAFE_RADIUS && ty < e.tileY[b] + size + REPAIR_SAFE_RADIUS;
    });
    if (near) continue;
    const probe = repairPrice(sim, b, e.repairDone[b], Math.min(REPAIR_PROBE_HP, e.maxHp[b] - e.hp[b]));
    if (!sim.players.canAfford(ctx.player, probe)) continue;
    const type = e.buildingType[b] as BuildingType;
    const wanted = type === BuildingType.TownCenter || type === BuildingType.Castle ? 3 : 1;
    let crew = ctx.builders.filter((v) => e.taskTarget[v] === b).length;
    while (crew < wanted) {
      const v = ai.takeWorker(ctx);
      if (!v) return;
      ai.send({ type: 'construct', player: ctx.player, units: [v], target: b, queue: false });
      ctx.builders.push(v);
      crew++;
    }
  }
}

function priorityOf(type: number): number {
  if (type === BuildingType.TownCenter) return 0;
  if (type === BuildingType.Castle) return 1;
  return KEY_BUILDINGS.has(type as BuildingType) ? 2 : 3;
}

// ── Reparto de aldeanos ─────────────────────────────────────────────────

/** Proporción deseada de recolectores por recurso según la era (y si hay que juntar piedra para un castillo). */
function desiredRatios(ai: AiPlayer, ctx: AiContext): number[] {
  if (ctx.era === 0) return ctx.villagers.length < 14 ? [0.6, 0.4, 0, 0] : [0.52, 0.38, 0, 0.1];
  if (ctx.era === 1) return [0.45, 0.33, 0.05, 0.17];
  const castle = ai.strategy.build.some((s) => s.building === BuildingType.Castle) && ctx.buildings[BuildingType.Castle].length === 0;
  return castle ? [0.38, 0.28, 0.12, 0.22] : [0.4, 0.3, 0.08, 0.22];
}

/**
 * Déficit de recolectores por recurso. Las proporciones base se corrigen con lo que hay en el almacén:
 * lo que escasea pide más gente y lo que se acumula, menos.
 */
function deficits(ai: AiPlayer, ctx: AiContext): number[] {
  const base = desiredRatios(ai, ctx);
  const stock = [0, 1, 2, 3].map((r) => ctx.sim.players.get(ctx.player, r as Resource));
  const adjusted = base.map((ratio, r) => {
    if (ratio === 0) return 0;
    const s = stock[r];
    return ratio * (s < 150 ? 1.5 : s > 1200 ? 0.25 : s > 600 ? 0.6 : 1);
  });
  const total = adjusted.reduce((a, b) => a + b, 0) || 1;
  const n = ctx.villagers.length;
  return adjusted.map((ratio, r) => (ratio / total) * n - ctx.gatherers[r].length);
}

/** Manda a un aldeano a recolectar el recurso `r`. Devuelve si encontró algo que hacer. */
function sendTo(ai: AiPlayer, ctx: AiContext, v: number, r: Resource): boolean {
  const sim = ctx.sim;
  const e = sim.entities;
  if (!ctx.home) return false;
  const hx = e.x[ctx.home];
  const hy = e.y[ctx.home];
  let node = 0;
  if (r === Resource.Food) {
    node = findNode(sim, v, WILD_FOOD, hx, hy, 16, 0) || findNode(sim, v, [NodeType.Farm], hx, hy, 30, 0);
    if (!node) return newFarm(ai, ctx, v);
  } else {
    const type = r === Resource.Wood ? NodeType.Tree : r === Resource.Gold ? NodeType.Gold : NodeType.Stone;
    const camps = ctx.buildings[r === Resource.Wood ? BuildingType.LumberCamp : BuildingType.MiningCamp].filter((b) => e.built[b]);
    const from = camps.length > 0 ? camps[ai.thinks % camps.length] : ctx.home;
    node = findNode(sim, v, [type], e.x[from], e.y[from], 40, 0);
  }
  if (!node) return false;
  ai.send({ type: 'gather', player: ctx.player, units: [v], target: node });
  ctx.gatherers[r].push(v);
  return true;
}

/** Granja nueva junto a un centro de la villa o un molino; si no cabe ninguna, un molino nuevo más allá. */
function newFarm(ai: AiPlayer, ctx: AiContext, v: number): boolean {
  const sim = ctx.sim;
  const e = sim.entities;
  const P = ctx.player;
  const mills = ctx.buildings[BuildingType.Mill];
  if (!mills.some((b) => e.built[b]) || !sim.players.canAfford(P, sim.stats.buildingCost(P, BuildingType.Farm))) return false;
  const sites = [...ctx.buildings[BuildingType.TownCenter], ...mills].filter((b) => e.built[b]);
  for (const b of sites) {
    const spot = findSpot(sim, BuildingType.Farm, e.tileX[b] + (e.size[b] >> 1), e.tileY[b] + (e.size[b] >> 1), { margin: 0, minRadius: 2, maxRadius: 9 });
    if (!spot) continue;
    ai.send({ type: 'build', player: P, units: [v], buildingType: BuildingType.Farm, tileX: spot[0], tileY: spot[1], queue: false });
    return true;
  }
  if (mills.some((b) => !e.built[b]) || !sim.players.canAfford(P, sim.stats.buildingCost(P, BuildingType.Mill))) return false;
  const spot = findSpot(sim, BuildingType.Mill, ctx.homeX, ctx.homeY, { margin: 4, minRadius: 12, maxRadius: 28, avoidResources: true });
  if (!spot) return false;
  ai.send({ type: 'build', player: P, units: [v], buildingType: BuildingType.Mill, tileX: spot[0], tileY: spot[1], queue: false });
  return true;
}

function assignIdle(ai: AiPlayer, ctx: AiContext): void {
  for (const v of ctx.idle.slice()) {
    if (ai.reserved.has(v)) continue;
    const d = deficits(ai, ctx);
    const order = [0, 1, 2, 3].sort((a, b) => d[b] - d[a] || a - b) as Resource[];
    for (const r of order) if (sendTo(ai, ctx, v, r)) break;
  }
}

/** Cada cierto tiempo, pasa un aldeano del recurso que más sobra al que más falta. */
function rebalance(ai: AiPlayer, ctx: AiContext): void {
  const d = deficits(ai, ctx);
  let from = -1;
  let to = -1;
  for (let r = 0; r < RESOURCE_COUNT; r++) {
    if (from < 0 || d[r] < d[from]) from = r;
    if (to < 0 || d[r] > d[to]) to = r;
  }
  if (from < 0 || to < 0 || d[from] > -2.5 || d[to] < 2.5) return;
  const v = ctx.gatherers[from][ctx.gatherers[from].length - 1];
  if (v) sendTo(ai, ctx, v, to as Resource);
}

// ── Tecnologías ─────────────────────────────────────────────────────────

function researchTechs(ai: AiPlayer, ctx: AiContext): void {
  if (ai.hold || ai.thinks % 3 !== 0) return;
  const sim = ctx.sim;
  const e = sim.entities;
  const limit = Math.ceil(TECH_PRIORITY.length * ai.diff.techDepth);
  // Las mejoras militares, solo con un ejército que mejorar (antes, todo a aldeanos y soldados).
  const military = ctx.army.length >= (ctx.era >= 2 ? 8 : 12);
  for (const tech of TECH_PRIORITY.slice(0, limit)) {
    const def = TECH_DEFS[tech];
    if (!military && !ECONOMIC_BUILDINGS.includes(def.building)) continue;
    if (researchBlocker(sim, ctx.player, tech) !== null || !sim.players.canAfford(ctx.player, def.cost)) continue;
    // Las mejoras de línea solo si esa línea forma parte del ejército de la estrategia.
    const up = def.effects.find((m) => m.kind === 'upgrade');
    if (up && up.kind === 'upgrade' && !lineInArmy(ai, up.from)) continue;
    const building = ctx.buildings[def.building].find((b) => e.built[b] && (e.queue[b]?.length ?? 0) === 0);
    if (!building) continue;
    ai.send({ type: 'research', player: ctx.player, building, tech });
    return;
  }
}

/** ¿La estrategia usa esa línea de unidades (o alguna que mejore hasta ella)? */
function lineInArmy(ai: AiPlayer, type: UnitType): boolean {
  const roots: Partial<Record<UnitType, UnitType>> = {
    [UnitType.ManAtArms]: UnitType.Militia,
    [UnitType.Swordsman]: UnitType.Militia,
    [UnitType.Pikeman]: UnitType.Spearman,
    [UnitType.Crossbowman]: UnitType.Archer,
    [UnitType.LightCavalry]: UnitType.Scout,
  };
  const root = roots[type] ?? type;
  return (ai.strategy.army[root] ?? 0) > 0 || root === UnitType.Scout;
}

