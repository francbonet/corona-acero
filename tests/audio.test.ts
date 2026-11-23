import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioDirector, type SoundSink, voiceOf } from '../src/audio/director';
import { TRACKS, type TrackName, renderTrack, tokens, trackDuration } from '../src/audio/music';
import { SOUNDS, SOUND_NAMES, type SoundName } from '../src/audio/sounds';
import { Speech, type VoiceKind, type VoiceMoment } from '../src/audio/speech';
import { FACTION_VOICES, VOICE_LINES, linesFor } from '../src/audio/voice-lines';
import { FACTION_COUNT, Faction } from '../src/data/factions';
import { spatialize } from '../src/audio/spatial';
import { noteFreq, synthesize } from '../src/audio/synth';
import { ProjectileKind } from '../src/data/combat';
import { TechType } from '../src/data/techs';
import { UnitType } from '../src/data/units';
import type { SimEvent } from '../src/sim/events';

const RATE = 22050;
const peak = (a: Float32Array) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

describe('sintetizador', () => {
  it('afina las notas en La 440', () => {
    expect(noteFreq('A4')).toBeCloseTo(440);
    expect(noteFreq('A5')).toBeCloseTo(880);
    expect(noteFreq('C4')).toBeCloseTo(261.63, 1);
    expect(noteFreq('F#3')).toBeCloseTo(185, 0);
    expect(() => noteFreq('H2')).toThrow();
  });

  it('todos los efectos suenan, sin pasarse de ±1 y siempre igual', () => {
    for (const name of SOUND_NAMES) {
      SOUNDS[name].forEach((recipe, v) => {
        const a = synthesize(recipe, RATE, v + 1);
        expect(a.length, name).toBeGreaterThan(RATE * 0.02);
        expect(a.every(Number.isFinite), name).toBe(true);
        expect(peak(a), name).toBeLessThanOrEqual(1);
        expect(peak(a), name).toBeGreaterThan(0.05);
        expect(synthesize(recipe, RATE, v + 1)).toEqual(a);
      });
    }
  });
});

describe('música', () => {
  it('cada pista dura lo que dicen sus compases y queda normalizada', () => {
    for (const [name, track] of Object.entries(TRACKS)) {
      const steps = track.channels.map((c) => tokens(c.pattern).length);
      // Todos los canales de una pista tienen los mismos pasos (si no, se desacompasan al repetirse).
      expect(new Set(steps).size, name).toBe(1);
      const samples = renderTrack(track, RATE);
      const expected = Math.ceil(trackDuration(track) * RATE);
      if (track.loop) expect(samples.length, name).toBe(expected);
      else expect(samples.length, name).toBeGreaterThan(expected);
      expect(peak(samples), name).toBeCloseTo(0.85, 2);
    }
    expect(trackDuration(TRACKS.economy)).toBeGreaterThan(30);
    expect(trackDuration(TRACKS.battle)).toBeGreaterThan(20);
  });
});

describe('sonido posicional', () => {
  const view = { cx: 0, cy: 0, halfW: 400, halfH: 200 };

  it('suena a tope en el centro, a un lado en el borde y nada lejos', () => {
    expect(spatialize(0, 0, view)).toEqual({ pan: 0, gain: 1 });
    const right = spatialize(400, 0, view)!;
    expect(right.pan).toBeGreaterThan(0.5);
    expect(right.gain).toBeCloseTo(0.7);
    expect(spatialize(-400, 0, view)!.pan).toBeLessThan(-0.5);
    expect(spatialize(600, 0, view)!.gain).toBeLessThan(0.4);
    expect(spatialize(900, 0, view)).toBeNull();
  });
});

class FakeSink implements SoundSink {
  readonly played: { name: SoundName; pan?: number; gain?: number }[] = [];
  readonly tracks: (TrackName | null)[] = [];
  play(name: SoundName, o: { pan?: number; gain?: number } = {}): void {
    this.played.push({ name, ...o });
  }
  music(track: TrackName | null): void {
    this.tracks.push(track);
  }
}

describe('director de audio', () => {
  const setup = (visible = true) => {
    const sink = new FakeSink();
    const d = new AudioDirector(sink, 1, () => ({ cx: 0, cy: 0, halfW: 400, halfH: 200 }), () => visible);
    return { sink, d };
  };
  const shoot: SimEvent = { kind: 'shoot', x: 256, y: 256, projectile: ProjectileKind.Arrow };

  it('pone la música tranquila al empezar', () => {
    const { sink, d } = setup();
    d.update(16);
    expect(sink.tracks).toEqual(['economy']);
  });

  it('no deja oír lo que oculta la niebla', () => {
    const { sink, d } = setup(false);
    d.handleEvents([shoot, { kind: 'hit', x: 256, y: 256 }]);
    expect(sink.played).toEqual([]);
  });

  it('no repite el mismo sonido en el mismo instante', () => {
    const { sink, d } = setup();
    d.handleEvents([shoot, shoot, shoot]);
    expect(sink.played.filter((p) => p.name === 'arrow')).toHaveLength(1);
    d.update(100);
    d.handleEvents([shoot]);
    expect(sink.played.filter((p) => p.name === 'arrow')).toHaveLength(2);
  });

  it('avisa con el cuerno cuando atacan al jugador, como mucho cada 20 s', () => {
    const { sink, d } = setup();
    const attacked: SimEvent = { kind: 'attacked', player: 1, x: 0, y: 0 };
    d.handleEvents([attacked]);
    d.update(5000);
    d.handleEvents([attacked, { kind: 'attacked', player: 2, x: 0, y: 0 }]);
    expect(sink.played.filter((p) => p.name === 'horn')).toHaveLength(1);
    d.update(16000);
    d.handleEvents([attacked]);
    expect(sink.played.filter((p) => p.name === 'horn')).toHaveLength(2);
  });

  it('pasa a la música de batalla con mucho combate y vuelve a la calma después', () => {
    const { sink, d } = setup();
    d.update(16);
    for (let i = 0; i < 40; i++) {
      d.handleEvents([shoot, { kind: 'hit', x: 256, y: 256 }, { kind: 'attacked', player: 1, x: 0, y: 0 }]);
      d.update(100);
    }
    expect(d.currentTrack).toBe('battle');
    for (let i = 0; i < 60; i++) d.update(1000);
    expect(d.currentTrack).toBe('economy');
    expect(sink.tracks).toEqual(['economy', 'battle', 'economy']);
  });

  it('fanfarria al avanzar de era y la pieza final según quién gana', () => {
    const { sink, d } = setup();
    d.handleEvents([{ kind: 'research', player: 1, tech: TechType.AdvanceBurgos }]);
    expect(sink.played.at(-1)?.name).toBe('fanfare');
    d.handleEvents([{ kind: 'victory', player: 1, reason: 'conquest' }]);
    expect(sink.tracks.at(-1)).toBe('victory');
    d.update(60000);
    expect(sink.tracks.at(-1)).toBe('victory'); // ya no cambia de música
    const other = setup();
    other.d.handleEvents([{ kind: 'victory', player: 2, reason: 'conquest' }]);
    expect(other.sink.tracks.at(-1)).toBe('defeat');
  });

  it('cada unidad responde con su voz', () => {
    expect(voiceOf(UnitType.Villager)).toBe('voiceVillager');
    expect(voiceOf(UnitType.Militia)).toBe('voiceSoldier');
    expect(voiceOf(UnitType.Knight)).toBe('voiceRider');
    expect(voiceOf(UnitType.Monk)).toBe('voiceMonk');
    expect(voiceOf(UnitType.Ram)).toBe('voiceSiege');
    expect(voiceOf(UnitType.Sheep)).toBe('voiceAnimal');
    const { sink, d } = setup();
    d.handleFeedback([{ kind: 'select', unitType: UnitType.Villager }]);
    d.update(1000);
    d.handleFeedback([{ kind: 'order', unitType: UnitType.Villager }, { kind: 'denied' }]);
    expect(sink.played.map((p) => p.name)).toEqual(['voiceVillager', 'voiceWoman', 'denied']);
  });
});

describe('voces habladas', () => {
  const setup = (mode: 'speech' | 'chiptune' | 'off', available = true, faction: Faction = Faction.Castilla) => {
    const sink = new FakeSink();
    const said: [VoiceKind, VoiceMoment][] = [];
    const factions: Faction[] = [];
    const speech = {
      canSpeak: () => available,
      say: (kind: VoiceKind, moment: VoiceMoment, _volume: number, f: Faction) => {
        said.push([kind, moment]);
        factions.push(f);
        return true;
      },
    };
    const d = new AudioDirector(sink, 1, () => ({ cx: 0, cy: 0, halfW: 400, halfH: 200 }), () => true, {
      speech,
      mode: () => mode,
      volume: () => 0.8,
      faction: () => faction,
    });
    return { sink, d, said, factions };
  };

  it('cada unidad contesta con su voz: la aldeana con voz de mujer y el soldado grita al atacar', () => {
    const { d, said, sink } = setup('speech');
    d.handleFeedback([{ kind: 'select', unitType: UnitType.Villager, unit: 3 }]);
    d.handleFeedback([{ kind: 'select', unitType: UnitType.Villager, unit: 4 }]);
    d.handleFeedback([{ kind: 'order', unitType: UnitType.Militia, unit: 9, attack: true }]);
    d.handleFeedback([{ kind: 'order', unitType: UnitType.Knight, unit: 10 }]);
    d.handleFeedback([{ kind: 'select', unitType: UnitType.Monk, unit: 11 }]);
    d.handleEvents([{ kind: 'trained', player: 1, unitType: UnitType.Ram, x: 0, y: 0 }]);
    expect(said).toEqual([
      ['woman', 'select'],
      ['villager', 'select'],
      ['soldier', 'attack'],
      ['rider', 'order'],
      ['monk', 'select'],
      ['siege', 'trained'],
    ]);
    // Las voces habladas no pasan por el sintetizador.
    expect(sink.played.some((p) => p.name.startsWith('voice'))).toBe(false);
  });

  it('sin voz en español (o si se eligen) suenan las sintetizadas; los animales, siempre sintetizados', () => {
    const none = setup('speech', false);
    none.d.handleFeedback([{ kind: 'select', unitType: UnitType.Villager, unit: 3 }]);
    expect(none.said).toHaveLength(0);
    expect(none.sink.played.map((p) => p.name)).toContain('voiceWoman');
    const synth = setup('chiptune');
    synth.d.handleFeedback([{ kind: 'select', unitType: UnitType.Militia, unit: 2 }]);
    expect(synth.said).toHaveLength(0);
    expect(synth.sink.played.map((p) => p.name)).toContain('voiceSoldier');
    const animal = setup('speech');
    animal.d.handleFeedback([{ kind: 'select', unitType: UnitType.Sheep, unit: 2 }]);
    expect(animal.said).toHaveLength(0);
    expect(animal.sink.played.map((p) => p.name)).toContain('voiceAnimal');
    const off = setup('off');
    off.d.handleFeedback([{ kind: 'select', unitType: UnitType.Militia, unit: 2 }]);
    expect(off.said).toHaveLength(0);
    expect(off.sink.played).toHaveLength(0);
  });

  it('todas las frases son distintas dentro de cada momento y ninguna está vacía, en todos los idiomas', () => {
    const kinds = Object.keys(VOICE_LINES.es).sort();
    for (const [lang, byKind] of Object.entries(VOICE_LINES)) {
      expect(Object.keys(byKind).sort(), lang).toEqual(kinds);
      for (const byMoment of Object.values(byKind)) {
        expect(Object.keys(byMoment).sort(), lang).toEqual(['attack', 'order', 'select', 'trained']);
        for (const lines of Object.values(byMoment)) {
          expect(lines.length).toBeGreaterThan(0);
          expect(new Set(lines).size).toBe(lines.length);
          for (const l of lines) expect(l.trim().length).toBeGreaterThan(2);
        }
      }
    }
  });

  it('las unidades hablan en el idioma de la corona del jugador', () => {
    const { d, factions } = setup('speech', true, Faction.Aragon);
    d.handleFeedback([{ kind: 'select', unitType: UnitType.Militia, unit: 2 }]);
    expect(factions).toEqual([Faction.Aragon]);
  });

  it('cada corona tiene su idioma y sus gritos de guerra, solo en los ataques de soldados y jinetes', () => {
    expect(Object.keys(FACTION_VOICES)).toHaveLength(FACTION_COUNT);
    expect(FACTION_VOICES[Faction.Aragon].lang).toBe('ca');
    expect(FACTION_VOICES[Faction.Inglaterra].lang).toBe('en');
    expect(FACTION_VOICES[Faction.Escocia].lang).toBe('en');
    expect(FACTION_VOICES[Faction.Francia].lang).toBe('fr');
    expect(FACTION_VOICES[Faction.Portugal].lang).toBe('pt');
    expect(FACTION_VOICES[Faction.Nazari].lang).toBe('ar');
    expect(linesFor(Faction.Aragon, 'ca', 'soldier', 'attack')).toContain('Desperta ferro!');
    expect(linesFor(Faction.Aragon, 'ca', 'villager', 'attack')).not.toContain('Desperta ferro!');
    expect(linesFor(Faction.Aragon, 'ca', 'soldier', 'select')).not.toContain('Desperta ferro!');
    // Si habla en castellano porque no hay voz en catalán, no grita en catalán.
    expect(linesFor(Faction.Aragon, 'es', 'soldier', 'attack')).toEqual(VOICE_LINES.es.soldier.attack);
    expect(linesFor(Faction.Escocia, 'en', 'rider', 'attack')).toContain('For Scotland!');
    expect(linesFor(Faction.Inglaterra, 'en', 'rider', 'attack')).not.toContain('For Scotland!');
  });
});

describe('voces del sistema', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Una síntesis de voz de mentira con estas voces; devuelve lo que se ha dicho. */
  const fakeSystem = (voices: { name: string; lang: string; localService?: boolean }[]) => {
    const spoken: { text: string; voice: string; lang: string; pitch: number }[] = [];
    vi.stubGlobal('speechSynthesis', {
      getVoices: () => voices.map((v) => ({ localService: true, ...v })),
      addEventListener: () => {},
      cancel: () => {},
      speak: (u: { text: string; voice: { name: string } | null; lang: string; pitch: number }) => spoken.push({ text: u.text, voice: u.voice?.name ?? '', lang: u.lang, pitch: u.pitch }),
    });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        voice: unknown = null;
        lang = '';
        pitch = 1;
        rate = 1;
        volume = 1;
        constructor(readonly text: string) {}
      },
    );
    return spoken;
  };

  it('la Corona de Aragón habla en catalán con la voz catalana; cada tipo, con su voz', () => {
    const spoken = fakeSystem([
      { name: 'Jorge', lang: 'es-ES' },
      { name: 'Montse', lang: 'ca-ES' },
      { name: 'Jordi', lang: 'ca-ES' },
    ]);
    const s = new Speech();
    expect(s.languageFor(Faction.Aragon)).toBe('ca');
    s.say('woman', 'select', 1, Faction.Aragon, 0);
    s.say('soldier', 'attack', 1, Faction.Aragon, 1000);
    expect(spoken[0].voice).toBe('Montse');
    expect(VOICE_LINES.ca.woman.select).toContain(spoken[0].text);
    expect(spoken[1].voice).toBe('Jordi');
    expect(linesFor(Faction.Aragon, 'ca', 'soldier', 'attack')).toContain(spoken[1].text);
  });

  it('sin voz en su idioma, la corona habla en castellano; sin ninguna, no puede hablar', () => {
    const spoken = fakeSystem([
      { name: 'Jorge', lang: 'es-ES' },
      { name: 'Daniel', lang: 'en-GB' },
    ]);
    const s = new Speech();
    expect(s.languageFor(Faction.Francia)).toBe('es');
    expect(s.languageFor(Faction.Inglaterra)).toBe('en');
    s.say('villager', 'order', 1, Faction.Francia, 0);
    expect(spoken[0].voice).toBe('Jorge');
    expect(VOICE_LINES.es.villager.order).toContain(spoken[0].text);
    expect(s.languages().find((l) => l.name === 'francés')?.ok).toBe(false);
    expect(s.languages().find((l) => l.name === 'inglés')?.ok).toBe(true);

    fakeSystem([]);
    const mute = new Speech();
    expect(mute.canSpeak(Faction.Castilla)).toBe(false);
    expect(mute.say('villager', 'order', 1, Faction.Castilla, 0)).toBe(false);
  });

  it('las aldeanas escocesas prefieren la voz escocesa, y "Paulina" no cuenta como "Paul"', () => {
    const spoken = fakeSystem([
      { name: 'Daniel', lang: 'en-GB' },
      { name: 'Fiona', lang: 'en-GB' },
      { name: 'Paulina', lang: 'es-MX' },
      { name: 'Jorge', lang: 'es-ES' },
    ]);
    const s = new Speech();
    s.say('woman', 'select', 1, Faction.Escocia, 0);
    expect(spoken[0].voice).toBe('Fiona');
    s.say('villager', 'select', 1, Faction.Castilla, 1000);
    expect(spoken[1].voice).toBe('Jorge');
  });
});
