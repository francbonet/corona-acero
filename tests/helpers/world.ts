import { BuildingType } from '../../src/data/buildings';
import { UnitType } from '../../src/data/units';
import { tileCenterFixed } from '../../src/engine/fixed';
import { GameMap } from '../../src/map/game-map';
import { Deposit, TreeKind } from '../../src/map/terrain';
import { Simulation } from '../../src/sim/simulation';

export const TICK_RATE = 20;

export interface Layout {
  size?: number;
  trees?: [number, number][];
  berries?: [number, number][];
  gold?: [number, number][];
  stone?: [number, number][];
}

/** Mapa llano de hierba con los recursos indicados y un centro de la villa del jugador 1 en (2, 2). */
export function economyWorld(layout: Layout = {}): { sim: Simulation; tc: number } {
  const size = layout.size ?? 24;
  const map = new GameMap(size, size);
  for (const [x, y] of layout.trees ?? []) map.trees[map.index(x, y)] = TreeKind.Oak;
  for (const [x, y] of layout.berries ?? []) map.deposits[map.index(x, y)] = Deposit.Berries;
  for (const [x, y] of layout.gold ?? []) map.deposits[map.index(x, y)] = Deposit.Gold;
  for (const [x, y] of layout.stone ?? []) map.deposits[map.index(x, y)] = Deposit.Stone;
  const sim = new Simulation({ map, seed: 1, tickRate: TICK_RATE });
  const tc = sim.placeBuilding(BuildingType.TownCenter, 1, 2, 2);
  return { sim, tc };
}

export function villagerAt(sim: Simulation, tx: number, ty: number, owner = 1): number {
  return sim.spawnUnit(UnitType.Villager, owner, tileCenterFixed(tx), tileCenterFixed(ty));
}

export function run(sim: Simulation, ticks: number): void {
  for (let i = 0; i < ticks; i++) sim.step();
}

/** Avanza hasta que se cumpla la condición; devuelve los ticks usados o -1 si no se cumple a tiempo. */
export function runUntil(sim: Simulation, maxTicks: number, done: () => boolean): number {
  for (let i = 0; i < maxTicks; i++) {
    if (done()) return i;
    sim.step();
  }
  return done() ? maxTicks : -1;
}

/** Entidad que ocupa la casilla. */
export function at(sim: Simulation, x: number, y: number): number {
  return sim.grid.occupantAt(x, y);
}
