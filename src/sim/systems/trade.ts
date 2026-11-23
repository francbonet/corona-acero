import { BuildingType } from '../../data/buildings';
import { Resource } from '../../data/resources';
import { FP_ONE, fixedLength } from '../../engine/fixed';
import { Comp, MoveState, Order } from '../entities';
import type { Simulation } from '../simulation';
import { approachTarget, inReach } from '../world';

/** Oro que trae un viaje entre dos mercados a `distance` casillas en un mapa de `mapSize` casillas. */
export function tradeGold(distance: number, mapSize: number, bonusPct: number): number {
  return Math.round(distance * (distance / mapSize + 0.3) * 0.5 * ((100 + bonusPct) / 100));
}

function isMarket(sim: Simulation, id: number, owner: number): boolean {
  const e = sim.entities;
  return e.has(id, Comp.Building) && e.owner[id] === owner && e.buildingType[id] === BuildingType.Market && e.built[id] === 1;
}

/**
 * Carros de comercio: van al mercado de destino, cobran el oro del viaje al llegar, y vuelven al de origen
 * (que pasa a ser el nuevo destino). Cuanto más lejos están los mercados, más oro por viaje.
 */
export function runTrade(sim: Simulation): void {
  const e = sim.entities;
  for (const id of sim.unitIds) {
    if (e.order[id] !== Order.Trade || (e.mask[id] & Comp.Position) === 0) continue;
    const owner = e.owner[id];
    const dest = e.orderTarget[id];
    const home = e.homeNode[id];
    if (!isMarket(sim, dest, owner) || !isMarket(sim, home, owner)) {
      e.order[id] = Order.None;
      continue;
    }
    if (inReach(sim, id, dest)) {
      const d = fixedLength(e.x[dest] - e.x[home], e.y[dest] - e.y[home]) / FP_ONE;
      sim.players.add(owner, Resource.Gold, tradeGold(d, sim.grid.width, sim.stats.tradePct(owner)));
      e.orderTarget[id] = home;
      e.homeNode[id] = dest;
      e.taskFails[id] = 0;
      approachTarget(sim, id, home);
    } else if (e.moveState[id] === MoveState.Idle) {
      if (e.taskFails[id]++ > 5) e.order[id] = Order.None;
      else approachTarget(sim, id, dest);
    }
  }
}
