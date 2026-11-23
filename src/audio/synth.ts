/**
 * Sintetizador por software, al estilo de jsfxr: genera las muestras de un sonido a partir de una "receta"
 * de capas (onda, tono, envolvente, filtro). Es puro y determinista (el ruido sale de un PRNG con semilla),
 * así que funciona igual en Node (tests) que en el navegador, donde las muestras se vuelcan a un AudioBuffer.
 */

export type Wave = 'sine' | 'triangle' | 'square' | 'pulse' | 'saw' | 'noise';

/** Una capa de sonido: un oscilador con su envolvente. Tiempos en segundos, tonos en Hz. */
export interface Layer {
  readonly wave: Wave;
  /** Tono inicial. En el ruido, ritmo al que cambia de valor (más bajo = más grave, como en las consolas de 8 bits). */
  readonly freq: number;
  /** Tono final (deslizamiento exponencial a lo largo de la capa). */
  readonly freqEnd?: number;
  readonly duration: number;
  /** Retraso desde el inicio del sonido. */
  readonly delay?: number;
  readonly attack?: number;
  /** Constante de tiempo de la caída exponencial (por defecto, una cuarta parte de la duración). */
  readonly decay?: number;
  /** Mantiene el volumen sin caer (instrumentos de viento sostenidos). */
  readonly sustain?: boolean;
  readonly volume?: number;
  /** Ancho del pulso para la onda 'pulse' (0–1). */
  readonly duty?: number;
  readonly vibrato?: { readonly rate: number; readonly depth: number };
  /** Filtro paso bajo de un polo (Hz). */
  readonly lowpass?: number;
  /** Filtro paso alto de un polo (Hz). */
  readonly highpass?: number;
}

export interface SoundRecipe {
  readonly layers: readonly Layer[];
  /** Volumen general (se aplica después de mezclar las capas). */
  readonly gain?: number;
}

/** Duración total de una receta en segundos. */
export function recipeDuration(recipe: SoundRecipe): number {
  return recipe.layers.reduce((m, l) => Math.max(m, (l.delay ?? 0) + l.duration), 0);
}

/** PRNG pequeño y rápido para el ruido (mulberry32). */
function noiseRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Suma una capa en `out` a partir de la muestra `offset`. */
export function renderLayer(out: Float32Array, layer: Layer, sampleRate: number, offset = 0, seed = 1): void {
  const start = offset + Math.round((layer.delay ?? 0) * sampleRate);
  const length = Math.round(layer.duration * sampleRate);
  const attack = Math.max(1, Math.round((layer.attack ?? 0.004) * sampleRate));
  const tau = (layer.decay ?? layer.duration / 4) * sampleRate;
  const fadeOut = Math.min(length, Math.round(0.006 * sampleRate));
  const volume = layer.volume ?? 0.5;
  const f0 = layer.freq;
  const f1 = layer.freqEnd ?? layer.freq;
  const ratio = f1 / f0;
  const duty = layer.duty ?? 0.25;
  const lpA = layer.lowpass ? 1 - Math.exp((-2 * Math.PI * layer.lowpass) / sampleRate) : 1;
  const hpA = layer.highpass ? 1 - Math.exp((-2 * Math.PI * layer.highpass) / sampleRate) : 0;
  const rnd = noiseRng(seed);
  let phase = 0;
  let held = rnd() * 2 - 1;
  let lp = 0;
  let hpLow = 0;
  for (let i = 0; i < length; i++) {
    const j = start + i;
    if (j < 0) continue;
    if (j >= out.length) break;
    const t = i / length;
    let freq = f0 * Math.pow(ratio, t);
    if (layer.vibrato) freq *= Math.pow(2, (layer.vibrato.depth / 12) * Math.sin((2 * Math.PI * layer.vibrato.rate * i) / sampleRate));
    const prev = phase;
    phase += freq / sampleRate;
    if (phase >= 1) phase -= Math.floor(phase);
    let s: number;
    switch (layer.wave) {
      case 'sine':
        s = Math.sin(2 * Math.PI * phase);
        break;
      case 'triangle':
        s = 1 - 4 * Math.abs(phase - 0.5);
        break;
      case 'square':
        s = phase < 0.5 ? 1 : -1;
        break;
      case 'pulse':
        s = phase < duty ? 1 : -1;
        break;
      case 'saw':
        s = 2 * phase - 1;
        break;
      default:
        // Ruido "con tono": cambia de valor cada vez que la fase da la vuelta.
        if (phase < prev) held = rnd() * 2 - 1;
        s = held;
    }
    // Filtros de un polo.
    lp += lpA * (s - lp);
    s = lp;
    if (hpA > 0) {
      hpLow += hpA * (s - hpLow);
      s -= hpLow;
    }
    // Envolvente: ataque lineal, caída exponencial (o sostenido) y un final suave para no hacer clic.
    let env = i < attack ? i / attack : layer.sustain ? 1 : Math.exp(-(i - attack) / tau);
    if (i >= length - fadeOut) env *= (length - i) / fadeOut;
    out[j] += s * env * volume;
  }
}

/** Genera las muestras de un sonido (mono, entre −1 y 1). */
export function synthesize(recipe: SoundRecipe, sampleRate: number, seed = 1): Float32Array {
  const out = new Float32Array(Math.max(1, Math.ceil(recipeDuration(recipe) * sampleRate)));
  recipe.layers.forEach((layer, i) => renderLayer(out, layer, sampleRate, 0, seed * 31 + i));
  finish(out, recipe.gain ?? 1);
  return out;
}

/** Aplica el volumen y una saturación suave para que la mezcla nunca pase de ±1. */
export function finish(out: Float32Array, gain: number): void {
  for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i] * gain);
}

/** Frecuencia de una nota ("A4", "F#3", "Bb2"). */
export function noteFreq(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`Nota no válida: ${name}`);
  const base = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 }[m[1] as 'C'];
  const semis = base + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) - 4) * 12;
  return 440 * Math.pow(2, semis / 12);
}
