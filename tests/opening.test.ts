import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/data/buildings';
import { generateTestMap } from '../src/map/generator';
import { Comp } from '../src/sim/entities';
import { setupStart } from '../src/game/scenario';
import { Simulation } from '../src/sim/simulation';
import { EcoScript } from './helpers/eco-script';
import { TICK_RATE } from './helpers/world';

describe('apertura económica (criterio de la Fase 2)', () => {
  it('desde las condiciones iniciales del GDD se llega a 100 de población', () => {
    const map = generateTestMap({ width: 64, height: 64, seed: 'corona-y-acero' });
    const sim = new Simulation({ map, seed: 9, tickRate: TICK_RATE });
    setupStart(sim, 1);
    const bot = new EcoScript(sim, 1);
    const limit = 40 * 60 * TICK_RATE;
    const milestones: string[] = [];
    let next = 20;
    let reached = -1;
    for (let t = 0; t < limit; t++) {
      if (t % TICK_RATE === 0) bot.update();
      sim.step();
      if (sim.players.popUsed[1] >= next) {
        milestones.push(`${next} pob. en ${(t / TICK_RATE / 60).toFixed(1)} min`);
        if (next === 100) {
          reached = t;
          break;
        }
        next += 20;
      }
    }
    expect(reached, milestones.join(' · ')).toBeGreaterThan(0);

    // Se han usado todas las piezas de la economía.
    const e = sim.entities;
    const built = new Map<number, number>();
    for (let id = 1; id < e.highWater; id++) {
      if (e.has(id, Comp.Building) && e.owner[id] === 1 && e.built[id]) built.set(e.buildingType[id], (built.get(e.buildingType[id]) ?? 0) + 1);
    }
    expect(built.get(BuildingType.TownCenter)).toBe(2);
    expect(built.get(BuildingType.House)).toBeGreaterThanOrEqual(18);
    for (const t of [BuildingType.Mill, BuildingType.LumberCamp, BuildingType.MiningCamp, BuildingType.Farm, BuildingType.Barracks]) {
      expect(built.get(t) ?? 0, `edificio ${t}`).toBeGreaterThan(0);
    }
    for (let r = 0; r < 4; r++) expect(sim.players.stock[4 + r]).toBeGreaterThanOrEqual(0);
  }, 120_000);
});
