import type { MatchConfig } from './match';
import type { SimSnapshot } from './save';

/**
 * Partidas guardadas en IndexedDB, en el navegador del jugador. Dos almacenes: la lista (ligera, para el menú)
 * y los datos de cada partida (la simulación entera, unos pocos MB).
 */

const DB_NAME = 'corona-y-acero';
const DB_VERSION = 1;
const META = 'partidas';
const DATA = 'datos';

/** Hueco del autoguardado (solo hay uno, y se sobrescribe). */
export const AUTOSAVE_ID = 'auto';

export interface SaveMeta {
  readonly id: string;
  readonly name: string;
  /** Fecha (ms desde 1970). */
  readonly savedAt: number;
  /** Tiempo de partida en segundos. */
  readonly gameSeconds: number;
  readonly era: string;
  /** "Castilla contra Inglaterra" y similares. */
  readonly summary: string;
  readonly auto?: boolean;
}

export interface SaveData {
  readonly meta: SaveMeta;
  readonly config: MatchConfig;
  readonly sim: SimSnapshot;
  readonly client: { readonly groups: readonly (readonly number[])[] };
  readonly camera: { readonly x: number; readonly y: number; readonly zoom: number };
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Este navegador no permite guardar partidas'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(DATA)) db.createObjectStore(DATA);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('No se pudo abrir el almacén de partidas'));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Falló la operación con las partidas guardadas'));
    tx.onabort = () => reject(tx.error ?? new Error('Se canceló la operación con las partidas guardadas'));
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Falló la lectura de las partidas guardadas'));
  });
}

/** Partidas guardadas, de la más reciente a la más antigua. */
export async function listSaves(): Promise<SaveMeta[]> {
  const db = await open();
  try {
    const all = await request(db.transaction(META, 'readonly').objectStore(META).getAll() as IDBRequest<SaveMeta[]>);
    return all.sort((a, b) => b.savedAt - a.savedAt);
  } finally {
    db.close();
  }
}

/**
 * Guarda (o sobrescribe) una partida. El navegador copia el estado en el momento de llamar, así que la
 * partida puede seguir mientras se escribe.
 */
export async function writeSave(data: SaveData): Promise<void> {
  const db = await open();
  try {
    const tx = db.transaction([META, DATA], 'readwrite');
    tx.objectStore(DATA).put(data, data.meta.id);
    tx.objectStore(META).put(data.meta);
    await done(tx);
  } finally {
    db.close();
  }
}

export async function readSave(id: string): Promise<SaveData | null> {
  const db = await open();
  try {
    const data = await request(db.transaction(DATA, 'readonly').objectStore(DATA).get(id) as IDBRequest<SaveData | undefined>);
    return data ?? null;
  } finally {
    db.close();
  }
}

export async function deleteSave(id: string): Promise<void> {
  const db = await open();
  try {
    const tx = db.transaction([META, DATA], 'readwrite');
    tx.objectStore(DATA).delete(id);
    tx.objectStore(META).delete(id);
    await done(tx);
  } finally {
    db.close();
  }
}

/** Identificador nuevo para una partida guardada a mano. */
export function newSaveId(): string {
  return `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}
