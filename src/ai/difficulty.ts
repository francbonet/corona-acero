/** Niveles de dificultad de la IA (GDD §15). Solo "difícil" tiene un pequeño bonus de recolección. */
export const Difficulty = {
  Easy: 0,
  Medium: 1,
  Hard: 2,
} as const;
export type Difficulty = (typeof Difficulty)[keyof typeof Difficulty];

export interface DifficultyDef {
  readonly key: string;
  readonly name: string;
  /** Segundos entre decisiones (tiempo de reacción). */
  readonly thinkEvery: number;
  /** Aldeanos que quiere tener. */
  readonly villagers: number;
  /** Tamaño mínimo del ejército para lanzar una oleada, por era. */
  readonly waveSize: readonly number[];
  /** Minuto a partir del cual puede atacar. */
  readonly firstAttackMinute: number;
  /** Cuántas tecnologías de la lista de prioridades llega a investigar (proporción 0–1). */
  readonly techDepth: number;
  /** Bonus de recolección en % (solo difícil). */
  readonly gatherBonus: number;
  /** Era máxima a la que intenta llegar. */
  readonly maxEra: number;
}

export const DIFFICULTY_DEFS: Readonly<Record<Difficulty, DifficultyDef>> = {
  [Difficulty.Easy]: {
    key: 'facil',
    name: 'Fácil',
    thinkEvery: 3,
    villagers: 30,
    waveSize: [99, 10, 14, 18],
    firstAttackMinute: 28,
    techDepth: 0.3,
    gatherBonus: 0,
    maxEra: 2,
  },
  [Difficulty.Medium]: {
    key: 'media',
    name: 'Media',
    thinkEvery: 1.5,
    villagers: 55,
    waveSize: [99, 10, 16, 22],
    firstAttackMinute: 18,
    techDepth: 0.65,
    gatherBonus: 0,
    maxEra: 3,
  },
  [Difficulty.Hard]: {
    key: 'dificil',
    name: 'Difícil',
    thinkEvery: 0.75,
    villagers: 80,
    waveSize: [99, 10, 18, 26],
    firstAttackMinute: 14,
    techDepth: 1,
    gatherBonus: 10,
    maxEra: 3,
  },
};

export function difficultyFromKey(key: string | null): Difficulty {
  for (const [d, def] of Object.entries(DIFFICULTY_DEFS)) if (def.key === key) return Number(d) as Difficulty;
  return Difficulty.Medium;
}
