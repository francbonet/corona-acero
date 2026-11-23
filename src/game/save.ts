import { AiPlayer } from '../ai/ai-player';
import { AiMemory } from '../ai/context';
import { Fnv32 } from '../engine/hash';
import { Rng } from '../engine/rng';
import { GameMap } from '../map/game-map';
import { CommandQueue } from '../sim/commands';
import { Entities } from '../sim/entities';
import { PathGrid } from '../sim/path-grid';
import { Pathfinder } from '../sim/pathfinding';
import { Players } from '../sim/players';
import { SpatialHash } from '../sim/spatial-hash';
import { Simulation } from '../sim/simulation';
import { StatsCache } from '../sim/stats';
import { PathingSystem } from '../sim/systems/pathing';
import { Visibility } from '../sim/visibility';

/**
 * Guardar y cargar la simulación entera (con las IA): el estado es un grafo de objetos sin funciones, así que
 * el clonado estructurado del navegador (el mismo que usa IndexedDB) lo copia tal cual, con sus arrays tipados,
 * Maps, Sets y referencias compartidas. Solo se pierden las clases: aquí se apunta cuál era cada objeto
 * para devolverle su prototipo al cargar. Como la simulación es determinista, una partida cargada sigue
 * exactamente igual que la original.
 */

/** Versión del formato: si cambia el estado de la simulación, las partidas viejas dejan de cargarse. */
export const SAVE_VERSION = 1;

/** Clases que pueden aparecer en el estado, con un nombre fijo (los de las clases cambian al minificar). */
const CLASSES: Readonly<Record<string, { prototype: object }>> = {
  Simulation,
  GameMap,
  PathGrid,
  Entities,
  Players,
  Rng,
  PathingSystem,
  Pathfinder,
  SpatialHash,
  StatsCache,
  AiPlayer,
  AiMemory,
  Visibility,
  CommandQueue,
  Fnv32,
};
const NAME_OF = new Map<object, string>(Object.entries(CLASSES).map(([name, c]) => [c.prototype, name]));
const PLAIN = new Set<object | null>([Object.prototype, Array.prototype, Map.prototype, Set.prototype, Date.prototype, null]);

export interface SimSnapshot {
  readonly version: number;
  readonly root: Simulation;
  /** Objetos con clase (los mismos del grafo: al clonarlo todo junto, siguen siendo los mismos en la copia). */
  readonly tagged: readonly object[];
  readonly classes: readonly string[];
}

/**
 * Prepara la simulación para clonarla. No copia nada: la copia la hace `structuredClone` o IndexedDB al
 * guardar, de una vez y sin pausa visible (unos milisegundos). Falla si encuentra una función o una clase que
 * no sabe restaurar, para que un cambio en la simulación no rompa las partidas guardadas en silencio.
 */
export function snapshotSim(sim: Simulation): SimSnapshot {
  const tagged: object[] = [];
  const classes: string[] = [];
  const seen = new Set<object>();
  const visit = (value: unknown, path: string): void => {
    if (typeof value === 'function') throw new Error(`No se puede guardar una función (${path})`);
    if (value === null || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return;
    const proto = Object.getPrototypeOf(value) as object | null;
    if (!PLAIN.has(proto)) {
      const name = NAME_OF.get(proto as object);
      if (!name) throw new Error(`Clase sin registrar en el guardado: ${(value as object).constructor?.name ?? '?'} (${path})`);
      tagged.push(value);
      classes.push(name);
    }
    if (value instanceof Map) {
      for (const [k, v] of value) {
        visit(k, `${path}.key`);
        visit(v, `${path}[${String(k)}]`);
      }
    } else if (value instanceof Set) {
      for (const v of value) visit(v, `${path}[]`);
    } else {
      for (const [k, v] of Object.entries(value)) visit(v, `${path}.${k}`);
    }
  };
  visit(sim, 'sim');
  return { version: SAVE_VERSION, root: sim, tagged, classes };
}

/** Devuelve a cada objeto de una copia su clase y entrega la simulación lista para seguir. */
export function restoreSim(snap: SimSnapshot): Simulation {
  if (snap.version !== SAVE_VERSION) throw new Error(`Partida de otra versión (${snap.version}; esta es la ${SAVE_VERSION})`);
  snap.tagged.forEach((obj, i) => {
    const cls = CLASSES[snap.classes[i]];
    if (!cls) throw new Error(`Clase desconocida en la partida: ${snap.classes[i]}`);
    Object.setPrototypeOf(obj, cls.prototype);
    if (obj instanceof Entities) obj.fillMissing();
    else if (obj instanceof Players) obj.fitTechCount();
  });
  return snap.root;
}

/** Copia independiente de una simulación (guardar y cargar en memoria; también para pruebas). */
export function cloneSim(sim: Simulation): Simulation {
  return restoreSim(structuredClone(snapshotSim(sim)));
}
