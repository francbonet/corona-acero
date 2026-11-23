import { describe, expect, it } from 'vitest';
import { UnitType } from '../src/data/units';
import { fixedToTile, tileCenterFixed } from '../src/engine/fixed';
import { generateTestMap } from '../src/map/generator';
import { Simulation } from '../src/sim/simulation';

describe('movimiento sin atravesar obstáculos', () => {
  it('ninguna unidad pisa nunca una casilla bloqueada, ni en grupos grandes por el bosque', () => {
    const map = generateTestMap({ width: 64, height: 64, seed: 'corona-y-acero' });
    map.animals.length = 0;
    const sim = new Simulation({ map, seed: 3, tickRate: 20 });
    const ids: number[] = [];
    for (const [x, y] of [[26, 26], [38, 26], [26, 38], [38, 38]]) ids.push(...sim.spawnGroup(UnitType.Militia, 1, x, y, 60));
    ids.push(...sim.spawnGroup(UnitType.Scout, 1, 32, 32, 30));
    const targets = [[10, 54], [54, 10], [50, 50], [12, 12]];
    const e = sim.entities;
    let worst = 0;
    for (let t = 0; t < 2400; t++) {
      if (t % 600 === 0) {
        const [x, y] = targets[t / 600];
        sim.schedule({ type: 'move', player: 1, units: ids, x: tileCenterFixed(x), y: tileCenterFixed(y) });
      }
      sim.step();
      let blocked = 0;
      for (const id of ids) if (!sim.grid.passable(fixedToTile(e.x[id]), fixedToTile(e.y[id]))) blocked++;
      worst = Math.max(worst, blocked);
    }
    expect(worst).toBe(0);
  });
});
