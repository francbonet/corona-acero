/**
 * Opciones del juego que no son de sonido (las de sonido las guarda el motor de audio): velocidad de la cámara,
 * desplazar con los bordes, velocidad de la partida y autoguardado. Se guardan en el navegador.
 */

export interface GameSettings {
  /** Multiplicador de la velocidad de desplazamiento de la cámara (0,5–2). */
  scrollSpeed: number;
  /** Mover la cámara al llevar el ratón al borde de la pantalla. */
  edgeScroll: boolean;
  /** Velocidad de la partida (1 = normal). */
  gameSpeed: number;
  /** Guardar sola la partida cada pocos minutos. */
  autosave: boolean;
  /** Voces de las unidades: habladas (síntesis de voz del navegador), sintetizadas o ninguna. */
  voices: VoiceMode;
}

export type VoiceMode = 'speech' | 'chiptune' | 'off';

export const VOICE_MODES: readonly { readonly value: VoiceMode; readonly name: string }[] = [
  { value: 'speech', name: 'Habladas' },
  { value: 'chiptune', name: 'Sintetizadas' },
  { value: 'off', name: 'Sin voces' },
];

export const GAME_SPEEDS: readonly { readonly value: number; readonly name: string }[] = [
  { value: 0.75, name: 'Lenta' },
  { value: 1, name: 'Normal' },
  { value: 1.5, name: 'Rápida' },
  { value: 2, name: 'Muy rápida' },
];

export const DEFAULT_SETTINGS: GameSettings = { scrollSpeed: 1, edgeScroll: true, gameSpeed: 1, autosave: true, voices: 'speech' };

const STORAGE_KEY = 'corona-y-acero:opciones';

const clamp = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback);

/** Opciones guardadas (o las de por defecto si no hay, o si el navegador no deja leerlas). */
export function loadSettings(): GameSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<GameSettings>;
    return {
      scrollSpeed: clamp(raw.scrollSpeed, 0.5, 2, DEFAULT_SETTINGS.scrollSpeed),
      edgeScroll: typeof raw.edgeScroll === 'boolean' ? raw.edgeScroll : DEFAULT_SETTINGS.edgeScroll,
      gameSpeed: GAME_SPEEDS.some((s) => s.value === raw.gameSpeed) ? (raw.gameSpeed as number) : DEFAULT_SETTINGS.gameSpeed,
      autosave: typeof raw.autosave === 'boolean' ? raw.autosave : DEFAULT_SETTINGS.autosave,
      voices: VOICE_MODES.some((v) => v.value === raw.voices) ? (raw.voices as VoiceMode) : DEFAULT_SETTINGS.voices,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: GameSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Sin almacenamiento (ventana privada): las opciones valen solo para esta sesión.
  }
}
