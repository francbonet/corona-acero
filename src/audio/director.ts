import { Faction } from '../data/factions';
import { NodeType } from '../data/nodes';
import { ProjectileKind } from '../data/combat';
import { TECH_DEFS, type TechType } from '../data/techs';
import { UNIT_DEFS, UnitType } from '../data/units';
import { FP_ONE, FP_SHIFT } from '../engine/fixed';
import { HALF_H, HALF_W } from '../render/iso';
import { Comp, Task } from '../sim/entities';
import type { SimEvent } from '../sim/events';
import type { Simulation } from '../sim/simulation';
import type { TrackName } from './music';
import type { SoundName } from './sounds';
import type { VoiceMode } from '../game/settings';
import type { Speech, VoiceKind, VoiceMoment } from './speech';
import { type ViewRect, spatialize } from './spatial';

/** Quien suena de verdad (el motor WebAudio, o un doble en los tests). */
export interface SoundSink {
  play(name: SoundName, options?: { readonly pan?: number; readonly gain?: number }): void;
  /** Cambia la música (con fundido); `null` la apaga. */
  music(track: TrackName | null): void;
}

/** Respuesta a lo que hace el jugador en la interfaz (la genera el cliente). */
export type Feedback =
  /** `unit`: la unidad que contesta (aldeano o aldeana); `attack`: la orden es de atacar. */
  | { readonly kind: 'select'; readonly unitType: number; readonly unit?: number }
  | { readonly kind: 'order'; readonly unitType: number; readonly unit?: number; readonly attack?: boolean }
  | { readonly kind: 'click' }
  | { readonly kind: 'denied' }
  | { readonly kind: 'place' }
  | { readonly kind: 'bell' };

/** Milisegundos mínimos entre dos veces el mismo sonido (para que una batalla no sea un muro de ruido). */
const MIN_GAP: Partial<Record<SoundName, number>> = {
  arrow: 70,
  arrowHit: 90,
  clash: 80,
  death: 120,
  crash: 150,
  cannon: 120,
  trebuchet: 150,
  collapse: 300,
  horn: 20000,
  trained: 300,
  built: 500,
  research: 500,
  fanfare: 1500,
  convert: 800,
  heal: 400,
  click: 40,
  denied: 250,
  place: 100,
  bell: 1500,
  chop: 90,
  mine: 110,
  build: 90,
  farm: 200,
};
const VOICE_GAP = 350;
/** Cada cuánto se escucha el trabajo de los aldeanos en pantalla. */
const AMBIENT_MS = 260;
/** Intensidad de combate para pasar a la música de batalla, y para volver a la tranquila. */
const BATTLE_ON = 9;
const BATTLE_OFF = 2.5;
const BATTLE_COOLDOWN_MS = 18000;

/** Voz de cada tipo de unidad. */
export function voiceOf(unitType: number): SoundName {
  const def = UNIT_DEFS[unitType as UnitType];
  if (!def) return 'click';
  if (def.pop === 0) return 'voiceAnimal';
  if (unitType === UnitType.Villager || def.trader) return 'voiceVillager';
  if (def.monk) return 'voiceMonk';
  if (def.classes.includes('siege')) return 'voiceSiege';
  if (def.classes.includes('cavalry')) return 'voiceRider';
  return 'voiceSoldier';
}

/** Qué voz hablada lleva cada unidad. */
export function voiceKind(unitType: number, woman = false): VoiceKind {
  const def = UNIT_DEFS[unitType as UnitType];
  if (unitType === UnitType.Villager) return woman ? 'woman' : 'villager';
  if (def.trader) return 'villager';
  if (def.monk) return 'monk';
  if (def.classes.includes('siege')) return 'siege';
  if (def.classes.includes('cavalry')) return 'rider';
  return 'soldier';
}

/** Voces: habladas, sintetizadas o ninguna. */
export type { VoiceMode } from '../game/settings';

export interface VoiceOptions {
  readonly speech: Pick<Speech, 'canSpeak' | 'say'>;
  mode(): VoiceMode;
  /** Corona del jugador local: sus unidades hablan en su idioma (por defecto, Castilla). */
  faction?(): Faction;
  /** Volumen de las voces habladas (0 si está todo silenciado). */
  volume(): number;
}

/**
 * Decide qué suena y cuándo: traduce los sucesos de la simulación y las acciones del jugador en efectos
 * (colocados en el panorama según la pantalla y solo si se ven, para no delatar lo que oculta la niebla),
 * escucha el trabajo de los aldeanos a la vista y elige la música según la intensidad del combate.
 */
export class AudioDirector {
  private now = 0;
  private readonly last = new Map<string, number>();
  private intensity = 0;
  private calmSince = 0;
  private track: TrackName | null = null;
  private ambientElapsed = 0;
  private ambientCursor = 0;
  private gameOver = false;
  private villagerVoice = 0;

  constructor(
    private readonly sink: SoundSink,
    private readonly player: number,
    private readonly view: () => ViewRect,
    /** ¿Se ve esta casilla? (niebla de guerra del jugador local). */
    private readonly visible: (tx: number, ty: number) => boolean,
    /** Voces habladas (si no se dan, las sintetizadas de siempre). */
    private readonly voices?: VoiceOptions,
  ) {}

  /** Pistas en marcha (para tests y depuración). */
  get currentTrack(): TrackName | null {
    return this.track;
  }

  /** Avanza el reloj y decide la música. */
  update(dtMs: number): void {
    this.now += dtMs;
    this.intensity *= Math.exp(-dtMs / 6000);
    if (this.gameOver) return;
    if (this.track === null) this.setTrack('economy');
    if (this.intensity >= BATTLE_ON) {
      this.calmSince = this.now;
      this.setTrack('battle');
    } else if (this.track === 'battle') {
      if (this.intensity > BATTLE_OFF) this.calmSince = this.now;
      else if (this.now - this.calmSince >= BATTLE_COOLDOWN_MS) this.setTrack('economy');
    }
  }

  handleEvents(events: readonly SimEvent[]): void {
    for (const ev of events) {
      switch (ev.kind) {
        case 'shoot':
          this.at(ev.x, ev.y, ev.projectile === ProjectileKind.Arrow ? 'arrow' : ev.projectile === ProjectileKind.Stone ? 'trebuchet' : 'cannon', 0.6, 1);
          break;
        case 'impact':
          this.at(ev.x, ev.y, ev.projectile === ProjectileKind.Arrow ? 'arrowHit' : 'crash', 0.5, 0);
          break;
        case 'hit':
          this.at(ev.x, ev.y, 'clash', 0.55, 1);
          break;
        case 'death':
          if (ev.building) this.at(ev.x, ev.y, 'collapse', 0.9, 2);
          else if (ev.owner !== 0) this.at(ev.x, ev.y, 'death', 0.5, 1);
          break;
        case 'attacked':
          if (ev.player === this.player) {
            this.intensity += 1.5;
            this.play('horn', 0.8);
          }
          break;
        case 'research':
          if (ev.player === this.player) this.play(TECH_DEFS[ev.tech as TechType].advance !== undefined ? 'fanfare' : 'research', 0.8);
          break;
        case 'trained':
          if (ev.player === this.player) this.voice(ev.unitType, 'trained');
          break;
        case 'built':
          if (ev.player === this.player) this.at(ev.x, ev.y, 'built', 0.8, 0, true);
          break;
        case 'convert':
          this.at(ev.x, ev.y, 'convert', 0.7, 0);
          break;
        case 'heal':
          this.at(ev.x, ev.y, 'heal', 0.4, 0);
          break;
        case 'victory':
          this.gameOver = true;
          this.setTrack(ev.player === this.player ? 'victory' : 'defeat');
          break;
        case 'defeat':
          if (ev.player === this.player) {
            this.gameOver = true;
            this.setTrack('defeat');
          }
          break;
      }
    }
  }

  handleFeedback(list: readonly Feedback[]): void {
    for (const f of list) {
      switch (f.kind) {
        case 'select':
          this.voice(f.unitType, 'select', f.unit);
          break;
        case 'order':
          this.voice(f.unitType, f.attack ? 'attack' : 'order', f.unit);
          break;
        case 'click':
          this.play('click', 0.6);
          break;
        case 'denied':
          this.play('denied', 0.7);
          break;
        case 'place':
          this.play('place', 0.7);
          break;
        case 'bell':
          this.play('bell', 0.8);
          break;
      }
    }
  }

  /** Hachazos, picos y martillos de los aldeanos que se ven trabajando (unos pocos cada vez, por turnos). */
  ambient(sim: Simulation, dtMs: number): void {
    this.ambientElapsed += dtMs;
    if (this.ambientElapsed < AMBIENT_MS) return;
    this.ambientElapsed = 0;
    const e = sim.entities;
    const ids = sim.unitIds;
    if (ids.length === 0) return;
    let played = 0;
    for (let k = 0; k < ids.length && played < 2; k++) {
      const id = ids[(this.ambientCursor + k) % ids.length];
      if (!e.isAlive(id) || (e.mask[id] & (Comp.Worker | Comp.Position)) !== (Comp.Worker | Comp.Position) || e.working[id] !== 1) continue;
      const sound = workSound(e.task[id], e.homeType[id]);
      if (!sound) continue;
      if (e.owner[id] !== this.player && !this.visible(e.x[id] >> FP_SHIFT, e.y[id] >> FP_SHIFT)) continue;
      // Solo uno de cada tantos golpes: así suenan a ritmo distinto y no todos a la vez.
      if (((id * 7 + Math.floor(this.now / AMBIENT_MS)) & 3) !== 0) continue;
      if (this.at(e.x[id], e.y[id], sound, 0.35, 0, true)) {
        played++;
        this.ambientCursor = (this.ambientCursor + k + 1) % ids.length;
      }
    }
  }

  /**
   * Voz de una unidad: hablada (en el idioma de la corona, o en castellano) si está activada y hay voz para
   * ello; si no, las sílabas sintetizadas. Los animales siempre suenan sintetizados.
   */
  private voice(unitType: number, moment: VoiceMoment, unit = 0): void {
    const mode = this.voices?.mode() ?? 'chiptune';
    if (mode === 'off') return;
    // Aldeanos y aldeanas: la voz de la que contesta (los aspectos impares son mujeres), o se turnan.
    const woman = unitType === UnitType.Villager && (unit ? (unit & 1) === 1 : this.villagerVoice++ % 2 === 1);
    const faction = this.voices?.faction?.() ?? Faction.Castilla;
    if (mode === 'speech' && this.voices?.speech.canSpeak(faction) && UNIT_DEFS[unitType as UnitType].pop > 0) {
      this.voices.speech.say(voiceKind(unitType, woman), moment, this.voices.volume(), faction);
      return;
    }
    let name = voiceOf(unitType);
    if (name === 'voiceVillager' && woman) name = 'voiceWoman';
    this.play(name, moment === 'trained' ? 0.7 : 0.75, VOICE_GAP, moment === 'trained' ? undefined : 'voice');
  }

  private setTrack(track: TrackName): void {
    if (this.track === track) return;
    this.track = track;
    this.sink.music(track);
  }

  /** Sonido sin posición (interfaz, avisos). `key` agrupa varios nombres bajo la misma pausa. */
  private play(name: SoundName, gain: number, gap = MIN_GAP[name] ?? 0, key: string = name): boolean {
    const last = this.last.get(key) ?? -Infinity;
    if (this.now - last < gap) return false;
    this.last.set(key, this.now);
    this.sink.play(name, { gain });
    return true;
  }

  /**
   * Sonido en un punto del mapa (punto fijo): solo si se ve la casilla y está cerca de la pantalla.
   * `heat` suma a la intensidad del combate si se oye.
   */
  private at(x: number, y: number, name: SoundName, gain: number, heat: number, own = false): boolean {
    if (!own && !this.visible(x >> FP_SHIFT, y >> FP_SHIFT)) return false;
    const wx = ((x - y) * HALF_W) / FP_ONE;
    const wy = ((x + y) * HALF_H) / FP_ONE;
    const s = spatialize(wx, wy, this.view());
    if (!s) return false;
    const last = this.last.get(name) ?? -Infinity;
    if (this.now - last < (MIN_GAP[name] ?? 0)) return false;
    this.last.set(name, this.now);
    this.intensity += heat * s.gain;
    this.sink.play(name, { pan: s.pan, gain: gain * s.gain });
    return true;
  }
}

/** Sonido del trabajo de un aldeano según su tarea y el recurso. */
function workSound(task: number, nodeType: number): SoundName | null {
  if (task === Task.Build) return 'build';
  if (task !== Task.Gather) return null;
  switch (nodeType) {
    case NodeType.Tree:
      return 'chop';
    case NodeType.Gold:
    case NodeType.Stone:
      return 'mine';
    case NodeType.Farm:
    case NodeType.Berries:
      return 'farm';
    default:
      return null;
  }
}
