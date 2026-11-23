import type { BuildingType } from '../../data/buildings';
import { RESOURCE_COUNT, type Cost } from '../../data/resources';
import { FP_ONE } from '../../engine/fixed';
import type { Simulation } from '../simulation';
import { buildTotal } from '../world';
import { onConstructionComplete } from './workers';

/** Vida que repone un aldeano solo por segundo (con varios, rinde menos cada uno, como al construir). */
export const REPAIR_HP_PER_SECOND = 15;
/** Reparar un edificio entero cuesta este % de lo que costó construirlo (en proporción a la vida que repone). */
export const REPAIR_COST_PCT = 50;

/** Rendimiento de n aldeanos juntos: 3n/(n+2) veces el de uno (1 → ×1, 2 → ×1,5, 3 → ×1,8, 4 → ×2…). */
function crew(n: number): [number, number] {
  return [3 * n, n + 2];
}

/**
 * Avanza las obras y las reparaciones. Cada aldeano aporta trabajo, con rendimiento decreciente:
 * n constructores trabajan 3n/(n+2) veces más rápido que uno.
 */
export function applyConstruction(sim: Simulation): void {
  const e = sim.entities;
  const touched = sim.takeBuilders();
  for (const [building, n] of touched) {
    if (!e.isAlive(building)) continue;
    if (e.built[building]) {
      repair(sim, building, n);
      continue;
    }
    const total = buildTotal(sim, e.buildingType[building] as BuildingType);
    // Bonus de facción (Castilla construye más rápido).
    const speed = 100 + sim.stats.buildSpeedPct(e.owner[building]);
    const [num, den] = crew(n);
    e.buildProgress[building] = Math.min(total, e.buildProgress[building] + Math.floor((256 * num * speed) / (den * 100)));
    e.hp[building] = Math.max(1, Math.floor((e.maxHp[building] * e.buildProgress[building]) / total));
    if (e.buildProgress[building] >= total) {
      e.built[building] = 1;
      e.hp[building] = e.maxHp[building];
      sim.emit({ kind: 'built', player: e.owner[building], buildingType: e.buildingType[building], x: e.x[building], y: e.y[building] });
      onConstructionComplete(sim, building);
    }
  }
}

/**
 * Repone vida a un edificio terminado. Se cobra sobre la marcha: la mitad del coste del edificio por toda su
 * vida, a partes iguales por cada punto. Si no hay con qué pagar, la obra se para (y se avisa al jugador).
 */
function repair(sim: Simulation, building: number, n: number): void {
  const e = sim.entities;
  const missing = e.maxHp[building] - e.hp[building];
  if (missing <= 0) return;
  const owner = e.owner[building];
  const speed = 100 + sim.stats.buildSpeedPct(owner);
  const [num, den] = crew(n);
  const accum = e.repairAccum[building] + Math.floor((REPAIR_HP_PER_SECOND * FP_ONE * num * speed) / (den * 100 * sim.tickRate));
  const gain = Math.min(missing, Math.floor(accum / FP_ONE));
  if (gain > 0) {
    const price = repairPrice(sim, building, e.repairDone[building], gain);
    if (!sim.players.pay(owner, price)) {
      sim.emit({ kind: 'repairBlocked', player: owner, x: e.x[building], y: e.y[building] });
      return;
    }
    e.hp[building] += gain;
    e.repairDone[building] += gain;
  }
  e.repairAccum[building] = accum - gain * FP_ONE;
  if (e.hp[building] >= e.maxHp[building]) {
    e.repairAccum[building] = 0;
    e.repairDone[building] = 0;
  }
}

/**
 * Lo que cuesta reponer `gain` puntos de vida a un edificio que ya lleva `done` repuestos en esta reparación.
 * Se calcula sobre el total acumulado para que el redondeo no regale ni cobre de más.
 */
export function repairPrice(sim: Simulation, building: number, done: number, gain: number): Cost {
  const e = sim.entities;
  const cost = sim.stats.buildingCost(e.owner[building], e.buildingType[building] as BuildingType);
  const den = 100 * e.maxHp[building];
  const owed = (hp: number, r: number) => Math.floor((cost[r] * REPAIR_COST_PCT * hp) / den);
  const out = [0, 0, 0, 0];
  for (let r = 0; r < RESOURCE_COUNT; r++) out[r] = owed(done + gain, r) - owed(done, r);
  return out as unknown as Cost;
}
