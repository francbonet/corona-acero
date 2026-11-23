import { type Layer, noteFreq, renderLayer } from './synth';

/**
 * Música de época en chiptune (docs/arte.md §9): un pequeño "tracker" que convierte pistas escritas como texto
 * en muestras con el sintetizador. Instrumentos: flauta, laúd, cromorno, trompeta, bordón de gaita y tamboril.
 * Composiciones originales en modos antiguos (dórico, eólico).
 *
 * Notación de cada canal: una ficha por paso, separadas por espacios. "D4" toca una nota, "-" alarga la anterior,
 * "." es silencio, y en la percusión "x" es un golpe, "X" uno fuerte y "o" uno suave. Las barras "|" solo separan compases.
 */

export type Instrument = 'flute' | 'lute' | 'crumhorn' | 'trumpet' | 'drone' | 'tabor' | 'bell';

export interface Channel {
  readonly instrument: Instrument;
  readonly pattern: string;
  readonly volume?: number;
}

export interface Track {
  readonly bpm: number;
  /** Pasos por pulso (2 = corcheas). */
  readonly stepsPerBeat: number;
  /** Las pistas que se repiten pliegan la cola de las últimas notas sobre el principio. */
  readonly loop: boolean;
  readonly channels: readonly Channel[];
}

/** Capas de sintetizador de una nota de un instrumento. */
function instrument(kind: Instrument, token: string, duration: number, volume: number): Layer[] {
  if (kind === 'tabor') {
    const v = (token === 'X' ? 0.75 : token === 'o' ? 0.25 : 0.5) * volume;
    return [
      { wave: 'noise', freq: 1100, duration: 0.12, decay: 0.035, volume: v, lowpass: 1500 },
      { wave: 'sine', freq: token === 'X' ? 95 : 120, freqEnd: 50, duration: token === 'X' ? 0.3 : 0.16, decay: 0.06, volume: v * 1.1 },
    ];
  }
  const f = noteFreq(token);
  switch (kind) {
    case 'flute':
      return [
        { wave: 'triangle', freq: f, duration: duration + 0.08, attack: 0.05, decay: duration * 1.6 + 0.1, volume: 0.32 * volume, lowpass: 3200, vibrato: { rate: 5, depth: 0.12 } },
        { wave: 'noise', freq: 5000, duration: 0.07, attack: 0.02, decay: 0.03, volume: 0.025 * volume, highpass: 2000 },
      ];
    case 'lute':
      return [
        { wave: 'pulse', duty: 0.4, freq: f, duration: Math.min(duration + 0.4, 1.4), decay: 0.2, volume: 0.2 * volume, lowpass: 2300 },
        { wave: 'triangle', freq: f * 2, duration: 0.3, decay: 0.07, volume: 0.07 * volume },
      ];
    case 'crumhorn':
      return [{ wave: 'pulse', duty: 0.18, freq: f, duration: duration + 0.03, attack: 0.02, decay: duration * 2.5 + 0.1, volume: 0.17 * volume, lowpass: 1700, vibrato: { rate: 6, depth: 0.08 } }];
    case 'trumpet':
      return [{ wave: 'saw', freq: f, duration: duration + 0.05, attack: 0.03, decay: duration * 1.5 + 0.1, volume: 0.22 * volume, lowpass: 2100, vibrato: { rate: 5, depth: 0.1 } }];
    case 'drone':
      return [
        { wave: 'saw', freq: f, duration, attack: 0.4, sustain: true, volume: 0.07 * volume, lowpass: 520 },
        { wave: 'saw', freq: f * 1.5, duration, attack: 0.5, sustain: true, volume: 0.045 * volume, lowpass: 520 },
      ];
    case 'bell':
      return [
        { wave: 'sine', freq: f, duration: 2.2, decay: 0.7, volume: 0.25 * volume },
        { wave: 'sine', freq: f * 2.76, duration: 1.2, decay: 0.3, volume: 0.1 * volume },
      ];
  }
}

/** Fichas de un patrón (sin las barras de compás). */
export function tokens(pattern: string): string[] {
  return pattern.split(/\s+/).filter((t) => t !== '' && t !== '|');
}

/** Número de pasos de una pista (el del canal más largo). */
export function trackSteps(track: Track): number {
  return Math.max(...track.channels.map((c) => tokens(c.pattern).length));
}

/** Duración de la pista en segundos (sin la cola de la última nota). */
export function trackDuration(track: Track): number {
  return (trackSteps(track) * 60) / (track.bpm * track.stepsPerBeat);
}

/** Convierte la pista en muestras mono (normalizadas a un pico de 0,85). */
export function renderTrack(track: Track, sampleRate: number): Float32Array {
  const step = 60 / (track.bpm * track.stepsPerBeat);
  const length = Math.ceil(trackDuration(track) * sampleRate);
  const tail = Math.ceil(2.5 * sampleRate);
  const buf = new Float32Array(length + tail);
  let seed = 7;
  for (const channel of track.channels) {
    const list = tokens(channel.pattern);
    for (let i = 0; i < list.length; i++) {
      const tok = list[i];
      if (tok === '.' || tok === '-') continue;
      let hold = 1;
      while (list[i + hold] === '-') hold++;
      const offset = Math.round(i * step * sampleRate);
      for (const layer of instrument(channel.instrument, tok, hold * step, channel.volume ?? 1)) renderLayer(buf, layer, sampleRate, offset, seed++);
    }
  }
  const out = buf.subarray(0, track.loop ? length : length + tail);
  if (track.loop) for (let i = 0; i < tail && i < length; i++) out[i] += buf[length + i];
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const k = peak > 0 ? 0.85 / peak : 1;
  const result = new Float32Array(out.length);
  for (let i = 0; i < out.length; i++) result[i] = out[i] * k;
  return result;
}

// ── Composiciones ──────────────────────────────────────────────────────

/** Arpegio de laúd de un compás de 8 pasos para un acorde [fundamental, tercera, quinta] (sin octava). */
function luteBar(chord: string, driving: boolean): string {
  const [r, t, f] = CHORDS[chord];
  return driving ? `${r}3 ${r}4 ${f}3 ${r}4 ${r}3 ${r}4 ${f}3 ${t}4` : `${r}3 . ${f}3 . ${r}4 ${t}4 ${f}3 .`;
}

const CHORDS: Readonly<Record<string, readonly [string, string, string]>> = {
  Dm: ['D', 'F', 'A'],
  C: ['C', 'E', 'G'],
  F: ['F', 'A', 'C'],
  G: ['G', 'B', 'D'],
  Am: ['A', 'C', 'E'],
  Em: ['E', 'G', 'B'],
  E: ['E', 'G#', 'B'],
  D: ['D', 'F#', 'A'],
  A: ['A', 'C#', 'E'],
};

const lute = (chords: string, driving = false) => chords.split(' ').map((c) => luteBar(c, driving)).join(' | ');
const repeat = (bar: string, times: number) => Array.from({ length: times }, () => bar).join(' | ');

/** "Prados de la Meseta": la música tranquila de la economía (re dórico). */
const ECONOMY: Track = {
  bpm: 96,
  stepsPerBeat: 2,
  loop: true,
  channels: [
    {
      instrument: 'flute',
      pattern: `D5 - - E5 F5 - E5 D5 | C5 - D5 - A4 - - . | F4 G4 A4 - C5 - B4 A4 | G4 - - - A4 - . . |
        D5 - - E5 F5 - G5 F5 | E5 - C5 - D5 - E5 - | F5 E5 D5 C5 A4 - G4 A4 | D4 - - - . . . . |
        A4 - C5 - D5 - - E5 | F5 - E5 D5 E5 - - . | D5 - C5 A4 G4 - A4 C5 | D5 - - - . . . . |
        F5 - G5 - A5 - G5 F5 | E5 - D5 - C5 - D5 - | A4 - C5 D5 E5 - C5 A4 | D5 - - - - - . .`,
    },
    { instrument: 'lute', pattern: lute('Dm C F G Dm C Dm Dm Am Dm C Dm F C Am Dm'), volume: 0.9 },
    { instrument: 'drone', pattern: `D3 ${'- '.repeat(63)} D3 ${'- '.repeat(63)}`, volume: 0.9 },
    { instrument: 'tabor', pattern: repeat('o . . . o . o .', 16), volume: 0.6 },
  ],
};

/** "La Hueste": música de batalla (la eólico), más rápida, con cromorno y tamboril. */
const BATTLE: Track = {
  bpm: 132,
  stepsPerBeat: 2,
  loop: true,
  channels: [
    {
      instrument: 'crumhorn',
      pattern: `A4 - A4 C5 B4 - A4 G4 | A4 - - - E4 - - . | A4 - C5 D5 E5 - D5 C5 | B4 - G4 - A4 - - . |
        E5 - E5 F5 E5 D5 C5 B4 | C5 - A4 - B4 - G4 - | A4 B4 C5 D5 E5 - D5 B4 | A4 - - - - - . . |
        C5 - C5 D5 E5 - G5 E5 | D5 - - - A4 - - . | F5 - E5 D5 C5 - B4 A4 | G#4 - B4 - E5 - - . |
        A5 - G5 F5 E5 - D5 C5 | D5 - B4 - C5 - A4 - | G4 A4 B4 C5 D5 - B4 G4 | A4 - - - E4 - A4 .`,
    },
    { instrument: 'lute', pattern: lute('Am Em Am G Am F G Am C G F E F G G Am', true), volume: 0.8 },
    { instrument: 'drone', pattern: `A2 ${'- '.repeat(63)} A2 ${'- '.repeat(63)}`, volume: 1 },
    { instrument: 'tabor', pattern: repeat('X . x x X . x . ', 15) + ' | X x x x X x X X', volume: 0.9 },
  ],
};

/** Fanfarria de victoria (re mayor), sin repetir. */
const VICTORY: Track = {
  bpm: 110,
  stepsPerBeat: 2,
  loop: false,
  channels: [
    { instrument: 'trumpet', pattern: 'D4 F#4 A4 D5 - - A4 D5 | F#5 - - - E5 D5 E5 - | D5 - - - - - - -' },
    { instrument: 'trumpet', pattern: 'A3 D4 F#4 A4 - - F#4 A4 | D5 - - - C#5 B4 C#5 - | A4 - - - - - - -', volume: 0.7 },
    { instrument: 'tabor', pattern: 'X . . . X . . . | X . x x X . x x | X x x x X . . .' },
    { instrument: 'bell', pattern: '. . . . . . . . | . . . . . . . . | D5 . . . . . . .' },
  ],
};

/** Lamento de derrota (re menor), lento y sin repetir. */
const DEFEAT: Track = {
  bpm: 66,
  stepsPerBeat: 2,
  loop: false,
  channels: [
    { instrument: 'flute', pattern: 'A4 - G4 - F4 - E4 - | D4 - - - C#4 - - - | D4 - - - - - - -' },
    { instrument: 'drone', pattern: 'D3 - - - - - - - | A2 - - - - - - - | D3 - - - - - - -' },
    { instrument: 'bell', pattern: 'D4 . . . . . . . | . . . . . . . . | D3 . . . . . . .' },
  ],
};

/** "La Corona": la música del menú, una pavana solemne (re mixolidio) con flauta, laúd, campanas y bordón. */
const MENU: Track = {
  bpm: 80,
  stepsPerBeat: 2,
  loop: true,
  channels: [
    {
      instrument: 'flute',
      pattern: `D5 - - - A4 - D5 E5 | F#5 - - E5 D5 - B4 - | C5 - D5 E5 D5 - C5 A4 | D5 - - - - - . . |
        A5 - - G5 F#5 - E5 F#5 | G5 - F#5 E5 D5 - - . | E5 - F#5 G5 F#5 - E5 D5 | E5 - - - - - . . |
        E5 - - D5 C5 - B4 C5 | D5 - - - B4 - G4 - | C5 - E5 - G5 - E5 C5 | D5 - - - A4 - . . |
        B4 - C5 D5 E5 - D5 C5 | E5 - D5 C5 B4 - A4 - | G4 A4 B4 C5 D5 - C5 B4 | D5 - - - - - . .`,
    },
    { instrument: 'lute', pattern: lute('D G C D D G Em A C G C D G C G D'), volume: 0.85 },
    { instrument: 'drone', pattern: `D3 ${'- '.repeat(63)} D3 ${'- '.repeat(63)}`, volume: 0.8 },
    { instrument: 'bell', pattern: 'D5 . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . . . . . | A4 . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . . . . . | D5 . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . . . . . | A4 . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . . . . .', volume: 0.7 },
    { instrument: 'tabor', pattern: repeat('o . . . . . o .', 16), volume: 0.4 },
  ],
};

export const TRACKS = { menu: MENU, economy: ECONOMY, battle: BATTLE, victory: VICTORY, defeat: DEFEAT } as const;
export type TrackName = keyof typeof TRACKS;
