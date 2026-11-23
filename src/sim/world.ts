import { BUILDING_DEFS, BuildingType } from '../data/buildings';
import { NODE_DEFS, NodeType } from '../data/nodes';
import { Resource } from '../data/resources';
import { UNIT_DEFS, UnitType } from '../data/units';
import { FP_ONE, FP_SHIFT, fixedLength, tileCenterFixed, toFixed } from '../engine/fixed';
import { TECH_DEFS } from '../data/techs';
import { Comp, MoveState, Task } from './entities';
import { isTechItem } from './tech';
import { nearestPassableTiles } from './slots';
import type { Simulation } from './simulation';
import { stopUnit } from './systems/movement';

/**
 * Operaciones sobre el mundo de la simulación: crear y destruir entidades, ocupar la rejilla y
 * calcular distancias a objetivos. Las usan los sistemas y las órdenes.
 */

/** Alcance para recolectar o construir: distancia máxima de la unidad a la huella del objetivo (¾ de casilla). */
export const WORK_REACH = 192;

// ── Creación ────────────────────────────────────────────────────────────

export function spawnUnit(sim: Simulation, type: UnitType, owner: number, x: number, y: number): number {
  const def = UNIT_DEFS[type];
  const stats = sim.stats.unit(owner, type);
  const e = sim.entities;
  let mask = Comp.Position | Comp.Unit | Comp.Mover;
  if (def.worker) mask |= Comp.Worker;
  if (def.food) mask |= Comp.Resource;
  const id = e.create(mask);
  e.x[id] = e.prevX[id] = x;
  e.y[id] = e.prevY[id] = y;
  e.owner[id] = owner;
  e.unitType[id] = type;
  e.radius[id] = toFixed(def.radius);
  e.speed[id] = stats.speed;
  e.hp[id] = e.maxHp[id] = stats.hp;
  e.moveState[id] = MoveState.Idle;
  e.stance[id] = def.stance;
  e.los[id] = stats.los;
  e.orderX[id] = x;
  e.orderY[id] = y;
  if (def.food) {
    e.nodeType[id] = type === UnitType.Deer ? NodeType.Deer : type === UnitType.Boar ? NodeType.Boar : NodeType.Sheep;
    e.resKind[id] = Resource.Food;
    e.resAmount[id] = def.food;
  }
  return id;
}

/** Fuente fija de una casilla (árbol, bayas, mina): ocupa y bloquea su casilla. */
export function createNode(sim: Simulation, type: NodeType, tx: number, ty: number, variant = 0): number {
  if (type === NodeType.None) throw new Error('Tipo de fuente no válido');
  const def = NODE_DEFS[type];
  const e = sim.entities;
  const id = e.create(Comp.Position | Comp.Resource);
  e.x[id] = e.prevX[id] = tileCenterFixed(tx);
  e.y[id] = e.prevY[id] = tileCenterFixed(ty);
  e.tileX[id] = tx;
  e.tileY[id] = ty;
  e.size[id] = 1;
  e.nodeType[id] = type;
  e.resKind[id] = def.resource;
  e.resAmount[id] = def.amount;
  e.variant[id] = variant;
  sim.grid.occupy(tx, ty, 1, id, true);
  return id;
}

/** Tipos de edificio con cola propia: los que entrenan unidades o investigan algo (y el castillo). */
const PRODUCER_TYPES: ReadonlySet<number> = new Set([
  ...Object.entries(BUILDING_DEFS)
    .filter(([, d]) => d.trains.length > 0)
    .map(([t]) => Number(t)),
  ...Object.values(TECH_DEFS).map((t) => t.building as number),
  BuildingType.Castle,
]);

/** Coloca un edificio con su huella en (ox, oy). Si `built`, ya está terminado (escenarios). */
export function createBuilding(sim: Simulation, type: BuildingType, owner: number, ox: number, oy: number, built: boolean): number {
  const def = BUILDING_DEFS[type];
  const e = sim.entities;
  let mask = Comp.Position | Comp.Building;
  if (PRODUCER_TYPES.has(type)) mask |= Comp.Producer;
  if (def.food) mask |= Comp.Resource;
  const id = e.create(mask);
  const half = (def.size * FP_ONE) >> 1;
  e.x[id] = e.prevX[id] = (ox << FP_SHIFT) + half;
  e.y[id] = e.prevY[id] = (oy << FP_SHIFT) + half;
  e.tileX[id] = ox;
  e.tileY[id] = oy;
  e.size[id] = def.size;
  e.owner[id] = owner;
  e.buildingType[id] = type;
  const maxHp = sim.stats.building(owner, type).hp;
  e.maxHp[id] = maxHp;
  e.hp[id] = built ? maxHp : 1;
  e.built[id] = built ? 1 : 0;
  e.buildProgress[id] = built ? buildTotal(sim, type) : 0;
  e.los[id] = def.los;
  if (def.food) {
    e.nodeType[id] = NodeType.Farm;
    e.resKind[id] = Resource.Food;
    e.resAmount[id] = sim.stats.farmFood(owner);
  }
  sim.grid.occupy(ox, oy, def.size, id, def.blocks, def.gate ? owner : 0);
  if (def.blocks) evictUnits(sim, ox, oy, def.size);
  return id;
}

/** Trabajo total para terminar un edificio (ticks de un aldeano × 256). */
export function buildTotal(sim: Simulation, type: BuildingType): number {
  return BUILDING_DEFS[type].buildTime * sim.tickRate * FP_ONE;
}

/** Saca a las unidades que se han quedado dentro de una huella nueva. */
function evictUnits(sim: Simulation, ox: number, oy: number, size: number): void {
  const e = sim.entities;
  for (let id = 1; id < e.highWater; id++) {
    if ((e.mask[id] & (Comp.Unit | Comp.Mover)) !== (Comp.Unit | Comp.Mover)) continue;
    const tx = e.x[id] >> FP_SHIFT;
    const ty = e.y[id] >> FP_SHIFT;
    if (tx < ox || ty < oy || tx >= ox + size || ty >= oy + size) continue;
    const free = nearestPassableTiles(sim.grid, tx, ty, 1)[0];
    if (free === undefined) continue;
    const fx = tileCenterFixed(free % sim.grid.width);
    const fy = tileCenterFixed(Math.floor(free / sim.grid.width));
    if (e.task[id] === Task.None) {
      // Sin tarea: sale andando.
      e.goalX[id] = fx;
      e.goalY[id] = fy;
      sim.pathing.request(id);
    } else {
      // Con tarea: se le recoloca para que siga trabajando desde fuera.
      e.x[id] = e.prevX[id] = fx;
      e.y[id] = e.prevY[id] = fy;
      stopUnit(e, id);
    }
  }
}

// ── Destrucción ─────────────────────────────────────────────────────────

/** Elimina una entidad y libera su huella. */
export function removeEntity(sim: Simulation, id: number): void {
  const e = sim.entities;
  if (!e.isAlive(id)) return;
  if (e.size[id] > 0 && (e.mask[id] & (Comp.Building | Comp.Resource)) !== 0) {
    sim.grid.release(e.tileX[id], e.tileY[id], e.size[id]);
  }
  e.destroy(id);
}

/** Una oveja sacrificada deja de ser unidad y queda como fuente de comida inmóvil. */
export function slaughter(sim: Simulation, id: number): void {
  const e = sim.entities;
  stopUnit(e, id);
  e.mask[id] &= ~(Comp.Unit | Comp.Mover);
  e.variant[id] = e.unitType[id];
  e.nodeType[id] = NodeType.Carcass;
  e.owner[id] = 0;
}

/** Fuente agotada: las granjas se replantan si hay madera; el resto desaparece. */
export function depleteNode(sim: Simulation, id: number): void {
  const e = sim.entities;
  if (e.nodeType[id] === NodeType.Farm) {
    const owner = e.owner[id];
    if (sim.players.pay(owner, sim.stats.buildingCost(owner, BuildingType.Farm))) {
      e.resAmount[id] = sim.stats.farmFood(owner);
      return;
    }
  }
  removeEntity(sim, id);
}

// ── Geometría de objetivos ──────────────────────────────────────────────

/** Distancia (punto fijo) del punto a la huella del objetivo, o a su posición si no tiene huella. */
export function distanceToTarget(sim: Simulation, target: number, x: number, y: number): number {
  const e = sim.entities;
  const s = e.size[target];
  if (s === 0) return fixedLength(e.x[target] - x, e.y[target] - y);
  const x0 = e.tileX[target] << FP_SHIFT;
  const y0 = e.tileY[target] << FP_SHIFT;
  const x1 = x0 + (s << FP_SHIFT);
  const y1 = y0 + (s << FP_SHIFT);
  const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
  const dy = y < y0 ? y0 - y : y > y1 ? y - y1 : 0;
  return fixedLength(dx, dy);
}

/** `slack`: margen de más (quien ya está trabajando no se recoloca por un empujón de otra unidad). */
export function inReach(sim: Simulation, id: number, target: number, slack = 0): boolean {
  const e = sim.entities;
  const reach = e.size[target] === 0 ? e.radius[id] + e.radius[target] + 64 : WORK_REACH;
  return distanceToTarget(sim, target, e.x[id], e.y[id]) <= reach + slack;
}

/** La huella del objetivo se puede pisar (granjas). */
function walkableFootprint(sim: Simulation, target: number): boolean {
  const e = sim.entities;
  return (e.mask[target] & Comp.Building) !== 0 && !BUILDING_DEFS[e.buildingType[target] as BuildingType].blocks;
}

/**
 * Casilla desde la que trabajar sobre el objetivo, la más cercana al punto (x, y): junto a la huella,
 * o dentro si se puede pisar (granjas). Las casillas donde ya hay unidades (o a las que ya van otras) cuentan
 * como más lejanas: así los que trabajan juntos se reparten alrededor y no se amontonan en el mismo sitio
 * empujándose. Devuelve el índice de casilla o -1 si no hay ninguna libre.
 */
export function workTile(sim: Simulation, target: number, x: number, y: number, self = 0, crowded = true): number {
  const e = sim.entities;
  const grid = sim.grid;
  const s = e.size[target];
  const x0 = e.tileX[target];
  const y0 = e.tileY[target];
  const inside = walkableFootprint(sim, target);
  // Cuántas unidades hay (o van) en cada casilla del contorno.
  const w = s + 2;
  const crowd = new Uint8Array(w * w);
  const add = (tx: number, ty: number) => {
    const cx = tx - (x0 - 1);
    const cy = ty - (y0 - 1);
    if (cx >= 0 && cy >= 0 && cx < w && cy < w && crowd[cy * w + cx] < 255) crowd[cy * w + cx]++;
  };
  for (const id of crowded ? sim.unitIds : []) {
    if (id === self || !e.isAlive(id) || (e.mask[id] & Comp.Position) === 0) continue;
    if (e.moveState[id] === MoveState.Moving) add(e.goalX[id] >> FP_SHIFT, e.goalY[id] >> FP_SHIFT);
    else add(e.x[id] >> FP_SHIFT, e.y[id] >> FP_SHIFT);
  }
  let best = -1;
  let bestD = Infinity;
  for (let ty = y0 - 1; ty <= y0 + s; ty++) {
    for (let tx = x0 - 1; tx <= x0 + s; tx++) {
      const isInside = tx >= x0 && tx < x0 + s && ty >= y0 && ty < y0 + s;
      if (isInside !== inside || !grid.passable(tx, ty)) continue;
      const dx = tileCenterFixed(tx) - x;
      const dy = tileCenterFixed(ty) - y;
      // Cada unidad que ya ocupa la casilla la aleja como una casilla y media.
      const d = dx * dx + dy * dy + crowd[(ty - (y0 - 1)) * w + (tx - (x0 - 1))] * 2.25 * FP_ONE * FP_ONE;
      if (d < bestD) {
        bestD = d;
        best = ty * grid.width + tx;
      }
    }
  }
  return best;
}

/** Manda a la unidad hacia donde pueda trabajar sobre el objetivo. Devuelve `false` si no hay acceso. */
export function approachTarget(sim: Simulation, id: number, target: number): boolean {
  const e = sim.entities;
  let gx: number;
  let gy: number;
  if (e.size[target] === 0) {
    gx = e.x[target];
    gy = e.y[target];
  } else {
    const tile = workTile(sim, target, e.x[id], e.y[id], id);
    if (tile < 0) return false;
    gx = tileCenterFixed(tile % sim.grid.width);
    gy = tileCenterFixed(Math.floor(tile / sim.grid.width));
  }
  e.goalX[id] = gx;
  e.goalY[id] = gy;
  e.repaths[id] = 0;
  sim.pathing.request(id);
  e.taskPathed[id] = 1;
  return true;
}

// ── Consultas ───────────────────────────────────────────────────────────

/** Edificio terminado del jugador que acepta el recurso. */
export function isDropsite(sim: Simulation, id: number, owner: number, resource: number): boolean {
  const e = sim.entities;
  if (!e.has(id, Comp.Building) || e.owner[id] !== owner || !e.built[id]) return false;
  return (BUILDING_DEFS[e.buildingType[id] as BuildingType].dropsite as readonly number[]).includes(resource);
}

/** Punto de entrega más cercano para el recurso, o 0. */
export function nearestDropsite(sim: Simulation, owner: number, resource: number, x: number, y: number, exclude = 0): number {
  const e = sim.entities;
  let best = 0;
  let bestD = Infinity;
  for (let id = 1; id < e.highWater; id++) {
    if (id === exclude || !isDropsite(sim, id, owner, resource)) continue;
    const d = distanceToTarget(sim, id, x, y);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

/** El jugador tiene terminado al menos un edificio de ese tipo. */
export function hasBuilt(sim: Simulation, owner: number, type: BuildingType): boolean {
  const e = sim.entities;
  for (let id = 1; id < e.highWater; id++) {
    if (e.has(id, Comp.Building) && e.owner[id] === owner && e.built[id] && e.buildingType[id] === type) return true;
  }
  return false;
}

/** ¿Se pueden poner aquí los cimientos? Todas las casillas edificables y libres. */
export function canPlaceBuilding(sim: Simulation, type: BuildingType, ox: number, oy: number): boolean {
  const size = BUILDING_DEFS[type].size;
  for (let y = oy; y < oy + size; y++) {
    for (let x = ox; x < ox + size; x++) if (!sim.grid.buildable(x, y)) return false;
  }
  return true;
}

/**
 * Índices del tick: listas de unidades y edificios, recuento de guarniciones y población usada y máxima
 * de cada jugador. Los sistemas recorren estas listas en vez de todas las entidades (árboles incluidos).
 */
export function indexEntities(sim: Simulation): void {
  const e = sim.entities;
  const p = sim.players;
  p.popUsed.fill(0);
  p.popCap.fill(0);
  sim.unitIds.length = 0;
  sim.buildingIds.length = 0;
  sim.garrisonCount.clear();
  for (let id = 1; id < e.highWater; id++) {
    const m = e.mask[id];
    if ((m & Comp.Unit) !== 0) {
      sim.unitIds.push(id);
      p.popUsed[e.owner[id]] += UNIT_DEFS[e.unitType[id] as UnitType].pop;
      const inside = e.garrisonedIn[id];
      if (inside) sim.garrisonCount.set(inside, (sim.garrisonCount.get(inside) ?? 0) + 1);
    } else if ((m & Comp.Building) !== 0) {
      sim.buildingIds.push(id);
      if (e.built[id]) p.popCap[e.owner[id]] += BUILDING_DEFS[e.buildingType[id] as BuildingType].pop;
      if ((m & Comp.Producer) !== 0 && e.trainStarted[id]) {
        const next = e.queue[id]?.[0];
        if (next !== undefined && !isTechItem(next)) p.popUsed[e.owner[id]] += UNIT_DEFS[sim.stats.trainedType(e.owner[id], next as UnitType)].pop;
      }
    }
  }
}

/** Recursos que acepta un tipo de punto de entrega, como lista de tipos de fuente. */
export function nodeTypesForDropsite(type: BuildingType): number[] {
  const out: number[] = [];
  for (const r of BUILDING_DEFS[type].dropsite) {
    if (r === Resource.Wood) out.push(NodeType.Tree);
    if (r === Resource.Food) out.push(NodeType.Berries);
    if (r === Resource.Stone) out.push(NodeType.Stone);
    if (r === Resource.Gold) out.push(NodeType.Gold);
  }
  return out;
}

