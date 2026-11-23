import { BuildingType } from '../data/buildings';
import { UnitType } from '../data/units';
import type { Simulation } from '../sim/simulation';

/** Jugador que controla esta pantalla. */
export const LOCAL_PLAYER = 1;

export interface StartInfo {
  readonly townCenter: number;
  readonly villagers: readonly number[];
}

/**
 * Condiciones iniciales del GDD §3 en una posición del mapa: centro de la villa, 4 aldeanos,
 * 1 batidor y 6 ovejas. Va por la API de la simulación, así que también es determinista.
 */
export function setupStart(sim: Simulation, player = LOCAL_PLAYER, startIndex = 0): StartInfo {
  const start = sim.map.starts[startIndex] ?? { x: sim.grid.width >> 1, y: sim.grid.height >> 1 };
  const townCenter = sim.placeBuilding(BuildingType.TownCenter, player, start.x - 2, start.y - 2);
  const villagers = sim.spawnGroup(UnitType.Villager, player, start.x, start.y + 3, 4);
  sim.spawnGroup(UnitType.Scout, player, start.x + 3, start.y, 1);
  sim.spawnGroup(UnitType.Sheep, player, start.x - 4, start.y + 4, 6);
  return { townCenter, villagers };
}

/** Partida: da de alta a cada jugador con su facción y lo coloca en su posición inicial. */
export function setupMatch(sim: Simulation, factions: readonly number[]): StartInfo[] {
  return factions.map((faction, i) => {
    sim.addPlayer(i + 1, faction);
    return setupStart(sim, i + 1, i);
  });
}
