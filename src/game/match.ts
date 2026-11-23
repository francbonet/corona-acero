import { AiPlayer } from '../ai/ai-player';
import { DIFFICULTY_DEFS, Difficulty, difficultyFromKey } from '../ai/difficulty';
import { DEFAULT_SEED, SIM_TICK_RATE } from '../config';
import { FACTION_COUNT, FACTION_DEFS, Faction } from '../data/factions';
import { Rng, hashString } from '../engine/rng';
import { EUROPE_SIZE, generateEuropeMap } from '../map/europe';
import { generateMatchMap } from '../map/generator';
import { Simulation } from '../sim/simulation';
import type { RivalInfo } from './client';
import { type StartInfo, setupMatch } from './scenario';

/**
 * Configuración de una partida libre (lo que se elige en el menú de nueva partida) y cómo se monta: mapa,
 * jugadores con su facción y las IA rivales. Todo sale de la semilla, así que la misma configuración da
 * siempre la misma partida.
 */

export const MAP_SIZES = {
  small: { key: 'pequeno', name: 'Pequeño', tiles: 80, maxPlayers: 2 },
  medium: { key: 'mediano', name: 'Mediano', tiles: 96, maxPlayers: 3 },
  large: { key: 'grande', name: 'Grande', tiles: 120, maxPlayers: 4 },
  /** Europa occidental: cada corona sale de su capital (src/map/europe.ts). */
  europe: { key: 'europa', name: 'Europa', tiles: EUROPE_SIZE, maxPlayers: 4 },
} as const;
export type MapSize = keyof typeof MAP_SIZES;
export const MAP_SIZE_ORDER: readonly MapSize[] = ['small', 'medium', 'large', 'europe'];

/** En el mapa de Europa cada corona tiene su sitio, así que no puede haber dos iguales. */
export const isEurope = (c: Pick<MatchConfig, 'mapSize'>): boolean => c.mapSize === 'europe';

/** Facción elegida, o al azar (se resuelve con la semilla). */
export type FactionChoice = Faction | 'random';

export interface RivalConfig {
  readonly faction: FactionChoice;
  readonly difficulty: Difficulty;
}

export interface MatchConfig {
  readonly seed: string;
  readonly mapSize: MapSize;
  readonly faction: FactionChoice;
  /** De 1 a 3 rivales, todos contra todos. */
  readonly rivals: readonly RivalConfig[];
  /** Depuración: los rivales existen pero no juegan (`?ia=no`). */
  readonly passive?: boolean;
}

export const MAX_RIVALS = 3;

/** La otra facción (la del rival por defecto). */
export function otherFaction(f: Faction): Faction {
  return f === Faction.Castilla ? Faction.Inglaterra : Faction.Castilla;
}

export const DEFAULT_MATCH: MatchConfig = {
  seed: DEFAULT_SEED,
  mapSize: 'medium',
  faction: Faction.Castilla,
  rivals: [{ faction: Faction.Inglaterra, difficulty: Difficulty.Medium }],
};

/** El tamaño más pequeño en el que caben estos jugadores. */
export function minMapSize(players: number): MapSize {
  return MAP_SIZE_ORDER.find((s) => MAP_SIZES[s].maxPlayers >= players) ?? 'large';
}

/**
 * Corrige una configuración: entre 1 y 3 rivales y un mapa en el que quepan todos. En el de Europa, un rival
 * con la misma corona que otro jugador pasa a ir al azar (entre las que queden libres).
 */
export function normalizeMatch(c: MatchConfig): MatchConfig {
  let rivals = c.rivals.slice(0, MAX_RIVALS);
  if (rivals.length === 0) rivals.push(DEFAULT_MATCH.rivals[0]);
  const players = rivals.length + 1;
  const needed = minMapSize(players);
  const mapSize = MAP_SIZE_ORDER.indexOf(c.mapSize) < MAP_SIZE_ORDER.indexOf(needed) ? needed : c.mapSize;
  if (mapSize === 'europe') {
    const taken = new Set<FactionChoice>(c.faction === 'random' ? [] : [c.faction]);
    rivals = rivals.map((r) => {
      if (r.faction === 'random') return r;
      if (taken.has(r.faction)) return { ...r, faction: 'random' };
      taken.add(r.faction);
      return r;
    });
  }
  return { ...c, seed: c.seed.trim() || DEFAULT_SEED, mapSize, rivals };
}

/**
 * Facción de cada jugador (el local primero), resolviendo las que van al azar con la semilla. En el mapa de
 * Europa, las que van al azar se eligen entre las que no tiene nadie.
 */
export function resolveFactions(c: MatchConfig): Faction[] {
  const rng = new Rng(hashString(`${c.seed}:facciones`));
  const all = c.rivals.map((r) => r.faction);
  all.unshift(c.faction);
  if (!isEurope(c)) return all.map((f) => (f === 'random' ? (rng.nextU32() % FACTION_COUNT) as Faction : f));
  const free = (Object.keys(FACTION_DEFS).map(Number) as Faction[]).filter((f) => !all.includes(f));
  return all.map((f) => (f === 'random' ? free.splice(rng.nextU32() % free.length, 1)[0] : f));
}

const factionByKey = (key: string | null): FactionChoice | null => {
  if (key === 'aleatoria') return 'random';
  // Enlaces de antes de que la corona se llamara así.
  if (key === 'catalunya') return Faction.Aragon;
  for (const [f, def] of Object.entries(FACTION_DEFS)) if (def.key === key) return Number(f) as Faction;
  return null;
};

/** Parámetros de la URL que arrancan una partida directamente, sin pasar por el menú. */
export const MATCH_PARAMS = ['seed', 'faccion', 'dificultad', 'rivales', 'mapa', 'ia'] as const;

export function hasMatchParams(params: URLSearchParams): boolean {
  return MATCH_PARAMS.some((p) => params.has(p));
}

/**
 * Partida desde la URL (para probar y compartir): `?seed=…&faccion=inglaterra&rivales=2&dificultad=dificil&mapa=grande`.
 * El primer rival lleva la otra facción y los demás, una al azar. `?ia=no` deja a los rivales quietos.
 */
export function matchFromParams(params: URLSearchParams): MatchConfig {
  const faction = factionByKey(params.get('faccion')) ?? Faction.Castilla;
  const difficulty = difficultyFromKey(params.get('dificultad'));
  const count = Math.max(1, Math.min(MAX_RIVALS, Number(params.get('rivales')) || 1));
  const first: FactionChoice = faction === 'random' ? 'random' : otherFaction(faction);
  const rivals = Array.from({ length: count }, (_, i): RivalConfig => ({ faction: i === 0 ? first : 'random', difficulty }));
  const size = (Object.keys(MAP_SIZES) as MapSize[]).find((s) => MAP_SIZES[s].key === params.get('mapa')) ?? DEFAULT_MATCH.mapSize;
  return normalizeMatch({ seed: params.get('seed') || DEFAULT_SEED, mapSize: size, faction, rivals, passive: params.get('ia') === 'no' });
}

export interface Match {
  readonly config: MatchConfig;
  readonly sim: Simulation;
  readonly starts: readonly StartInfo[];
  readonly factions: readonly Faction[];
  readonly ais: readonly AiPlayer[];
}

/** Monta la partida: mapa para todos los jugadores, sus posiciones de salida y las IA. */
export function createMatch(config: MatchConfig): Match {
  const c = normalizeMatch(config);
  const players = c.rivals.length + 1;
  const tiles = MAP_SIZES[c.mapSize].tiles;
  const factions = resolveFactions(c);
  const map = isEurope(c) ? generateEuropeMap({ seed: c.seed, factions }) : generateMatchMap({ width: tiles, height: tiles, seed: c.seed, players });
  const sim = new Simulation({ map, seed: hashString(c.seed), tickRate: SIM_TICK_RATE });
  const starts = setupMatch(sim, factions);
  const ais: AiPlayer[] = [];
  if (!c.passive) {
    const lords: string[] = [];
    c.rivals.forEach((r, i) => {
      const ai = new AiPlayer(sim, i + 2, { difficulty: r.difficulty, avoidLords: lords });
      lords.push(ai.lord.name);
      sim.addController(ai);
      ais.push(ai);
    });
  }
  return { config: c, sim, starts, factions, ais };
}

/** Rivales para el HUD: el nombre del señor que lleva cada IA, su corona y su dificultad. */
export function rivalInfo(sim: Simulation): RivalInfo[] {
  return sim.controllers
    .filter((c): c is AiPlayer => c instanceof AiPlayer)
    .map((ai) => ({
      player: ai.player,
      name: `${ai.lord.name} ${ai.lord.title}`,
      detail: `${FACTION_DEFS[sim.players.faction[ai.player] as Faction].name} · ${DIFFICULTY_DEFS[ai.difficulty].name}`,
    }));
}
