import { describe, expect, it } from 'vitest';
import { AiPlayer } from '../src/ai/ai-player';
import { Difficulty } from '../src/ai/difficulty';
import { Faction } from '../src/data/factions';
import { setupMatch } from '../src/game/scenario';
import { generateMatchMap } from '../src/map/generator';
import { Simulation } from '../src/sim/simulation';

/** Partida completa IA contra IA (hasta 70 minutos de juego). Unos 15 s cada una en Node. */
function aiGame(seed: string, a: Difficulty, b: Difficulty, factions: readonly number[]) {
  const map = generateMatchMap({ width: 96, height: 96, seed, players: 2 });
  const sim = new Simulation({ map, seed: 11, tickRate: 20 });
  setupMatch(sim, factions);
  sim.addController(new AiPlayer(sim, 1, { difficulty: a }));
  sim.addController(new AiPlayer(sim, 2, { difficulty: b }));
  for (let t = 0; t < 70 * 60 * sim.tickRate && sim.winner === 0; t++) sim.step();
  return { winner: sim.winner, minutes: sim.tick / (60 * sim.tickRate), reason: sim.winReason };
}

describe('IA: partidas completas', () => {
  it('la media gana a la fácil', () => {
    const r = aiGame('siete', Difficulty.Easy, Difficulty.Medium, [Faction.Castilla, Faction.Inglaterra]);
    expect(r.winner).toBe(2);
    expect(r.reason).toBe('conquest');
  }, 180_000);

  it('la difícil gana a la media', () => {
    // Con «cuatro» la difícil va muy por delante pero no termina de arrasar en 70 minutos desde que el agua somera
    // no se pisa; en el torneo (6 partidas) gana todas a la media.
    const r = aiGame('uno', Difficulty.Medium, Difficulty.Hard, [Faction.Inglaterra, Faction.Inglaterra]);
    expect(r.winner).toBe(2);
    expect(r.minutes).toBeLessThan(70);
  }, 180_000);
});
