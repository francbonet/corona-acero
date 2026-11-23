import { describe, expect, it } from 'vitest';
import { Faction } from '../src/data/factions';
import { setupMatch } from '../src/game/scenario';
import { generateMatchMap } from '../src/map/generator';
import { Simulation } from '../src/sim/simulation';
import { ConquestScript } from './helpers/conquest-script';
import { TICK_RATE } from './helpers/world';

describe('partida completa (criterio de la Fase 4)', () => {
  it('de la era I a la victoria por conquista contra un rival pasivo', () => {
    const map = generateMatchMap({ width: 96, height: 96, seed: 'corona-y-acero', players: 2 });
    const sim = new Simulation({ map, seed: 11, tickRate: TICK_RATE });
    setupMatch(sim, [Faction.Castilla, Faction.Inglaterra]);
    const bot = new ConquestScript(sim, 1, map.starts[1]);
    const log: string[] = [];
    let era = 0;
    const limit = 75 * 60 * TICK_RATE;
    for (let t = 0; t < limit && sim.winner === 0; t++) {
      if (t % TICK_RATE === 0) bot.update();
      sim.step();
      if (sim.players.era[1] !== era) {
        era = sim.players.era[1];
        log.push(`era ${era} en ${(t / TICK_RATE / 60).toFixed(1)} min`);
      }
    }
    log.push(`fin en ${(sim.tick / TICK_RATE / 60).toFixed(1)} min, ganador ${sim.winner}`);
    expect(sim.players.era[1], log.join(' · ')).toBeGreaterThanOrEqual(2);
    expect(sim.winner, log.join(' · ')).toBe(1);
    expect(sim.winReason).toBe('conquest');
    expect(sim.players.defeated[2]).toBe(1);
    console.info(log.join(' · '));
  }, 240_000);
});
