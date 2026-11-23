import type { SoundSink } from './director';
import { TRACKS, type TrackName, renderTrack } from './music';
import { SOUNDS, type SoundName } from './sounds';
import { synthesize } from './synth';

/** Frecuencia a la que se sintetiza todo (WebAudio la convierte a la del dispositivo). */
const SAMPLE_RATE = 22050;
const FADE_S = 1.6;
const STORAGE_KEY = 'corona-y-acero:audio';
/** Sonidos a la vez como mucho, para no saturar. */
const MAX_VOICES = 24;

export interface AudioSettings {
  /** 0–1. */
  music: number;
  sfx: number;
  muted: boolean;
}

function loadSettings(): AudioSettings {
  const defaults: AudioSettings = { music: 0.5, sfx: 0.8, muted: false };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults, ...(JSON.parse(raw) as Partial<AudioSettings>) };
  } catch {
    // Sin almacenamiento (modo privado, permisos): valores por defecto.
  }
  return defaults;
}

/**
 * Salida de audio con WebAudio: buses de música y efectos con su volumen, panorama por sonido, fundidos entre pistas
 * y ajustes guardados en el navegador. El navegador no deja sonar nada hasta el primer clic o tecla, así que todo
 * espera a `unlock()`; los sonidos se sintetizan la primera vez que hacen falta y se guardan.
 */
export class AudioEngine implements SoundSink {
  readonly settings: AudioSettings = loadSettings();
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly variant = new Map<SoundName, number>();
  private wanted: TrackName | null = null;
  private current: { name: TrackName; source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private voices = 0;

  /** ¿Ya se puede sonar? */
  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** Crea o reanuda el contexto de audio. Llamarlo desde un gesto del usuario (clic, tecla). */
  unlock(): void {
    if (typeof AudioContext === 'undefined') return;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.musicBus = this.ctx.createGain();
      this.sfxBus = this.ctx.createGain();
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.applySettings();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().then(() => this.startWanted());
    else this.startWanted();
  }

  /** Prepara en segundo plano las pistas que aún no se han oído (cada una bloquea un momento al sintetizarse). */
  prerender(): void {
    if (!this.ctx) return;
    const next = (Object.keys(TRACKS) as TrackName[]).find((t) => !this.buffers.has(`music:${t}`));
    if (!next) return;
    setTimeout(() => {
      if (!this.buffers.has(`music:${next}`)) this.buffers.set(`music:${next}`, this.toBuffer(renderTrack(TRACKS[next], SAMPLE_RATE)));
      this.prerender();
    }, 1500);
  }

  setMusicVolume(v: number): void {
    this.settings.music = Math.max(0, Math.min(1, v));
    this.applySettings();
  }

  setSfxVolume(v: number): void {
    this.settings.sfx = Math.max(0, Math.min(1, v));
    this.applySettings();
  }

  toggleMute(): boolean {
    this.settings.muted = !this.settings.muted;
    this.applySettings();
    return this.settings.muted;
  }

  play(name: SoundName, options: { readonly pan?: number; readonly gain?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || ctx.state !== 'running' || this.settings.muted || this.voices >= MAX_VOICES) return;
    const recipes = SOUNDS[name];
    const v = (this.variant.get(name) ?? 0) % recipes.length;
    this.variant.set(name, v + 1);
    const key = `${name}:${v}`;
    let buffer = this.buffers.get(key);
    if (!buffer) {
      buffer = this.toBuffer(synthesize(recipes[v], SAMPLE_RATE, v + 1));
      this.buffers.set(key, buffer);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    // Un poco de variación de tono para que lo repetido no canse.
    source.playbackRate.value = 0.94 + Math.random() * 0.12;
    const gain = ctx.createGain();
    gain.gain.value = options.gain ?? 1;
    let node: AudioNode = source.connect(gain);
    if (options.pan) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = options.pan;
      node = node.connect(panner);
    }
    node.connect(this.sfxBus);
    this.voices++;
    source.onended = () => {
      this.voices--;
    };
    source.start();
  }

  music(track: TrackName | null): void {
    this.wanted = track;
    this.startWanted();
  }

  private startWanted(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus || ctx.state !== 'running') return;
    if (this.current?.name === this.wanted) return;
    const now = ctx.currentTime;
    if (this.current) {
      const old = this.current;
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0, now + FADE_S);
      old.source.stop(now + FADE_S + 0.05);
      this.current = null;
    }
    if (!this.wanted) return;
    const name = this.wanted;
    const def = TRACKS[name];
    let buffer = this.buffers.get(`music:${name}`);
    if (!buffer) {
      buffer = this.toBuffer(renderTrack(def, SAMPLE_RATE));
      this.buffers.set(`music:${name}`, buffer);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = def.loop;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + (def.loop ? FADE_S : 0.05));
    source.connect(gain).connect(this.musicBus);
    source.start(now);
    this.current = { name, source, gain };
  }

  private toBuffer(samples: Float32Array): AudioBuffer {
    const buffer = this.ctx!.createBuffer(1, samples.length, SAMPLE_RATE);
    buffer.getChannelData(0).set(samples);
    return buffer;
  }

  private applySettings(): void {
    if (this.master && this.musicBus && this.sfxBus) {
      const t = this.ctx!.currentTime;
      this.master.gain.setTargetAtTime(this.settings.muted ? 0 : 1, t, 0.05);
      this.musicBus.gain.setTargetAtTime(this.settings.music * 0.6, t, 0.05);
      this.sfxBus.gain.setTargetAtTime(this.settings.sfx, t, 0.05);
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Sin almacenamiento: los ajustes duran lo que la partida.
    }
  }
}
