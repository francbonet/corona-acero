import { UNIT_DEFS, type UnitType } from '../../data/units';
import { FP_SHIFT, tileCenterFixed } from '../../engine/fixed';
import type { TechType } from '../../data/techs';
import { Comp, Task } from '../entities';
import { TECH_BASE, completeResearch, isTechItem, researchTicks } from '../tech';
import { nearestPassableTiles } from '../slots';
import type { Simulation } from '../simulation';
import { spawnUnit } from '../world';
import { setBuildTarget, setGatherTarget } from './workers';

const PRODUCER = Comp.Building | Comp.Producer;
/** Unidades como máximo en la cola de un edificio. */
export const MAX_QUEUE = 10;

export function trainTicks(sim: Simulation, type: UnitType): number {
  return Math.max(1, Math.round(UNIT_DEFS[type].trainTime * sim.tickRate));
}

/**
 * Colas de producción. La unidad en cabeza solo avanza si hay población libre (si no, el edificio
 * espera "sin casas"); al empezar reserva su hueco, y al terminar sale junto al edificio y va al punto de reunión.
 */
export function runProduction(sim: Simulation): void {
  const e = sim.entities;
  for (let id = 1; id < e.highWater; id++) {
    if ((e.mask[id] & PRODUCER) !== PRODUCER || !e.built[id]) continue;
    const queue = e.queue[id];
    if (!queue || queue.length === 0) continue;
    const owner = e.owner[id];
    if (isTechItem(queue[0])) {
      // Investigación: no ocupa población.
      const tech = (queue[0] - TECH_BASE) as TechType;
      e.trainStarted[id] = 1;
      if (++e.trainProgress[id] < researchTicks(sim, tech)) continue;
      queue.shift();
      e.trainProgress[id] = 0;
      e.trainStarted[id] = 0;
      completeResearch(sim, owner, tech);
      continue;
    }
    const type = sim.stats.trainedType(owner, queue[0] as UnitType);
    if (!e.trainStarted[id]) {
      const pop = UNIT_DEFS[type].pop;
      if (!sim.players.hasRoom(owner, pop)) continue;
      e.trainStarted[id] = 1;
      sim.players.popUsed[owner] += pop;
    }
    e.trainProgress[id]++;
    if (e.trainProgress[id] < trainTicks(sim, type)) continue;
    queue.shift();
    e.trainProgress[id] = 0;
    e.trainStarted[id] = 0;
    spawnFromBuilding(sim, id, type);
  }
}

/** Saca la unidad por el lado del edificio más cercano al punto de reunión y la manda allí. */
function spawnFromBuilding(sim: Simulation, building: number, type: UnitType): void {
  const e = sim.entities;
  const grid = sim.grid;
  const size = e.size[building];
  const cx = e.tileX[building] + (size >> 1);
  const cy = e.tileY[building] + (size >> 1);
  const exits = nearestPassableTiles(grid, cx, cy, 16);
  if (exits.length === 0) return;
  let exit = exits[0];
  if (e.hasRally[building]) {
    const rx = e.rallyX[building] >> FP_SHIFT;
    const ry = e.rallyY[building] >> FP_SHIFT;
    let best = Infinity;
    for (const t of exits.slice(0, 12)) {
      const dx = (t % grid.width) - rx;
      const dy = Math.floor(t / grid.width) - ry;
      if (dx * dx + dy * dy < best) {
        best = dx * dx + dy * dy;
        exit = t;
      }
    }
  }
  const id = spawnUnit(sim, type, e.owner[building], tileCenterFixed(exit % grid.width), tileCenterFixed(Math.floor(exit / grid.width)));
  sim.emit({ kind: 'trained', player: e.owner[id], unitType: type, x: e.x[id], y: e.y[id] });
  if (!e.hasRally[building]) return;

  const target = e.rallyTarget[building];
  if ((e.mask[id] & Comp.Worker) !== 0 && target && e.isAlive(target)) {
    if ((e.mask[target] & Comp.Resource) !== 0 && e.resAmount[target] > 0) {
      setGatherTarget(sim, id, target);
      return;
    }
    if ((e.mask[target] & Comp.Building) !== 0 && e.owner[target] === e.owner[id] && !e.built[target]) {
      setBuildTarget(sim, id, target, false);
      return;
    }
  }
  e.task[id] = Task.None;
  e.goalX[id] = e.rallyX[building];
  e.goalY[id] = e.rallyY[building];
  sim.pathing.request(id);
}
