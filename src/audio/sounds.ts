import { type Layer, type SoundRecipe, noteFreq } from './synth';

/**
 * Catálogo de efectos de sonido, sintetizados (docs/arte.md §9). Cada nombre puede tener varias variantes
 * para que los sonidos repetidos (hachazos, espadas) no suenen idénticos.
 */

const n = noteFreq;

/** Golpe seco de madera o metal: un tono que cae rápido más un chasquido de ruido. */
function knock(freq: number, bright: number, volume = 0.6): Layer[] {
  return [
    { wave: 'triangle', freq, freqEnd: freq * 0.6, duration: 0.12, decay: 0.03, volume },
    { wave: 'noise', freq: bright, duration: 0.05, decay: 0.012, volume: volume * 0.7, lowpass: bright * 0.5 },
  ];
}

/** Choque metálico: parciales inarmónicos que vibran un momento. */
function clang(freq: number, volume = 0.45): Layer[] {
  return [
    { wave: 'square', freq, duration: 0.22, decay: 0.05, volume: volume * 0.5, lowpass: 5000 },
    { wave: 'sine', freq: freq * 2.76, duration: 0.25, decay: 0.07, volume: volume * 0.6 },
    { wave: 'sine', freq: freq * 5.4, duration: 0.15, decay: 0.04, volume: volume * 0.4 },
    { wave: 'noise', freq: 9000, duration: 0.04, decay: 0.01, volume: volume * 0.8, highpass: 2000 },
  ];
}

/** Campana: parciales de campana de iglesia con una caída larga. */
function bell(freq: number, duration: number, volume = 0.5): Layer[] {
  return [
    { wave: 'sine', freq: freq * 0.5, duration, decay: duration * 0.45, volume: volume * 0.5 },
    { wave: 'sine', freq, duration, decay: duration * 0.35, volume },
    { wave: 'sine', freq: freq * 1.19, duration: duration * 0.8, decay: duration * 0.25, volume: volume * 0.5 },
    { wave: 'sine', freq: freq * 1.5, duration: duration * 0.6, decay: duration * 0.2, volume: volume * 0.35 },
    { wave: 'sine', freq: freq * 2.0, duration: duration * 0.5, decay: duration * 0.15, volume: volume * 0.3 },
    { wave: 'noise', freq: 7000, duration: 0.03, decay: 0.01, volume: volume * 0.4, highpass: 3000 },
  ];
}

/** Notas seguidas (fanfarrias y avisos). */
function phrase(notes: readonly string[], step: number, wave: Layer['wave'], volume: number, extra: Partial<Layer> = {}): Layer[] {
  return notes.map((note, i) => ({
    wave,
    freq: n(note),
    duration: step * 1.6,
    delay: i * step,
    decay: step * 0.8,
    volume,
    ...extra,
  }));
}

/**
 * Voces de confirmación en un idioma inventado: sílabas de onda cuadrada con una curva de tono,
 * precedidas de una consonante de ruido. `pitch` da el registro (aldeano, soldado, monje…).
 */
function voice(pitch: number, contour: readonly number[], gruff = false): Layer[] {
  const layers: Layer[] = [];
  contour.forEach((c, i) => {
    const t = i * 0.11;
    layers.push({ wave: 'noise', freq: 6000, duration: 0.025, delay: t, decay: 0.01, volume: 0.18, highpass: 1500 });
    layers.push({
      wave: gruff ? 'saw' : 'pulse',
      duty: 0.3,
      freq: pitch * c,
      freqEnd: pitch * c * (i === contour.length - 1 ? 0.82 : 1.05),
      duration: 0.1,
      delay: t + 0.015,
      attack: 0.01,
      decay: 0.08,
      volume: 0.32,
      lowpass: gruff ? 1400 : 2400,
      vibrato: { rate: 18, depth: 0.4 },
    });
  });
  return layers;
}

export const SOUNDS = {
  // ── Trabajo ──
  chop: [{ layers: knock(180, 3000, 0.55) }, { layers: knock(160, 2600, 0.55) }, { layers: knock(200, 3400, 0.5) }],
  mine: [{ layers: clang(1500, 0.3) }, { layers: clang(1700, 0.28) }],
  build: [{ layers: knock(320, 4200, 0.5) }, { layers: knock(280, 3800, 0.5) }],
  farm: [
    { layers: [{ wave: 'noise', freq: 5000, duration: 0.18, attack: 0.04, decay: 0.06, volume: 0.25, lowpass: 3500, highpass: 800 }] },
  ],
  // ── Combate ──
  arrow: [
    { layers: [{ wave: 'noise', freq: 9000, freqEnd: 3000, duration: 0.22, attack: 0.02, decay: 0.08, volume: 0.35, highpass: 1500, lowpass: 7000 }] },
    { layers: [{ wave: 'noise', freq: 8000, freqEnd: 2500, duration: 0.2, attack: 0.02, decay: 0.07, volume: 0.32, highpass: 1300, lowpass: 6500 }] },
  ],
  arrowHit: [{ layers: knock(140, 1800, 0.35) }],
  clash: [{ layers: clang(900) }, { layers: clang(1050) }, { layers: clang(780) }],
  trebuchet: [
    {
      layers: [
        { wave: 'saw', freq: 90, freqEnd: 60, duration: 0.35, decay: 0.15, volume: 0.3, lowpass: 500 },
        { wave: 'noise', freq: 2000, freqEnd: 400, duration: 0.6, attack: 0.1, decay: 0.25, volume: 0.3, lowpass: 1500 },
      ],
    },
  ],
  cannon: [
    {
      gain: 1.6,
      layers: [
        { wave: 'noise', freq: 1800, freqEnd: 120, duration: 0.9, decay: 0.25, volume: 0.9, lowpass: 900 },
        { wave: 'sine', freq: 70, freqEnd: 35, duration: 0.5, decay: 0.18, volume: 0.8 },
      ],
    },
  ],
  crash: [
    {
      layers: [
        { wave: 'noise', freq: 1500, freqEnd: 300, duration: 0.5, decay: 0.15, volume: 0.6, lowpass: 1400 },
        ...knock(110, 1200, 0.5),
      ],
    },
  ],
  death: [
    { layers: [{ wave: 'saw', freq: 260, freqEnd: 120, duration: 0.3, attack: 0.02, decay: 0.12, volume: 0.3, lowpass: 1200, vibrato: { rate: 12, depth: 0.6 } }] },
    { layers: [{ wave: 'saw', freq: 220, freqEnd: 100, duration: 0.32, attack: 0.02, decay: 0.12, volume: 0.3, lowpass: 1100, vibrato: { rate: 10, depth: 0.6 } }] },
  ],
  collapse: [
    {
      gain: 1.3,
      layers: [
        { wave: 'noise', freq: 900, freqEnd: 90, duration: 1.4, attack: 0.05, decay: 0.45, volume: 0.8, lowpass: 900 },
        { wave: 'noise', freq: 3000, duration: 0.5, delay: 0.05, decay: 0.15, volume: 0.35, lowpass: 2500 },
        ...knock(90, 900, 0.5),
      ],
    },
  ],
  // ── Avisos y progreso ──
  horn: [
    {
      layers: [
        { wave: 'saw', freq: n('D4'), duration: 0.5, attack: 0.06, sustain: true, volume: 0.35, lowpass: 1300, vibrato: { rate: 5, depth: 0.15 } },
        { wave: 'saw', freq: n('A4'), duration: 0.9, delay: 0.5, attack: 0.05, sustain: true, volume: 0.35, lowpass: 1300, vibrato: { rate: 5, depth: 0.15 } },
      ],
    },
  ],
  bell: [{ layers: [...bell(n('G4'), 1.6), ...bell(n('G4'), 1.6).map((l) => ({ ...l, delay: (l.delay ?? 0) + 0.55 }))] }],
  trained: [{ layers: phrase(['D5', 'A5'], 0.09, 'pulse', 0.22, { duty: 0.5 }) }],
  built: [{ layers: [...knock(300, 4000, 0.4), ...phrase(['A4', 'D5', 'F#5'], 0.1, 'triangle', 0.3).map((l) => ({ ...l, delay: (l.delay ?? 0) + 0.12 }))] }],
  research: [{ layers: phrase(['D5', 'E5', 'F#5', 'A5'], 0.08, 'triangle', 0.3) }],
  fanfare: [
    {
      layers: [
        ...phrase(['D4', 'D4', 'A4', 'D5'], 0.16, 'saw', 0.28, { lowpass: 1800, attack: 0.02 }),
        { wave: 'saw', freq: n('F#5'), duration: 1.1, delay: 0.64, attack: 0.03, decay: 0.6, volume: 0.28, lowpass: 1800, vibrato: { rate: 5, depth: 0.12 } },
        ...bell(n('D5'), 1.4, 0.3).map((l) => ({ ...l, delay: (l.delay ?? 0) + 0.64 })),
      ],
    },
  ],
  convert: [
    { layers: [{ wave: 'triangle', freq: n('E4'), duration: 1.0, attack: 0.15, sustain: true, volume: 0.25, vibrato: { rate: 4, depth: 0.2 } }, { wave: 'triangle', freq: n('B4'), duration: 1.0, attack: 0.2, sustain: true, volume: 0.18 }] },
  ],
  heal: [{ layers: phrase(['A5', 'E6'], 0.07, 'sine', 0.18) }],
  // ── Interfaz ──
  click: [{ layers: [{ wave: 'square', freq: 1200, freqEnd: 900, duration: 0.03, decay: 0.012, volume: 0.15, lowpass: 3000 }] }],
  denied: [{ layers: [{ wave: 'square', freq: 180, duration: 0.09, decay: 0.05, volume: 0.25, lowpass: 900 }, { wave: 'square', freq: 150, duration: 0.12, delay: 0.09, decay: 0.06, volume: 0.25, lowpass: 900 }] }],
  place: [{ layers: knock(120, 1500, 0.55) }],
  // ── Voces ──
  voiceVillager: [{ layers: voice(330, [1, 1.25]) }, { layers: voice(350, [1.12, 1, 1.2]) }, { layers: voice(310, [1, 1.33]) }],
  voiceWoman: [{ layers: voice(520, [1, 1.2]) }, { layers: voice(540, [1.1, 1, 1.25]) }],
  voiceSoldier: [{ layers: voice(170, [1, 0.9], true) }, { layers: voice(160, [1.1, 1, 0.9], true) }, { layers: voice(180, [1, 1.12], true) }],
  voiceRider: [{ layers: voice(200, [1, 1.2, 0.9], true) }, { layers: voice(190, [1.2, 1], true) }],
  voiceMonk: [{ layers: [{ wave: 'triangle', freq: n('D4'), duration: 0.45, attack: 0.06, sustain: true, volume: 0.3, vibrato: { rate: 5, depth: 0.15 } }, { wave: 'triangle', freq: n('A3'), duration: 0.45, attack: 0.08, sustain: true, volume: 0.2 }] }],
  voiceSiege: [{ layers: knock(90, 800, 0.5) }],
  voiceAnimal: [{ layers: [{ wave: 'saw', freq: 300, freqEnd: 240, duration: 0.25, attack: 0.03, decay: 0.12, volume: 0.25, lowpass: 1500, vibrato: { rate: 22, depth: 1 } }] }],
} satisfies Record<string, readonly SoundRecipe[]>;

export type SoundName = keyof typeof SOUNDS;
export const SOUND_NAMES = Object.keys(SOUNDS) as SoundName[];
