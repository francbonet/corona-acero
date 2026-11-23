import type { AnimName } from '../rig/catalog';
import type { Direction } from '../rig/raster';

/**
 * Lectura de hojas de sprites exportadas desde Aseprite (docs/arte.md §10): PNG + JSON en formato
 * "Array" con las animaciones como etiquetas `<animación>/<dirección>`, por ejemplo `andar/SO`.
 * Es puro: el PNG lo carga el navegador y aquí solo se interpretan los datos y se recolorea.
 */

/** Nombre de cada animación en las etiquetas de Aseprite. */
export const ANIM_TAGS: Readonly<Record<AnimName, string>> = {
  idle: 'reposo',
  walk: 'andar',
  attack: 'atacar',
  die: 'morir',
  chop: 'talar',
  mine: 'minar',
  farm: 'cosechar',
  build: 'construir',
  deploy: 'montar',
  ready: 'montado',
};

/** Direcciones en las etiquetas (en castellano: SO = suroeste…). */
export const DIR_TAGS: Readonly<Record<Direction, string>> = { S: 'S', SW: 'SO', W: 'O', NW: 'NO', N: 'N' };

export interface FrameRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly duration: number;
}

export interface AsepriteSheet {
  /** Tamaño de un fotograma (todos iguales). */
  readonly frameW: number;
  readonly frameH: number;
  /** Punto de los pies dentro del fotograma (slice "pies" con pivote); si no hay, abajo en el centro. */
  readonly pivot: { readonly x: number; readonly y: number };
  /** anims[animación][dirección] = fotogramas en orden. */
  readonly anims: ReadonlyMap<AnimName, ReadonlyMap<Direction, readonly FrameRect[]>>;
}

interface AsepriteJson {
  readonly frames: readonly { readonly frame: { x: number; y: number; w: number; h: number }; readonly duration?: number }[] | Record<string, { readonly frame: { x: number; y: number; w: number; h: number }; readonly duration?: number }>;
  readonly meta: {
    readonly frameTags?: readonly { readonly name: string; readonly from: number; readonly to: number }[];
    readonly slices?: readonly { readonly name: string; readonly keys?: readonly { readonly bounds?: { x: number; y: number }; readonly pivot?: { x: number; y: number } }[] }[];
  };
}

/** Interpreta el JSON de Aseprite. Las etiquetas que no siguen el formato se ignoran. */
export function parseAseprite(json: unknown): AsepriteSheet {
  const data = json as AsepriteJson;
  const list = Array.isArray(data.frames) ? data.frames : Object.values(data.frames ?? {});
  if (list.length === 0) throw new Error('La hoja de Aseprite no tiene fotogramas');
  const frames = list.map((f) => ({ ...f.frame, duration: f.duration ?? 100 }));
  const animByTag = new Map(Object.entries(ANIM_TAGS).map(([anim, tag]) => [tag, anim as AnimName]));
  const dirByTag = new Map(Object.entries(DIR_TAGS).map(([dir, tag]) => [tag, dir as Direction]));
  const anims = new Map<AnimName, Map<Direction, FrameRect[]>>();
  for (const tag of data.meta?.frameTags ?? []) {
    const [animTag, dirTag] = tag.name.split('/');
    const anim = animByTag.get(animTag);
    const dir = dirByTag.get(dirTag);
    if (!anim || !dir) continue;
    let byDir = anims.get(anim);
    if (!byDir) anims.set(anim, (byDir = new Map()));
    byDir.set(dir, frames.slice(tag.from, tag.to + 1));
  }
  const key = data.meta?.slices?.find((s) => s.name === 'pies')?.keys?.[0];
  const pivot = key?.pivot ? { x: (key.bounds?.x ?? 0) + key.pivot.x, y: (key.bounds?.y ?? 0) + key.pivot.y } : { x: Math.floor(frames[0].w / 2), y: frames[0].h - 5 };
  return { frameW: frames[0].w, frameH: frames[0].h, pivot, anims };
}

/**
 * Tonos reservados para el color de equipo, de claro a oscuro (magentas puros que no se usan en nada más).
 * Se sustituyen por la rampa del jugador al cargar la hoja: así no hay que dibujar nada por jugador.
 */
export const TEAM_KEYS: readonly (readonly [number, number, number])[] = [
  [255, 0, 255],
  [204, 0, 204],
  [153, 0, 153],
  [102, 0, 102],
];

/** Cambia en `rgba` los tonos reservados por la rampa del jugador (4 colores #rrggbb de oscuro a claro). */
export function recolorTeam(rgba: Uint8ClampedArray, ramp: readonly [string, string, string, string]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba);
  // Clave clara → tono claro de la rampa, y así hasta la oscura.
  const target = [ramp[3], ramp[2], ramp[1], ramp[0]].map((hex) => {
    const n = Number.parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  });
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) continue;
    for (let k = 0; k < TEAM_KEYS.length; k++) {
      const key = TEAM_KEYS[k];
      if (out[i] === key[0] && out[i + 1] === key[1] && out[i + 2] === key[2]) {
        out[i] = target[k][0];
        out[i + 1] = target[k][1];
        out[i + 2] = target[k][2];
        break;
      }
    }
  }
  return out;
}
