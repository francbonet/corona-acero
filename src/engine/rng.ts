/**
 * Generador pseudoaleatorio determinista (mulberry32) para la simulación.
 * La simulación nunca debe usar `Math.random`: con la misma semilla, la partida tiene que repetirse igual.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  /** Entero sin signo de 32 bits. */
  nextU32(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Número en [0, 1). */
  nextFloat(): number {
    return this.nextU32() / 4294967296;
  }

  /** Entero en [0, max). */
  nextInt(max: number): number {
    return Math.floor(this.nextFloat() * max);
  }

  /** Entero en [min, max] (ambos incluidos). */
  nextRange(min: number, max: number): number {
    return min + this.nextInt(max - min + 1);
  }

  /** `true` con probabilidad `p`. */
  chance(p: number): boolean {
    return this.nextFloat() < p;
  }

  /** Estado interno, para guardar partida. */
  getState(): number {
    return this.state;
  }

  setState(state: number): void {
    this.state = state | 0;
  }
}

/** Hash FNV-1a de 32 bits: convierte una semilla de texto en número. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Hash entero de dos coordenadas, útil para elegir variantes sin consumir el PRNG. */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
