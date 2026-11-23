/// <reference types="node" />
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { AiPlayer } from '../../src/ai/ai-player';
import { DIFFICULTY_DEFS, type Difficulty } from '../../src/ai/difficulty';
import { FACTION_DEFS, type Faction } from '../../src/data/factions';
import { setupMatch } from '../../src/game/scenario';
import { hashString } from '../../src/engine/rng';
import { generateMatchMap } from '../../src/map/generator';
import { Simulation } from '../../src/sim/simulation';
import { EcoScript } from '../../tests/helpers/eco-script';

/** Un jugador del torneo: una dificultad de la IA o el "novato" (solo economía, nunca ataca). */
export type Rival = Difficulty | 'novato';

export interface Resultado {
  readonly enfrentamiento: string;
  readonly semilla: string;
  readonly rivales: [string, string];
  readonly facciones: [string, string];
  /** Estrategia de cada IA ('—' para el novato). */
  readonly estrategias: [string, string];
  /** 0 = empate (se acabó el tiempo), 1 o 2 = ganador. */
  readonly ganador: number;
  readonly minutos: number;
  readonly segundos: number;
}

export const DIR_RESULTADOS = join(tmpdir(), 'corona-y-acero-torneo');
const MAX_MINUTOS = 70;
const PARTIDAS = Math.max(1, Number(process.env.TORNEO_PARTIDAS ?? 4) | 0);
const SEMILLAS = ['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce'];

export const nombreRival = (r: Rival) => (r === 'novato' ? 'Novato' : DIFFICULTY_DEFS[r].name);

/** Juega una partida en un mapa de 96×96 hasta que alguien gane o pasen 70 minutos de juego. */
export function jugar(enfrentamiento: string, semilla: string, rivales: [Rival, Rival], facciones: [Faction, Faction]): Resultado {
  const map = generateMatchMap({ width: 96, height: 96, seed: semilla, players: 2 });
  // Como en el juego: la simulación (y con ella la estrategia que elige cada IA) sale de la semilla.
  const sim = new Simulation({ map, seed: hashString(semilla), tickRate: 20 });
  setupMatch(sim, facciones);
  const guiones: EcoScript[] = [];
  const estrategias: [string, string] = ['—', '—'];
  rivales.forEach((r, i) => {
    if (r === 'novato') {
      guiones.push(new EcoScript(sim, i + 1));
      return;
    }
    const ai = new AiPlayer(sim, i + 1, { difficulty: r });
    estrategias[i] = ai.strategy.name;
    sim.addController(ai);
  });
  const t0 = performance.now();
  for (let t = 0; t < MAX_MINUTOS * 60 * sim.tickRate && sim.winner === 0; t++) {
    if (t % sim.tickRate === 0) for (const g of guiones) g.update();
    sim.step();
  }
  return {
    enfrentamiento,
    semilla,
    rivales: [nombreRival(rivales[0]), nombreRival(rivales[1])],
    facciones: [FACTION_DEFS[facciones[0]].name, FACTION_DEFS[facciones[1]].name],
    estrategias,
    ganador: sim.winner,
    minutos: Math.round((sim.tick / (60 * sim.tickRate)) * 10) / 10,
    segundos: Math.round((performance.now() - t0) / 100) / 10,
  };
}

/**
 * Registra un enfrentamiento: `TORNEO_PARTIDAS` partidas (4 por defecto) con semillas distintas,
 * alternando lados y facciones. Cada resultado se guarda para el resumen final.
 */
export function enfrentamiento(nombre: string, a: Rival, b: Rival, facciones?: [Faction, Faction]): void {
  it(nombre, () => {
    mkdirSync(DIR_RESULTADOS, { recursive: true });
    const resultados: Resultado[] = [];
    for (let i = 0; i < PARTIDAS; i++) {
      const semilla = SEMILLAS[i % SEMILLAS.length] + (i >= SEMILLAS.length ? `-${i}` : '');
      // Se alternan los lados (y, si no se fijan, las facciones) para no favorecer a nadie.
      const lado = i % 2 === 0;
      const fac: [Faction, Faction] = facciones ?? (i % 4 < 2 ? [0, 1] : [1, 0]);
      const r = lado ? jugar(nombre, semilla, [a, b], fac) : jugar(nombre, semilla, [b, a], [fac[1], fac[0]]);
      resultados.push(r);
    }
    writeFileSync(join(DIR_RESULTADOS, `${nombre}.json`), JSON.stringify(resultados));
    expect(resultados.length).toBe(PARTIDAS);
  }, 60 * 60 * 1000);
}
