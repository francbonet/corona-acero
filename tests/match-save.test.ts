import { describe, expect, it } from 'vitest';
import { Difficulty } from '../src/ai/difficulty';
import { Faction } from '../src/data/factions';
import { DEFAULT_MATCH, MAP_SIZES, createMatch, matchFromParams, normalizeMatch, resolveFactions, rivalInfo } from '../src/game/match';
import { cloneSim, restoreSim, snapshotSim } from '../src/game/save';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../src/game/settings';

describe('partida configurable', () => {
  it('la partida por defecto es Castilla contra una IA inglesa en un mapa mediano', () => {
    const m = createMatch(DEFAULT_MATCH);
    expect(m.factions).toEqual([Faction.Castilla, Faction.Inglaterra]);
    expect(m.ais).toHaveLength(1);
    expect(m.sim.map.width).toBe(MAP_SIZES.medium.tiles);
    expect(m.starts).toHaveLength(2);
    expect(rivalInfo(m.sim).map((r) => r.player)).toEqual([2]);
  });

  it('con tres rivales el mapa crece hasta que caben, y cada IA lleva un señor distinto', () => {
    const c = normalizeMatch({ ...DEFAULT_MATCH, mapSize: 'small', rivals: [0, 1, 2].map(() => ({ faction: Faction.Castilla, difficulty: Difficulty.Easy })) });
    expect(c.mapSize).toBe('large');
    const m = createMatch(c);
    expect(m.ais).toHaveLength(3);
    expect(m.starts).toHaveLength(4);
    const names = rivalInfo(m.sim).map((r) => r.name);
    expect(new Set(names).size).toBe(3);
  });

  it('las facciones al azar salen de la semilla (la misma semilla, las mismas)', () => {
    const c = { ...DEFAULT_MATCH, faction: 'random' as const, rivals: [{ faction: 'random' as const, difficulty: Difficulty.Medium }] };
    expect(resolveFactions(c)).toEqual(resolveFactions(c));
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) seen.add(resolveFactions({ ...c, seed: `s${i}` }).join(','));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('se puede montar desde la URL', () => {
    const c = matchFromParams(new URLSearchParams('seed=abc&faccion=inglaterra&rivales=2&dificultad=dificil&mapa=pequeno'));
    expect(c.seed).toBe('abc');
    expect(c.faction).toBe(Faction.Inglaterra);
    expect(c.rivals).toHaveLength(2);
    expect(c.rivals[0]).toEqual({ faction: Faction.Castilla, difficulty: Difficulty.Hard });
    // Tres jugadores no caben en el pequeño.
    expect(c.mapSize).toBe('medium');
    expect(matchFromParams(new URLSearchParams('ia=no')).passive).toBe(true);
  });
});

describe('guardar y cargar', () => {
  it('una partida cargada sigue exactamente igual que la original (con la IA)', () => {
    const m = createMatch(DEFAULT_MATCH);
    for (let i = 0; i < 400; i++) m.sim.step();
    const copy = cloneSim(m.sim);
    expect(copy.stateHash()).toBe(m.sim.stateHash());
    for (let i = 0; i < 400; i++) {
      m.sim.step();
      copy.step();
    }
    expect(copy.tick).toBe(m.sim.tick);
    expect(copy.stateHash()).toBe(m.sim.stateHash());
  });

  it('la copia es independiente del original', () => {
    const m = createMatch(DEFAULT_MATCH);
    const before = m.sim.stateHash();
    const copy = cloneSim(m.sim);
    for (let i = 0; i < 100; i++) copy.step();
    expect(m.sim.stateHash()).toBe(before);
    expect(copy.stateHash()).not.toBe(before);
  });

  it('rechaza partidas de otra versión', () => {
    const snap = structuredClone(snapshotSim(createMatch(DEFAULT_MATCH).sim));
    expect(() => restoreSim({ ...snap, version: 999 })).toThrow();
  });
});

describe('opciones del juego', () => {
  it('sin almacenamiento o con datos raros usa las de por defecto, y recorta lo que se sale de rango', () => {
    const g = globalThis as { localStorage?: unknown };
    const old = g.localStorage;
    try {
      g.localStorage = undefined;
      expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
      const store = new Map<string, string>();
      g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
      store.set('corona-y-acero:opciones', '{"scrollSpeed": 9, "edgeScroll": false, "gameSpeed": 3, "autosave": "si"}');
      expect(loadSettings()).toEqual({ scrollSpeed: 2, edgeScroll: false, gameSpeed: 1, autosave: true, voices: 'speech' });
      store.set('corona-y-acero:opciones', 'no es json');
      expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
      saveSettings({ ...DEFAULT_SETTINGS, gameSpeed: 1.5 });
      expect(loadSettings().gameSpeed).toBe(1.5);
    } finally {
      g.localStorage = old;
    }
  });
});
