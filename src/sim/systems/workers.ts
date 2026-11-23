import { BUILDING_DEFS, type BuildingType } from '../../data/buildings';
import { NodeType } from '../../data/nodes';
import type { UnitType } from '../../data/units';
import { FP_ONE, fixedLength } from '../../engine/fixed';
import { Comp, MoveState, Task } from '../entities';
import type { Simulation } from '../simulation';
import {
  approachTarget,
  depleteNode,
  inReach,
  isDropsite,
  nearestDropsite,
  nodeTypesForDropsite,
  slaughter,
  workTile,
} from '../world';
import { stopUnit } from './movement';

/**
 * Tareas de los aldeanos: recolectar → cargar → entregar → volver, y construir o reparar.
 * Cada tick decide si la unidad tiene que andar hacia su objetivo o ya puede trabajar.
 */

const WORKER = Comp.Position | Comp.Mover | Comp.Worker;
/** Intentos de llegar a un objetivo antes de buscar otro. */
const MAX_FAILS = 3;
/** Segundos que queda vetada una fuente a la que no se ha podido llegar (nadie vuelve a intentarlo en ese rato). */
const UNREACHABLE_SECONDS = 120;
/** Radio de búsqueda de otra fuente igual cuando se agota la actual (casillas). */
const SEARCH_RADIUS = 10;
/** Penalización por matar una oveja nueva si aún queda carne de otra (casillas²). */
const SHEEP_PENALTY = 16;

export function runWorkers(sim: Simulation): void {
  const e = sim.entities;
  for (let id = 1; id < e.highWater; id++) {
    if ((e.mask[id] & WORKER) !== WORKER) continue;
    // Si ya estaba trabajando, un empujón de otra unidad no le hace recolocarse (ver `reach`).
    const was = e.working[id] === 1;
    e.working[id] = 0;
    // Enzarzado en combate (o cazando): de eso se encarga el sistema de combate.
    if (e.attackTarget[id] !== 0) continue;
    switch (e.task[id]) {
      case Task.Gather:
        gatherStep(sim, id, was);
        break;
      case Task.Deliver:
        deliverStep(sim, id);
        break;
      case Task.Build:
        buildStep(sim, id, was);
        break;
    }
  }
}

// ── Órdenes (las llaman los comandos y otros sistemas) ──────────────────

export function clearTask(sim: Simulation, id: number): void {
  const e = sim.entities;
  e.task[id] = Task.None;
  e.taskTarget[id] = 0;
  e.taskFails[id] = 0;
  e.taskPathed[id] = 0;
  e.working[id] = 0;
  e.buildQueue[id] = null;
}

/** Empieza (o retoma) a recolectar de `node`. */
export function setGatherTarget(sim: Simulation, id: number, node: number): void {
  const e = sim.entities;
  const prev = e.taskTarget[id];
  e.task[id] = Task.Gather;
  e.taskTarget[id] = node;
  e.taskFails[id] = 0;
  e.homeNode[id] = node;
  e.homeType[id] = isMeat(e.nodeType[node]) ? NodeType.Carcass : e.nodeType[node];
  e.homeX[id] = e.x[node];
  e.homeY[id] = e.y[node];
  if (prev !== node || e.moveState[id] === MoveState.Idle) {
    e.taskPathed[id] = 0;
    stopUnit(e, id);
  }
}

export function setBuildTarget(sim: Simulation, id: number, building: number, queue: boolean): void {
  const e = sim.entities;
  if (queue && e.task[id] === Task.Build && e.taskTarget[id] !== building) {
    (e.buildQueue[id] ??= []).push(building);
    return;
  }
  if (!queue) e.buildQueue[id] = null;
  e.task[id] = Task.Build;
  e.taskTarget[id] = building;
  e.taskFails[id] = 0;
  e.taskPathed[id] = 0;
  stopUnit(e, id);
}

export function setDeliverTarget(sim: Simulation, id: number, site: number): void {
  const e = sim.entities;
  e.task[id] = Task.Deliver;
  e.taskTarget[id] = site;
  e.taskFails[id] = 0;
  e.taskPathed[id] = 0;
  e.buildQueue[id] = null;
  stopUnit(e, id);
}

/** Qué hacen los constructores cuando el edificio se termina. */
export function onConstructionComplete(sim: Simulation, building: number): void {
  const e = sim.entities;
  const type = e.buildingType[building] as BuildingType;
  for (let id = 1; id < e.highWater; id++) {
    if ((e.mask[id] & WORKER) !== WORKER || e.task[id] !== Task.Build || e.taskTarget[id] !== building) continue;
    if (nextBuild(sim, id)) continue;
    if (e.nodeType[building] === NodeType.Farm && e.occupant[building] === 0) {
      // El primero se queda a cultivarla.
      e.occupant[building] = id;
      setGatherTarget(sim, id, building);
      continue;
    }
    const types = nodeTypesForDropsite(type);
    const node = types.length > 0 ? findNode(sim, id, types, e.x[building], e.y[building], 8, 0) : 0;
    if (node) setGatherTarget(sim, id, node);
    else clearTask(sim, id);
  }
}

// ── Pasos de cada tarea ─────────────────────────────────────────────────

type Reach = 'here' | 'going' | 'failed';

/** Margen de alcance de quien ya está trabajando (un tercio largo de casilla). */
const REACH_SLACK = 96;

/**
 * Acerca la unidad al objetivo. 'here' = al alcance (y parada); 'failed' = no consigue llegar. `working`: ya
 * estaba trabajando en el tick anterior (le basta con estar algo más lejos).
 */
function reach(sim: Simulation, id: number, target: number, working = false): Reach {
  const e = sim.entities;
  if (inReach(sim, id, target, working ? REACH_SLACK : 0)) {
    if (e.moveState[id] !== MoveState.Idle) stopUnit(e, id);
    e.taskPathed[id] = 0;
    e.taskFails[id] = 0;
    return 'here';
  }
  if (e.moveState[id] !== MoveState.Idle) {
    // Objetivo móvil (oveja): si se ha alejado de la meta, se recalcula de vez en cuando.
    if (
      e.size[target] === 0 &&
      (sim.tick + id) % 10 === 0 &&
      fixedLength(e.goalX[id] - e.x[target], e.goalY[id] - e.y[target]) > FP_ONE
    ) {
      approachTarget(sim, id, target);
    }
    return 'going';
  }
  if (e.taskPathed[id]) {
    e.taskPathed[id] = 0;
    if (++e.taskFails[id] >= MAX_FAILS) return 'failed';
  }
  return approachTarget(sim, id, target) ? 'going' : 'failed';
}

function carryCapacity(sim: Simulation, id: number): number {
  return sim.stats.carry(sim.entities.owner[id], sim.entities.unitType[id] as UnitType);
}

/** ¿Puede este aldeano recolectar de `node` ahora mismo? */
function isGatherable(sim: Simulation, id: number, node: number): boolean {
  const e = sim.entities;
  if (!e.has(node, Comp.Resource) || e.resAmount[node] <= 0) return false;
  const type = e.nodeType[node];
  if (type === NodeType.Farm) {
    if (!e.built[node] || e.owner[node] !== e.owner[id]) return false;
    const farmer = e.occupant[node];
    return farmer === 0 || farmer === id || !isFarming(sim, farmer, node);
  }
  if (type === NodeType.Sheep) return e.owner[node] === e.owner[id] || e.owner[node] === 0;
  return true;
}

function isFarming(sim: Simulation, worker: number, farm: number): boolean {
  const e = sim.entities;
  return e.has(worker, WORKER) && e.task[worker] === Task.Gather && e.taskTarget[worker] === farm;
}

/** Fuentes de carne (se recolectan igual una vez muertas). */
function isMeat(type: number): boolean {
  return type === NodeType.Sheep || type === NodeType.Deer || type === NodeType.Boar || type === NodeType.Carcass;
}

/** ¿Encaja el tipo de fuente con lo que estaba recolectando? */
function matchesHome(homeType: number, nodeType: number): boolean {
  if (homeType === NodeType.Carcass) return nodeType === NodeType.Carcass || nodeType === NodeType.Sheep;
  return homeType === nodeType;
}

/**
 * Fuente más cercana a (x, y) de alguno de los tipos dados, a la que se pueda llegar y que este aldeano pueda usar.
 * Para la carne, prefiere terminar una oveja ya sacrificada antes que matar otra.
 */
export function findNode(
  sim: Simulation,
  id: number,
  types: readonly number[],
  x: number,
  y: number,
  radiusTiles: number,
  exclude: number,
): number {
  const e = sim.entities;
  const maxD = radiusTiles * FP_ONE;
  let best = 0;
  let bestScore = Infinity;
  for (let n = 1; n < e.highWater; n++) {
    if (n === exclude || (e.mask[n] & Comp.Resource) === 0 || e.blockedUntil[n] > sim.tick) continue;
    const type = e.nodeType[n];
    if (!types.some((t) => matchesHome(t, type))) continue;
    if (!isGatherable(sim, id, n)) continue;
    const dx = e.x[n] - x;
    const dy = e.y[n] - y;
    if (Math.abs(dx) > maxD || Math.abs(dy) > maxD) continue;
    let score = dx * dx + dy * dy;
    if (score > maxD * maxD) continue;
    if (type === NodeType.Sheep) score += SHEEP_PENALTY * FP_ONE * FP_ONE;
    if (e.size[n] > 0 && workTile(sim, n, e.x[id], e.y[id], id, false) < 0) continue; // rodeada: no se puede llegar
    if (score < bestScore) {
      bestScore = score;
      best = n;
    }
  }
  return best;
}

/**
 * Veta una fuente a la que no se llega (encerrada entre árboles, agua o edificios) y, si es una mina, las casillas
 * del mismo yacimiento pegadas a ella: si no, el aldeano probaba una tras otra todas las de la bolsa, y cada
 * intento era una búsqueda de camino por todo el mapa (miles en una partida).
 */
function blockUnreachable(sim: Simulation, node: number): void {
  const e = sim.entities;
  if ((e.mask[node] & Comp.Unit) !== 0 || e.nodeType[node] === NodeType.Farm) return;
  const until = sim.tick + UNREACHABLE_SECONDS * sim.tickRate;
  e.blockedUntil[node] = until;
  const type = e.nodeType[node];
  if (type !== NodeType.Gold && type !== NodeType.Stone) return;
  // El yacimiento entero: las casillas del mismo tipo unidas a esta.
  const stack = [node];
  while (stack.length > 0) {
    const n = stack.pop() as number;
    const tx = e.tileX[n];
    const ty = e.tileY[n];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const m = sim.grid.occupantAt(tx + dx, ty + dy);
        if (m > 0 && e.has(m, Comp.Resource) && e.nodeType[m] === type && e.blockedUntil[m] < until) {
          e.blockedUntil[m] = until;
          stack.push(m);
        }
      }
    }
  }
}

/** Busca otra fuente del mismo tipo cerca de la última; si no hay, entrega lo que lleve o se queda quieto. */
function retarget(sim: Simulation, id: number, exclude = 0): void {
  const e = sim.entities;
  const node = e.homeType[id] ? findNode(sim, id, [e.homeType[id]], e.homeX[id], e.homeY[id], SEARCH_RADIUS, exclude) : 0;
  if (node) {
    setGatherTarget(sim, id, node);
  } else if (e.carryAmount[id] > 0) {
    e.homeNode[id] = 0;
    e.homeType[id] = 0;
    setDeliverTarget(sim, id, 0);
  } else {
    clearTask(sim, id);
  }
}

function gatherStep(sim: Simulation, id: number, working = false): void {
  const e = sim.entities;
  let node = e.taskTarget[id];
  if (!isGatherable(sim, id, node)) {
    retarget(sim, id, node);
    if (e.task[id] !== Task.Gather) return;
    node = e.taskTarget[id];
  }
  const capacity = carryCapacity(sim, id);
  if (e.carryAmount[id] >= capacity && e.carryKind[id] === e.resKind[node]) {
    setDeliverTarget(sim, id, 0);
    return;
  }

  // Caza: un ciervo o un jabalí vivo hay que abatirlo primero (lo hace el sistema de combate).
  if ((e.mask[node] & Comp.Unit) !== 0 && e.nodeType[node] !== NodeType.Sheep) {
    if (e.blockedUntil[node] > sim.tick) {
      retarget(sim, id, node);
      return;
    }
    e.attackTarget[id] = node;
    e.chaseFails[id] = 0;
    return;
  }

  const r = reach(sim, id, node, working);
  if (r === 'failed') {
    blockUnreachable(sim, node);
    retarget(sim, id, node);
    return;
  }
  if (r !== 'here') return;

  if (e.nodeType[node] === NodeType.Sheep) slaughter(sim, node);
  if (e.nodeType[node] === NodeType.Farm) e.occupant[node] = id;
  const kind = e.resKind[node];
  if (e.carryKind[id] !== kind) {
    // Cambia de recurso: lo que llevara se pierde.
    e.carryKind[id] = kind;
    e.carryAmount[id] = 0;
    e.gatherAccum[id] = 0;
  }
  e.working[id] = 1;
  e.gatherAccum[id] += sim.stats.gatherRate(e.owner[id], e.nodeType[node]);
  while (e.gatherAccum[id] >= FP_ONE && e.carryAmount[id] < capacity && e.resAmount[node] > 0) {
    e.gatherAccum[id] -= FP_ONE;
    e.carryAmount[id]++;
    e.resAmount[node]--;
  }
  if (e.resAmount[node] <= 0) depleteNode(sim, node);
  if (e.carryAmount[id] >= capacity) {
    e.gatherAccum[id] = 0;
    setDeliverTarget(sim, id, 0);
  }
}

function deliverStep(sim: Simulation, id: number): void {
  const e = sim.entities;
  if (e.carryAmount[id] === 0) {
    resumeGather(sim, id);
    return;
  }
  const owner = e.owner[id];
  const kind = e.carryKind[id];
  let site = e.taskTarget[id];
  if (!isDropsite(sim, site, owner, kind)) {
    site = nearestDropsite(sim, owner, kind, e.x[id], e.y[id]);
    if (!site) {
      clearTask(sim, id); // nada donde entregar: espera con la carga
      return;
    }
    e.taskTarget[id] = site;
    e.taskFails[id] = 0;
    e.taskPathed[id] = 0;
  }
  const r = reach(sim, id, site);
  if (r === 'failed') {
    const other = nearestDropsite(sim, owner, kind, e.x[id], e.y[id], site);
    if (other) setDeliverTarget(sim, id, other);
    else clearTask(sim, id);
    return;
  }
  if (r !== 'here') return;
  sim.players.add(owner, kind as 0 | 1 | 2 | 3, e.carryAmount[id]);
  e.carryAmount[id] = 0;
  e.gatherAccum[id] = 0;
  resumeGather(sim, id);
}

/** Tras entregar: vuelve a su fuente, o a otra igual cerca, o se queda quieto. */
function resumeGather(sim: Simulation, id: number): void {
  const e = sim.entities;
  const home = e.homeNode[id];
  if (home && isGatherable(sim, id, home)) setGatherTarget(sim, id, home);
  else if (e.homeType[id]) retarget(sim, id, home);
  else clearTask(sim, id);
}

function isConstructible(sim: Simulation, id: number, building: number): boolean {
  return sim.entities.owner[building] === sim.entities.owner[id] && needsBuilder(sim, building);
}

/** ¿Hay trabajo para un aldeano en este edificio? Unos cimientos sin terminar o un edificio dañado (salvo granjas). */
export function needsBuilder(sim: Simulation, building: number): boolean {
  const e = sim.entities;
  if (!e.has(building, Comp.Building | Comp.Position)) return false;
  if (!e.built[building]) return true;
  return e.hp[building] < e.maxHp[building] && e.nodeType[building] !== NodeType.Farm;
}

/** Pasa al siguiente edificio de la cola. Devuelve `false` si no queda ninguno. */
function nextBuild(sim: Simulation, id: number): boolean {
  const e = sim.entities;
  const queue = e.buildQueue[id];
  while (queue && queue.length > 0) {
    const next = queue.shift() as number;
    if (isConstructible(sim, id, next)) {
      e.task[id] = Task.Build;
      e.taskTarget[id] = next;
      e.taskFails[id] = 0;
      e.taskPathed[id] = 0;
      stopUnit(e, id);
      return true;
    }
  }
  return false;
}

function buildStep(sim: Simulation, id: number, working = false): void {
  const e = sim.entities;
  const building = e.taskTarget[id];
  if (!isConstructible(sim, id, building)) {
    if (nextBuild(sim, id)) return;
    // Reparación terminada: vuelve a lo que estaba haciendo antes (su fuente, o entregar lo que lleve).
    const repaired = e.isAlive(building) && e.has(building, Comp.Building) && e.built[building] === 1;
    if (repaired && e.carryAmount[id] > 0) setDeliverTarget(sim, id, 0);
    else if (repaired) resumeGather(sim, id);
    else {
      // La obra ya no existe (derribada o destruida): se para donde está.
      clearTask(sim, id);
      stopUnit(e, id);
    }
    return;
  }
  const r = reach(sim, id, building, working);
  if (r === 'failed') {
    if (!nextBuild(sim, id)) clearTask(sim, id);
    return;
  }
  if (r !== 'here') return;
  e.working[id] = 1;
  sim.addBuilder(building);
}

/** El tipo de edificio admite este tipo de fuente como destino de entrega (para el HUD). */
export function dropsiteAccepts(type: BuildingType, resource: number): boolean {
  return (BUILDING_DEFS[type].dropsite as readonly number[]).includes(resource);
}
