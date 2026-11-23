import type { Faction } from '../data/factions';
import { FACTION_VOICES, LANG_NAMES, type VoiceKind, type VoiceLang, type VoiceMoment, linesFor } from './voice-lines';

/**
 * Voces habladas de las unidades con la síntesis de voz del navegador (Web Speech), cada corona en su idioma
 * (src/audio/voice-lines.ts): frases cortas de época al seleccionar, al dar una orden y al salir de un edificio.
 * La voz depende de las que tenga instaladas el sistema. Si falta la del idioma de la corona, las unidades
 * hablan en castellano; si tampoco hay voz en español, el director usa las voces sintetizadas de siempre.
 */

export type { VoiceKind, VoiceMoment } from './voice-lines';
export { VOICE_LINES } from './voice-lines';

/** Tono y velocidad de cada tipo (sobre la voz elegida). */
const STYLE: Readonly<Record<VoiceKind, { readonly pitch: number; readonly rate: number; readonly female?: boolean }>> = {
  villager: { pitch: 1, rate: 1.05 },
  woman: { pitch: 1.05, rate: 1.05, female: true },
  soldier: { pitch: 0.85, rate: 1 },
  rider: { pitch: 0.95, rate: 1.1 },
  monk: { pitch: 0.9, rate: 0.9 },
  siege: { pitch: 0.8, rate: 0.95 },
};

/** Voces de hombre conocidas de cada idioma (macOS, Windows, Chrome…), por orden de preferencia. */
const MEN = [
  'jordi', // catalán
  'jorge', 'diego', 'juan', 'pablo', 'alvaro', 'enrique', 'carlos', // castellano
  'daniel', 'arthur', 'oliver', 'george', 'ryan', // inglés
  'thomas', 'paul', 'nicolas', 'henri', // francés
  'felipe', 'duarte', 'antonio', // portugués
  'majed', 'maged', 'tarik', 'naayf', 'hamed', // árabe
];

/**
 * Voces preferidas de cada tipo, por el nombre con que las traen los sistemas: el monje con voz de anciano,
 * los soldados y el asedio con voz grave, las aldeanas con voz de mujer. Primero se filtra por idioma, así que
 * la lista vale para todos.
 */
const PREFER: Readonly<Record<VoiceKind, readonly string[]>> = {
  villager: ['reed', 'eddy', ...MEN],
  woman: [
    'montse', 'herena', 'monica', 'paulina', 'marisol', 'helena', 'laura', 'elvira', 'lucia', 'kate', 'serena', 'hazel',
    'susan', 'amelie', 'audrey', 'aurelie', 'hortense', 'julie', 'joana', 'helia', 'luciana', 'hoda', 'laila', 'flo',
    'sandy', 'shelley',
  ],
  soldier: ['rocko', ...MEN, 'reed', 'eddy'],
  rider: ['reed', 'eddy', ...MEN, 'rocko'],
  monk: ['grandpa', ...MEN, 'reed', 'eddy'],
  siege: ['rocko', 'grandpa', ...MEN, 'reed', 'eddy'],
};

/** Nombres de voces de mujer (para corregir el tono si a un hombre le toca una de ellas, o al revés). */
const FEMALE =
  /monica|paulina|marisol|helena|laura|elvira|lucia|conchita|penelope|esperanza|sabina|dalia|elena|isabel|ximena|montse|herena|kate|serena|hazel|susan|zira|fiona|moira|tessa|karen|samantha|victoria|amelie|audrey|aurelie|hortense|julie|marie|joana|helia|luciana|fernanda|maria|hoda|laila|mariam|zeina|salma|flo\b|grandma|sandy|shelley|female|mujer|femme/;

/** Nombre sin tildes y en minúsculas. */
const plain = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const langOf = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace('_', '-');

/** Voces de broma de macOS (efectos, robots, cantadas), en inglés y en castellano: no sirven para hablar. */
const NOVELTY =
  /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy|buenas noticias|malas noticias|campanas|burbujas|violonchelos|bufon|organo|susurro)\b/;

/** Pequeño ruido para no repetir siempre la misma frase seguida. */
function pick<T>(list: readonly T[], last: number): [T, number] {
  if (list.length === 1) return [list[0], 0];
  let i = Math.floor(Math.random() * list.length);
  if (i === last) i = (i + 1) % list.length;
  return [list[i], i];
}

export class Speech {
  private all: SpeechSynthesisVoice[] = [];
  private readonly byLang = new Map<string, SpeechSynthesisVoice[]>();
  private readonly last = new Map<string, number>();
  private lastAt = -Infinity;

  constructor() {
    const synth = typeof speechSynthesis === 'undefined' ? null : speechSynthesis;
    if (!synth) return;
    const load = () => {
      this.all = synth.getVoices();
      this.byLang.clear();
    };
    load();
    synth.addEventListener?.('voiceschanged', load);
  }

  /** Voces de un idioma: primero las de las variantes preferidas (por orden) y las locales antes que las de red. */
  private voices(lang: VoiceLang, locales: readonly string[] = []): SpeechSynthesisVoice[] {
    const key = `${lang}:${locales.join(',')}`;
    let list = this.byLang.get(key);
    if (!list) {
      const rank = (v: SpeechSynthesisVoice) => {
        const i = locales.indexOf(langOf(v));
        return i < 0 ? locales.length : i;
      };
      list = this.all.filter((v) => langOf(v).startsWith(lang) && !NOVELTY.test(plain(v.name))).sort((a, b) => rank(a) - rank(b) || Number(b.localService) - Number(a.localService));
      this.byLang.set(key, list);
    }
    return list;
  }

  /** Idioma en que hablará esta corona: el suyo si hay voz, si no el castellano, o null si tampoco. */
  languageFor(faction: Faction): VoiceLang | null {
    const fv = FACTION_VOICES[faction];
    if (this.voices(fv.lang, fv.locales).length > 0) return fv.lang;
    return this.voices('es', ['es-es']).length > 0 ? 'es' : null;
  }

  /** Puede hablar esta corona (en su idioma o en castellano). */
  canSpeak(faction: Faction): boolean {
    return this.languageFor(faction) !== null;
  }

  /** Idiomas de las coronas y si este sistema tiene voz para ellos (para la pantalla de opciones). */
  languages(): { readonly name: string; readonly ok: boolean }[] {
    const seen = new Set<VoiceLang>();
    const out: { name: string; ok: boolean }[] = [];
    for (const fv of Object.values(FACTION_VOICES)) {
      if (seen.has(fv.lang)) continue;
      seen.add(fv.lang);
      out.push({ name: LANG_NAMES[fv.lang], ok: this.voices(fv.lang, fv.locales).length > 0 });
    }
    return out;
  }

  /**
   * Voz para un tipo de unidad: primero las que prefiere la corona (la escocesa para las aldeanas de Escocia),
   * luego, variante a variante del idioma (las de España antes que las de México…), las preferidas de cada
   * tipo; si no, una de hombre o de mujer según toque.
   */
  private voiceFor(faction: Faction, lang: VoiceLang, kind: VoiceKind): SpeechSynthesisVoice | null {
    const fv = FACTION_VOICES[faction];
    const list = this.voices(lang, lang === fv.lang ? fv.locales : ['es-es']);
    if (list.length === 0) return null;
    // Palabra entera: "Microsoft George - English" sí, pero "Paulina" no es "Paul".
    const named = (group: readonly SpeechSynthesisVoice[], names: readonly string[]) => {
      for (const name of names) {
        const word = new RegExp(`\\b${name}\\b`);
        const v = group.find((voice) => word.test(plain(voice.name)));
        if (v) return v;
      }
      return null;
    };
    const own = lang === fv.lang ? fv.prefer?.[kind] : undefined;
    const mine = own ? named(list, own) : null;
    if (mine) return mine;
    const groups: SpeechSynthesisVoice[][] = [];
    for (const v of list) {
      const last = groups[groups.length - 1];
      if (last && langOf(last[0]) === langOf(v)) last.push(v);
      else groups.push([v]);
    }
    for (const group of groups) {
      const v = named(group, PREFER[kind]);
      if (v) return v;
    }
    const female = STYLE[kind].female === true;
    return groups[0].find((v) => FEMALE.test(plain(v.name)) === female) ?? list[0];
  }

  /**
   * Dice una frase en el idioma de la corona. Una nueva interrumpe la anterior (como en el género), salvo que
   * llegue enseguida: así una ráfaga de clics no corta las frases a la mitad sin parar.
   */
  say(kind: VoiceKind, moment: VoiceMoment, volume: number, faction: Faction, now = performance.now()): boolean {
    const lang = this.languageFor(faction);
    if (!lang || volume <= 0 || typeof speechSynthesis === 'undefined') return false;
    if (now - this.lastAt < 450) return false;
    this.lastAt = now;
    const key = `${faction}:${lang}:${kind}:${moment}`;
    const [text, i] = pick(linesFor(faction, lang, kind, moment), this.last.get(key) ?? -1);
    this.last.set(key, i);
    const style = STYLE[kind];
    const u = new SpeechSynthesisUtterance(text);
    const voice = this.voiceFor(faction, lang, kind);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else {
      u.lang = lang;
    }
    // Si no hay una voz de mujer, la de hombre sube de tono.
    const femaleVoice = voice ? FEMALE.test(plain(voice.name)) : false;
    u.pitch = style.female && !femaleVoice ? 1.6 : !style.female && femaleVoice ? Math.max(0.1, style.pitch - 0.3) : style.pitch;
    u.rate = style.rate;
    u.volume = Math.max(0, Math.min(1, volume));
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    return true;
  }
}
