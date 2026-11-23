import { BUILDING_DEFS, BuildingType } from '../../data/buildings';
import type { Architecture } from '../../data/factions';
import { Builder, type Surface } from './builder';
import { type MatToken, NONE, type Paint } from './iso-raster';
import * as P from './patterns';
import { noise } from './patterns';

/**
 * Modelos de los edificios (docs/arte.md §5): cada uno se arma con las piezas de `Builder` según la era y la
 * arquitectura de la facción.
 * - Castilla, mudéjar: ladrillo, encalado, teja árabe de poca pendiente, arcos de herradura con alfiz,
 *   almenas escalonadas y franjas de azulejo verde.
 * - Inglaterra, gótica: sillería gris, entramado de madera blanco y negro, tejados empinados de paja
 *   (primeras eras) o pizarra y arcos apuntados.
 * El centro de la villa y las casas cambian mucho de una era a otra (madera → piedra y madera → piedra y teja);
 * los demás, en los materiales del tejado.
 */

export type { Architecture };

/** Fases que se dibujan de un edificio. */
export const BuildStage = {
  /** Cimientos: el solar marcado con piedras y estacas. */
  Foundation: 0,
  /** Obra a media altura, con andamios. */
  Frame: 1,
  /** Muros terminados sin tejado, con andamios. */
  Walls: 2,
  Complete: 3,
  /** Con grietas, hollín y el tejado roto (por debajo de la mitad de vida). */
  Damaged: 4,
  /** Lo que queda tras derribarlo. */
  Ruins: 5,
  /** Granjas: a medio cosechar y casi agotadas. */
  FarmHalf: 6,
  FarmLow: 7,
} as const;
export type BuildStage = (typeof BuildStage)[keyof typeof BuildStage];
export const BUILD_STAGE_COUNT = 8;

/** Muros conectados con sus vecinos: bits −y (arriba a la derecha), +x, +y, −x. */
export const WallLink = { North: 1, East: 2, South: 4, West: 8 } as const;

/** Aspecto de una facción en una era. */
interface Look {
  readonly gothic: boolean;
  readonly era: number;
  /** Fábrica de los edificios principales. */
  readonly wall: Surface;
  /** Zócalo de piedra sin labrar. */
  readonly socle: Surface;
  /** Pisos altos y casas: entramado (gótico) o encalado (mudéjar). */
  readonly upper: Surface;
  /** Tejado principal y su pendiente (altura por unidad de medio ancho). */
  readonly roof: Surface;
  readonly pitch: number;
  /** Tejadillos secundarios (cobertizos, anexos). */
  readonly minorRoof: Surface;
  readonly arch: P.ArchShape;
  /** Almenas escalonadas (mudéjar). */
  readonly stepped: boolean;
  /** Franja de azulejo (mudéjar desde la era de las Coronas). */
  readonly trim?: MatToken;
  /** Alfiz alrededor de los arcos (mudéjar). */
  readonly alfiz?: MatToken;
  /** Fábrica de las piezas menores (torrecillas, pilares): piedra o ladrillo. */
  readonly masonry: Surface;
  /** Marco de puertas y ventanas, de las grandes y de los campanarios. */
  readonly frame: MatToken;
  readonly frameBig: MatToken;
  readonly bellFrame: MatToken;
  /** Chapiteles y cubiertas de las torres altas (pizarra en el gótico). */
  readonly slate: Surface;
  /** Remate de teja de los campanarios y la nave de la Catedral, donde no hay chapitel de pizarra. */
  readonly spireTile: Surface;
  /** Material de los escombros cuando cae. */
  readonly rubble: MatToken;
}

const THATCH: Surface = { mat: 'thatch', paint: P.thatch() };
const SLATE: Surface = { mat: 'slate', paint: P.shingles('slate', 2, 3) };
const TILES: Surface = { mat: 'tiles', paint: P.barrelTiles() };
const SHINGLE: Surface = { mat: 'shingle', paint: P.shingles('shingle', 3, 3) };
const PLANKS: Surface = { mat: 'plank', paint: P.planks() };
const LOGS: Surface = { mat: 'log', paint: P.logsH() };
const ASHLAR: Surface = { mat: 'ashlar', paint: P.ashlar('ashlar') };
const STONE: Surface = { mat: 'stone', paint: P.ashlar('stone') };
const RUBBLE: Surface = { mat: 'stone', paint: P.rubbleStone('stone') };
const BRICK: Surface = { mat: 'brick', paint: P.brick() };
const WHITEWASH: Surface = { mat: 'whitewash', paint: P.whitewash() };
const ADOBE: Surface = { mat: 'adobe', paint: P.rubbleStone('adobe', 41) };
const TIMBER: Surface = { mat: 'plaster', paint: P.timberFrame() };
const SANDSTONE: Surface = { mat: 'sandstone', paint: P.ashlar('sandstone') };
const LIMESTONE: Surface = { mat: 'limestone', paint: P.ashlar('limestone', 4, 8, 27) };
const LIOZ: Surface = { mat: 'lioz', paint: P.ashlar('lioz', 4, 9, 43) };
const SLATE_BLUE: Surface = { mat: 'slateBlue', paint: P.shingles('slateBlue', 2, 3) };
const SLATE_DARK: Surface = { mat: 'slateDark', paint: P.shingles('slateDark', 2, 3, 47) };
const TILES_GREEN: Surface = { mat: 'tilesGreen', paint: P.barrelTiles('tilesGreen') };
/** Tapial: muro de tierra apisonada por cajones, con las juntas de las agujas en hileras largas. */
const TAPIAL: Surface = { mat: 'tapial', paint: P.ashlar('tapial', 5, 14, 29) };
/** Enlucido escocés (harling): un revoco gris y rugoso sobre la piedra. */
const HARLING: Surface = { mat: 'harling', paint: P.whitewash('harling', 31) };
const GRANITE: Surface = { mat: 'granite', paint: P.ashlar('granite', 4, 6, 41) };
const GRANITE_RUBBLE: Surface = { mat: 'granite', paint: P.rubbleStone('granite', 37) };

export function lookFor(arch: Architecture, era: number): Look {
  if (arch === 'gothic') {
    return {
      gothic: true,
      era,
      wall: ASHLAR,
      socle: RUBBLE,
      upper: TIMBER,
      roof: era <= 1 ? THATCH : SLATE,
      pitch: 1.05,
      minorRoof: era <= 1 ? THATCH : SHINGLE,
      arch: era === 0 ? 'round' : 'pointed',
      stepped: false,
      masonry: STONE,
      frame: 'stone',
      frameBig: 'stone+',
      bellFrame: 'ashlar+',
      slate: SLATE,
      spireTile: TILES,
      rubble: 'stone',
    };
  }
  if (arch === 'french') {
    // Gótico flamígero: caliza clara bien labrada, pizarra azul desde la era de los Burgos, tejados muy
    // empinados y chapiteles; arcos apuntados.
    return {
      gothic: true,
      era,
      wall: LIMESTONE,
      socle: RUBBLE,
      upper: TIMBER,
      roof: era === 0 ? THATCH : SLATE_BLUE,
      pitch: 1.2,
      minorRoof: era === 0 ? THATCH : SLATE_BLUE,
      arch: era === 0 ? 'round' : 'pointed',
      stepped: false,
      masonry: LIMESTONE,
      frame: 'limestone',
      frameBig: 'limestone+',
      bellFrame: 'limestone+',
      slate: SLATE_BLUE,
      spireTile: SLATE_BLUE,
      rubble: 'limestone',
    };
  }
  if (arch === 'scottish') {
    // Casas-torre: piedra enlucida gris (harling), granito en esquinas y remates, pizarra oscura, hastiales
    // escalonados y arcos de medio punto.
    return {
      gothic: true,
      era,
      wall: HARLING,
      socle: GRANITE_RUBBLE,
      upper: HARLING,
      roof: era === 0 ? THATCH : SLATE_DARK,
      pitch: 1.1,
      minorRoof: era <= 1 ? THATCH : SLATE_DARK,
      arch: 'round',
      stepped: true,
      masonry: GRANITE,
      frame: 'granite',
      frameBig: 'granite+',
      bellFrame: 'granite+',
      slate: SLATE_DARK,
      spireTile: SLATE_DARK,
      rubble: 'granite',
    };
  }
  if (arch === 'nasrid') {
    // Nazarí: tapial rojizo, yeserías blancas alrededor de los arcos de herradura, zócalos de alicatado y tejas
    // verdes vidriadas en los edificios principales.
    return {
      gothic: false,
      era,
      wall: TAPIAL,
      socle: RUBBLE,
      upper: WHITEWASH,
      roof: era === 0 ? THATCH : TILES_GREEN,
      pitch: era === 0 ? 0.75 : 0.5,
      minorRoof: era === 0 ? THATCH : TILES,
      arch: era === 0 ? 'round' : 'horseshoe',
      stepped: false,
      trim: era >= 1 ? 'azulejo' : undefined,
      alfiz: era >= 1 ? 'whitewash' : undefined,
      masonry: TAPIAL,
      frame: 'whitewash-',
      frameBig: 'whitewash',
      bellFrame: 'whitewash',
      slate: TILES_GREEN,
      spireTile: TILES_GREEN,
      rubble: 'tapial',
    };
  }
  if (arch === 'portuguese') {
    // Gótico portugués: caliza blanca (lioz), encalados, teja roja poco inclinada y, desde la era de las
    // Coronas, franjas de azulejo azul y blanco.
    return {
      gothic: false,
      era,
      wall: LIOZ,
      socle: RUBBLE,
      upper: WHITEWASH,
      roof: era === 0 ? THATCH : TILES,
      pitch: era === 0 ? 0.75 : 0.55,
      minorRoof: era === 0 ? THATCH : TILES,
      arch: era === 0 ? 'round' : 'pointed',
      stepped: false,
      trim: era >= 2 ? 'azulejoBlue' : undefined,
      masonry: LIOZ,
      frame: 'lioz',
      frameBig: 'lioz+',
      bellFrame: 'lioz+',
      slate: TILES,
      spireTile: TILES,
      rubble: 'lioz',
    };
  }
  if (arch === 'catalan') {
    // Gótico mediterráneo: arenisca dorada, encalados y tejados de teja poco inclinados; arcos apuntados y
    // almenas rectas, sin chapiteles.
    return {
      gothic: false,
      era,
      wall: SANDSTONE,
      socle: RUBBLE,
      upper: WHITEWASH,
      roof: era === 0 ? THATCH : TILES,
      pitch: era === 0 ? 0.75 : 0.5,
      minorRoof: era === 0 ? THATCH : TILES,
      arch: era === 0 ? 'round' : 'pointed',
      stepped: false,
      masonry: SANDSTONE,
      frame: 'sandstone+',
      frameBig: 'sandstone+',
      bellFrame: 'sandstone+',
      slate: SLATE,
      spireTile: TILES,
      rubble: 'brick',
    };
  }
  return {
    gothic: false,
    era,
    wall: BRICK,
    socle: RUBBLE,
    upper: WHITEWASH,
    roof: era === 0 ? THATCH : TILES,
    pitch: era === 0 ? 0.75 : 0.55,
    minorRoof: era === 0 ? THATCH : TILES,
    arch: era === 0 ? 'round' : 'horseshoe',
    stepped: true,
    trim: era >= 2 ? 'azulejo' : undefined,
    alfiz: era >= 1 ? 'mortar' : undefined,
    masonry: BRICK,
    frame: 'brick-',
    frameBig: 'brick-',
    bellFrame: 'brick-',
    slate: SLATE,
    spireTile: TILES,
    rubble: 'brick',
  };
}

// ── Utilidades ─────────────────────────────────────────────────────────

const matOf = (s: Surface): MatToken => (typeof s === 'string' ? s : s.mat);
const paintOf = (s: Surface): Paint | undefined => (typeof s === 'string' ? undefined : s.paint);

/** La misma superficie con huecos y (opcional) una franja de adorno. */
function holes(s: Surface, openings: readonly P.Opening[], band?: { v0: number; v1: number; mat: MatToken; checker?: MatToken }): Surface {
  let paint: Paint = P.withOpenings(paintOf(s), openings);
  if (band) paint = P.withBand(paint, band.v0, band.v1, band.mat, band.checker);
  return { mat: matOf(s), paint };
}

function door(L: Look, f: number, w: number, h: number): P.Opening {
  return { f, w, h, shape: L.arch, fill: P.DOOR, frame: L.frame, alfiz: L.alfiz };
}

function window(L: Look, f: number, v0: number, w = 2, h = 4, fill: MatToken = 'void'): P.Opening {
  return { f, v0, w, h, shape: w >= 3 ? L.arch : 'flat', fill, frame: w >= 3 ? (L.frameBig) : undefined };
}

/** Ventanas repartidas a lo largo de una cara de ancho `faceW`. */
function windows(L: Look, faceW: number, every: number, v0: number, w = 2, h = 4, skip: (i: number) => boolean = () => false): P.Opening[] {
  const count = Math.max(1, Math.floor((faceW - 6) / every));
  const out: P.Opening[] = [];
  for (let i = 0; i < count; i++) {
    if (skip(i)) continue;
    out.push(window(L, (3 + every / 2 + i * every + (faceW - 6 - count * every) / 2) / faceW, v0, w, h));
  }
  return out;
}

/** Tierra pisada alrededor del edificio, con el borde irregular. */
const DIRT: Surface = {
  mat: 'dirt',
  paint: ({ u, v, w, h }) => {
    const edge = Math.min(u, v, w - u, h - v);
    if (edge < 2.5 && noise(u / 1.5, v / 1.5, 31) < (2.5 - edge) / 2.5) return NONE;
    const r = noise(u / 2, v / 2, 37);
    return r < 0.14 ? 'dirt-' : r > 0.92 ? 'dirt+' : undefined;
  },
};
const PAVING: Surface = {
  mat: 'paving',
  paint: (at) => {
    const edge = Math.min(at.u, at.v, at.w - at.u, at.h - at.v);
    if (edge < 1.5 && noise(at.u / 1.5, at.v / 1.5, 33) < 0.5) return NONE;
    return P.ashlar('paving', 4, 5, 43)(at);
  },
};

function yard(b: Builder, S: number, s: Surface = DIRT): void {
  b.groundRect(1, 1, S - 1, S - 1, s);
}

/** Tejado a dos aguas con la pendiente de la facción. */
function roof(b: Builder, L: Look, x0: number, y0: number, x1: number, y1: number, z: number, axis: 'x' | 'y', ends: Surface, s: Surface = L.roof, pitch = L.pitch, oh = 1.5): void {
  const half = axis === 'x' ? (y1 - y0) / 2 : (x1 - x0) / 2;
  b.gable(x0, y0, x1, y1, z, Math.max(3, Math.round(half * pitch)), axis, s, ends, oh);
}

/** Nave: muros (con sus huecos a cada lado) y tejado. */
function hall(
  b: Builder,
  L: Look,
  r: readonly [number, number, number, number],
  wallH: number,
  axis: 'x' | 'y',
  walls: { left: Surface; right: Surface },
  s: Surface = L.roof,
  pitch = L.pitch,
): void {
  const [x0, y0, x1, y1] = r;
  b.box(x0, y0, 0, x1, y1, wallH, walls);
  roof(b, L, x0, y0, x1, y1, wallH, axis, axis === 'x' ? walls.right : walls.left, s, pitch);
}

/** Torre cuadrada con almenas (o con chapitel si `spire` > 0). */
function squareTower(b: Builder, L: Look, x0: number, y0: number, x1: number, y1: number, h: number, wall: Surface, opts: { spire?: number; spireMat?: Surface; slits?: boolean; bells?: boolean } = {}): void {
  const w = x1 - x0;
  const d = y1 - y0;
  const openings = (faceW: number): P.Opening[] => {
    const out: P.Opening[] = [];
    if (opts.slits) out.push({ f: 0.5, v0: h * 0.45, w: 1, h: 4, fill: 'void' }, { f: 0.5, v0: h * 0.75, w: 1, h: 3, fill: 'void' });
    if (opts.bells) out.push({ f: 0.5, v0: h - 10, w: Math.min(4, faceW / 3), h: 6, shape: L.arch, fill: 'void', frame: L.bellFrame, alfiz: L.alfiz });
    return out;
  };
  const band = L.trim ? { v0: h - 4, v1: h - 2, mat: L.trim, checker: 'whitewash' } : undefined;
  b.box(x0, y0, 0, x1, y1, h, { left: holes(wall, openings(w), band), right: holes(wall, openings(d), band) });
  if (opts.spire) {
    b.pyramid(x0, y0, x1, y1, h, opts.spire, opts.spireMat ?? L.roof, 1);
  } else {
    b.merlonRing(x0, y0, x1, y1, h, wall, 2, 4, 1.5, 3, L.stepped);
  }
}

/** Torre redonda (prisma de 12 lados) con cono o almenas. */
function roundTower(b: Builder, L: Look, cx: number, cy: number, r: number, h: number, wall: Surface, cone: number, coneMat: Surface = L.roof): void {
  b.prism(cx, cy, r, 12, 0, h, holes(wall, [{ f: 0.5, v0: h * 0.55, w: 1, h: 3, fill: 'void' }]));
  if (cone > 0) b.cone(cx, cy, r, 12, h, cone, coneMat, 1.2);
  else {
    // Corona de almenas alrededor.
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + Math.PI / 8;
      const mx = cx + Math.cos(a) * (r - 1);
      const my = cy + Math.sin(a) * (r - 1);
      b.box(mx - 1, my - 1, h, mx + 1, my + 1, h + 3, wall);
    }
  }
}

/** Chimenea de piedra o ladrillo que asoma por el tejado. */
function chimney(b: Builder, L: Look, x: number, y: number, z0: number, z1: number): void {
  b.box(x, y, z0, x + 3, y + 3, z1, L.masonry, 'void');
  if (b.limit === Infinity) b.emitters.push({ kind: 'smoke', p: [x + 1.5, y + 1.5, z1 + 1] });
}

/** Barril o tonel (prisma de 8 lados). */
function barrel(b: Builder, x: number, y: number, h = 4): void {
  b.prism(x, y, 1.6, 8, 0, h, { mat: 'plank', paint: ({ v }) => (Math.abs(v - 1) < 0.6 || Math.abs(v - h + 1) < 0.6 ? 'iron' : undefined) }, 'plank-');
}

/** Caja de mercancía. */
function crate(b: Builder, x: number, y: number, s = 3, z = 0): void {
  b.box(x, y, z, x + s, y + s, z + s, { mat: 'plank', paint: ({ u, v, w, h }) => (u < 0.7 || v < 0.7 || u > w - 0.7 || v > h - 0.7 ? 'plank-' : undefined) });
}

/** Pila de troncos tumbados a lo largo de x. */
function logPile(b: Builder, x: number, y: number, len: number, rows = 2): void {
  for (let r = 0; r < rows; r++) {
    const count = 3 - r;
    for (let i = 0; i < count; i++) {
      const yy = y + i * 2.6 + r * 1.3;
      const z = 1.2 + r * 2.2;
      b.beam([x + r, yy, z], [x + len - r, yy, z], 2.4, 'log', { ends: 'logEnd' });
    }
  }
}

/** Montón de piedras o de mineral. */
function orePile(b: Builder, x: number, y: number, mat: string, seed: number, count = 6): void {
  for (let i = 0; i < count; i++) {
    const dx = noise(i, 1, seed) * 6;
    const dy = noise(i, 2, seed) * 5;
    const s = 1.6 + noise(i, 3, seed) * 1.6;
    const z = i >= count - 2 ? 1.5 : 0;
    b.box(x + dx, y + dy, z, x + dx + s, y + dy + s, z + s * 0.8, mat);
  }
}

/** Valla de postes y travesaños entre dos puntos. */
function fence(b: Builder, ax: number, ay: number, bx: number, by: number, h = 4): void {
  const len = Math.hypot(bx - ax, by - ay);
  const n = Math.max(1, Math.round(len / 5));
  for (let i = 0; i <= n; i++) {
    const x = ax + ((bx - ax) * i) / n;
    const y = ay + ((by - ay) * i) / n;
    b.box(x - 0.5, y - 0.5, 0, x + 0.5, y + 0.5, h, 'log', undefined, { decor: true });
  }
  b.beam([ax, ay, h - 1], [bx, by, h - 1], 0.8, 'plank', { noShadow: true });
  b.beam([ax, ay, h - 2.8], [bx, by, h - 2.8], 0.8, 'plank', { noShadow: true });
}

/** Andamio de troncos y tablones delante de los dos muros que se ven. */
export function scaffold(b: Builder, x0: number, y0: number, x1: number, y1: number, h: number): void {
  const o = { always: true, decor: true } as const;
  const top = Math.max(4, h + 2);
  const along = (n: number) => Math.max(2, Math.round(n / 10) + 1);
  const nx = along(x1 - x0);
  for (let i = 0; i < nx; i++) {
    const x = x0 + ((x1 - x0) * i) / (nx - 1);
    b.box(x - 0.5, y1 + 0.8, 0, x + 0.5, y1 + 1.8, top, 'log', undefined, o);
  }
  const ny = along(y1 - y0);
  for (let i = 0; i < ny; i++) {
    const y = y1 - ((y1 - y0) * i) / (ny - 1);
    b.box(x1 + 0.8, y - 0.5, 0, x1 + 1.8, y + 0.5, top, 'log', undefined, o);
  }
  for (let z = 6; z < top - 1; z += 7) {
    b.box(x0, y1 + 0.6, z, x1 + 2, y1 + 2.2, z + 0.8, 'plank', undefined, o);
    b.box(x1 + 0.6, y0, z, x1 + 2.2, y1, z + 0.8, 'plank', undefined, o);
  }
  // Diagonales de arriostrar.
  b.beam([x0, y1 + 1.3, 1], [Math.min(x1, x0 + 10), y1 + 1.3, Math.min(top, 10)], 0.7, 'log', o);
}

// ── Edificios económicos ──────────────────────────────────────────────

function townCenter(b: Builder, L: Look): void {
  const e = L.era;
  const g = L.gothic;
  yard(b, 64, e >= 1 ? PAVING : DIRT);
  const r: [number, number, number, number] = [8, 10, 48, 34];
  const wallH = e === 0 ? 15 : 18;
  b.main(r[0], r[1], r[2], r[3], wallH);
  const lw = r[2] - r[0];
  const rw = r[3] - r[1];
  const mainDoor = door(L, 0.5, 7, e === 0 ? 10 : 12);
  if (e === 0) {
    const wall = g ? LOGS : ADOBE;
    hall(b, L, r, wallH, 'x', { left: holes(wall, [mainDoor, window(L, 0.18, 7), window(L, 0.82, 7)]), right: holes(wall, [window(L, 0.5, 7)]) }, L.roof, g ? 1.0 : 0.75);
    // Anexo a la derecha.
    b.box(48, 13, 0, 58, 31, 9, { left: g ? PLANKS : ADOBE, right: holes(g ? PLANKS : ADOBE, [door(L, 0.5, 4, 6)]) });
    roof(b, L, 48, 13, 58, 31, 9, 'y', g ? PLANKS : ADOBE, L.minorRoof, 0.9);
  } else if (e === 1 || !g) {
    // Gótico: zócalo de piedra y entramado. Mudéjar: ladrillo (desde las Coronas) o encalado con zócalo.
    if (g) {
      b.box(r[0], r[1], 0, r[2], r[3], 8, { left: holes(L.socle, [mainDoor]), right: L.socle });
      const up = { left: holes(L.upper, windows(L, lw, 7, 2, 2, 4)), right: holes(L.upper, windows(L, rw, 7, 2, 2, 4)) };
      b.box(r[0] - 0.8, r[1] - 0.8, 8, r[2] + 0.8, r[3] + 0.8, wallH, up);
      roof(b, L, r[0] - 0.8, r[1] - 0.8, r[2] + 0.8, r[3] + 0.8, wallH, 'x', up.right);
    } else {
      const wall = e >= 2 ? L.wall : WHITEWASH;
      const band = L.trim ? { v0: wallH - 3, v1: wallH - 1.5, mat: L.trim, checker: 'whitewash' } : undefined;
      hall(b, L, r, wallH, 'x', {
        left: holes(wall, [mainDoor, ...windows(L, lw, 9, 9, 2, 4, (i) => i === 2)], band),
        right: holes(wall, windows(L, rw, 8, 9, 2, 4), band),
      });
      if (e >= 1) {
        // Soportal de arcos delante de la fachada.
        const arcade = { mat: matOf(wall), paint: P.withOpenings(paintOf(wall), [0.14, 0.32, 0.68, 0.86].map((f) => ({ f, w: 4, h: 7, shape: L.arch, fill: 'void', alfiz: L.alfiz }) as P.Opening)) };
        b.box(r[0] + 2, r[3], 0, r[2] - 2, r[3] + 5, 10, { left: arcade, right: holes(wall, [{ f: 0.5, w: 3, h: 7, shape: L.arch, fill: 'void' }]) }, { mat: 'tiles', paint: P.barrelTiles() });
      }
    }
    if (g) {
      // Anexo de madera.
      b.box(48, 13, 0, 58, 31, 10, { left: TIMBER, right: holes(TIMBER, [door(L, 0.5, 4, 7)]) });
      roof(b, L, 48, 13, 58, 31, 10, 'y', TIMBER, L.minorRoof, 1);
    }
  } else {
    // Gótico de las Coronas en adelante: sillería con pizarra.
    hall(b, L, r, wallH, 'x', {
      left: holes(L.wall, [mainDoor, ...windows(L, lw, 9, 8, 3, 6, (i) => i === 2)]),
      right: holes(L.wall, windows(L, rw, 8, 8, 3, 6)),
    });
  }
  if (e >= 2) {
    // Torre a la derecha.
    const th = e >= 3 ? 40 : 34;
    if (g && e >= 3) squareTower(b, L, 46, 4, 60, 18, th, L.wall, { spire: 20, slits: true });
    else if (!g && e >= 3) squareTower(b, L, 46, 4, 60, 18, th, L.wall, { spire: 9, spireMat: L.spireTile, bells: true });
    else squareTower(b, L, 46, 4, 60, 18, th, L.wall, { slits: true });
    b.flag(53, 11, b.top, 8, 6, 4);
    if (e >= 3) {
      // Ala nueva a la izquierda, de cara a la plaza.
      const wing: [number, number, number, number] = [6, 36, 20, 58];
      const wl = g ? { left: holes(TIMBER, [window(L, 0.5, 8)]), right: holes(TIMBER, windows(L, 22, 7, 8)) } : { left: holes(L.wall, [window(L, 0.5, 8, 3, 5)]), right: holes(L.wall, windows(L, 22, 8, 8, 3, 5)) };
      if (g) b.box(wing[0], wing[1], 0, wing[2], wing[3], 7, L.socle);
      b.box(wing[0] - (g ? 0.6 : 0), wing[1] - (g ? 0.6 : 0), g ? 7 : 0, wing[2] + (g ? 0.6 : 0), wing[3] + (g ? 0.6 : 0), 15, wl);
      roof(b, L, wing[0], wing[1], wing[2], wing[3], 15, 'y', wl.left);
    }
  } else {
    b.flag(28, 22, b.top - 1, 9, 5, 4);
  }
  // Pozo en la plaza.
  b.prism(30, 49, 3, 8, 0, 3, g ? RUBBLE : BRICK, 'water');
  if (e >= 1) {
    b.box(27.5, 48.5, 3, 28.5, 49.5, 9, 'timber', undefined, { decor: true });
    b.box(31.5, 48.5, 3, 32.5, 49.5, 9, 'timber', undefined, { decor: true });
    b.gable(27, 47, 33, 51, 9, 3, 'x', L.minorRoof, 'timber', 0.8);
  }
  if (e >= 2) b.banner(16, r[3] + (g ? 0 : 5), 4, 4, 7);
}

function house(b: Builder, L: Look): void {
  const e = L.era;
  const g = L.gothic;
  yard(b, 32);
  if (g) {
    const r: [number, number, number, number] = [6, 9, 26, 24];
    if (e === 0) {
      b.main(r[0], r[1], r[2], r[3], 10);
      hall(b, L, r, 10, 'x', { left: holes(LOGS, [door(L, 0.35, 4, 7)]), right: LOGS }, L.roof, 1.5);
      logPile(b, 24, 25, 6, 1);
    } else {
      b.main(r[0], r[1], r[2], r[3], 13);
      b.box(r[0], r[1], 0, r[2], r[3], 6, { left: holes(L.socle, [door(L, 0.32, 4, 6)]), right: L.socle });
      const up = { left: holes(TIMBER, [window(L, 0.7, 2.5)]), right: holes(TIMBER, [window(L, 0.5, 2.5)]) };
      b.box(r[0] - 0.8, r[1] - 0.8, 6, r[2] + 0.8, r[3] + 0.8, 13, up);
      if (e >= 2) chimney(b, L, r[0] + 3, r[1] + 3, 13, 26);
      roof(b, L, r[0] - 0.8, r[1] - 0.8, r[2] + 0.8, r[3] + 0.8, 13, 'x', up.right, L.roof, e >= 2 ? 1.25 : 1.4);
      if (e >= 3) {
        // Cobertizo con leña al lado.
        b.box(r[2] + 1, 12, 0, 30, 22, 6, PLANKS);
        b.quad(
          [
            [r[2] + 0.5, 11, 8],
            [r[2] + 0.5, 23, 8],
            [30.5, 23, 5.5],
            [30.5, 11, 5.5],
          ],
          SHINGLE,
        );
      }
    }
  } else {
    const r: [number, number, number, number] = [6, 8, 26, 25];
    const wall = e === 0 ? ADOBE : WHITEWASH;
    const h = e >= 3 ? 16 : e === 0 ? 9 : 11;
    b.main(r[0], r[1], r[2], r[3], h);
    const band = e >= 2 ? { v0: 0, v1: 2, mat: 'brick' } : undefined;
    const left = holes(wall, [door(L, 0.3, 4, 7), window(L, 0.75, e >= 3 ? 9 : 5)], band);
    const right = holes(wall, [window(L, 0.5, e >= 3 ? 9 : 5), ...(e >= 3 ? [window(L, 0.5, 3)] : [])], band);
    hall(b, L, r, h, 'x', { left, right }, L.roof, L.pitch);
    if (e >= 3) {
      // Balcón de madera con barandilla.
      b.box(r[0] + 9, r[3], 8, r[0] + 16, r[3] + 2, 8.8, 'plank');
      b.box(r[0] + 9, r[3] + 1.4, 8.8, r[0] + 16, r[3] + 2, 11, { mat: 'plank', paint: ({ u }) => (u % 1.5 < 0.7 ? 'plank-' : NONE) });
    }
    if (e >= 2) {
      // Tapia del corral delante.
      b.box(4, 26, 0, 20, 28, 4, holes(WHITEWASH, []), 'tiles');
    }
  }
}

function mill(b: Builder, L: Look): void {
  yard(b, 32);
  const hub: [number, number, number] = [16, 25.5, 22];
  if (L.gothic) {
    // Molino de poste: caja de madera sobre un caballete.
    b.main(9, 9, 23, 23, 22);
    b.box(14.5, 14.5, 0, 17.5, 17.5, 8, 'log');
    b.beam([10, 16, 0], [16, 16, 7], 1, 'log');
    b.beam([22, 16, 0], [16, 16, 7], 1, 'log');
    b.beam([16, 10, 0], [16, 16, 7], 1, 'log');
    b.beam([16, 22, 0], [16, 16, 7], 1, 'log');
    b.box(10, 10, 8, 22, 23, 22, { left: holes(PLANKS, [{ f: 0.25, v0: 1, w: 3, h: 5, fill: P.DOOR, frame: 'timber' }]), right: PLANKS });
    b.gable(10, 10, 22, 23, 22, 7, 'y', L.minorRoof === THATCH ? SHINGLE : L.minorRoof, PLANKS, 1);
    // Escalera.
    b.beam([24, 18, 0], [22.5, 14, 9], 1.2, 'plank');
    hub[1] = 24.5;
    hub[2] = 19;
  } else {
    // Molino de viento manchego: torre redonda encalada con caperuza.
    b.main(9, 9, 23, 23, 20);
    b.prism(16, 16, 7, 12, 0, 20, holes(WHITEWASH, [{ f: 0.5, w: 3, h: 6, shape: 'round', fill: P.DOOR, frame: 'whitewash-' }, { f: 0.5, v0: 13, w: 1.5, h: 2.5, fill: 'void' }]));
    b.cone(16, 16, 7, 12, 20, 9, { mat: 'plank', paint: P.shingles('plank', 2, 3) }, 1);
    hub[1] = 24;
  }
  if (b.animated) {
    if (b.limit === Infinity) b.emitters.push({ kind: 'sails', p: hub });
  } else {
    millSails(b, hub, 0);
  }
  // Sacos de harina.
  for (const [x, y] of [
    [4, 22],
    [6, 25],
  ]) b.prism(x, y, 1.7, 6, 0, 3, 'cloth', 'cloth+');
}

/** Aspas del molino: cuatro brazos con su lienzo en el plano de la izquierda, giradas `turn` radianes. */
export function millSails(b: Builder, hub: readonly [number, number, number], turn: number): void {
  const [hx, hy, hz] = hub;
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2 + turn;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    b.beam([hx, hy, hz], [hx + dx * 16, hy, hz + dz * 16], 1, 'timber', { noShadow: true });
    // Lienzo a un lado del brazo.
    const px = -dz;
    const pz = dx;
    const p0: [number, number, number] = [hx + dx * 3.5, hy + 0.4, hz + dz * 3.5];
    const p1: [number, number, number] = [hx + dx * 15.5, hy + 0.4, hz + dz * 15.5];
    b.quad(
      [p0, p1, [p1[0] + px * 4.5, p1[1], p1[2] + pz * 4.5], [p0[0] + px * 4.5, p0[1], p0[2] + pz * 4.5]],
      { mat: 'cloth', paint: ({ u, v }) => (u % 3 < 0.7 || v < 0.6 ? 'plank' : undefined) },
      { noShadow: true },
    );
  }
  b.box(hx - 1, hy - 1, hz - 1, hx + 1, hy + 1.2, hz + 1, 'timber');
}

function lumberCamp(b: Builder, L: Look): void {
  yard(b, 32);
  b.main(6, 6, 24, 18, 10);
  // Cobertizo abierto: pared de tablas al fondo, postes delante.
  b.box(6, 6, 0, 24, 8, 10, PLANKS);
  b.box(6, 6, 0, 8, 18, 10, PLANKS);
  for (const x of [15, 23]) b.box(x, 16.5, 0, x + 1, 17.5, 10, 'log');
  b.gable(6, 6, 24, 18, 10, 6, 'x', L.minorRoof === THATCH ? SHINGLE : L.minorRoof, PLANKS, 1.2);
  logPile(b, 4, 20, 14, 2);
  // Tajo con un hacha clavada.
  b.prism(24, 25, 2, 8, 0, 3, 'log', 'logEnd');
  b.beam([24, 25, 3], [25.5, 26, 6], 0.6, 'plank');
  b.box(25, 25.6, 5.5, 26.6, 26.4, 7, 'iron');
  // Sierra apoyada.
  b.beam([19, 18.5, 0], [21, 18.5, 6], 0.8, 'log');
}

function miningCamp(b: Builder, L: Look): void {
  yard(b, 32);
  b.main(6, 6, 22, 18, 10);
  b.box(6, 6, 0, 22, 8, 10, L.gothic ? PLANKS : ADOBE);
  b.box(6, 6, 0, 8, 18, 10, L.gothic ? PLANKS : ADOBE);
  for (const x of [13, 21]) b.box(x, 16.5, 0, x + 1, 17.5, 10, 'log');
  b.gable(6, 6, 22, 18, 10, 6, 'x', L.minorRoof === THATCH ? SHINGLE : L.minorRoof, PLANKS, 1.2);
  orePile(b, 8, 20, 'rock', 3, 7);
  orePile(b, 18, 22, 'goldOre', 5, 5);
  // Vagoneta.
  b.box(22, 10, 1.5, 28, 14, 5, { mat: 'plank', paint: ({ v }) => (v > 2.8 ? 'iron' : undefined) }, 'rock');
  for (const x of [23, 27]) b.box(x - 0.8, 13.6, 0, x + 0.8, 14.4, 2, 'iron');
  // Pico apoyado.
  b.beam([12, 18.4, 0], [13, 18.4, 6], 0.6, 'plank');
  b.beam([11, 18.4, 6], [15, 18.4, 5.5], 0.6, 'iron');
}

/** Granja: surcos y, según lo que quede, trigo alto, a medias o rastrojo. */
function farm(b: Builder, stage: BuildStage): void {
  const S = 48;
  const furrows: Surface = {
    mat: 'soil',
    paint: ({ u, v, w, h }) => {
      const edge = Math.min(u, v, w - u, h - v);
      if (edge < 1.5) return noise(u, v, 51) < 0.4 ? 'dirt' : 'dirt-';
      return Math.floor(v / 2) % 2 === 0 ? 'soil+' : noise(u / 2, v, 53) < 0.2 ? 'soil-' : undefined;
    },
  };
  b.groundRect(1, 1, S - 1, S - 1, furrows);
  b.main(2, 2, S - 2, S - 2, 0);
  if (stage === BuildStage.Foundation || stage === BuildStage.Frame || stage === BuildStage.Walls) return;
  const rows = Math.floor((S - 6) / 4);
  for (let i = 0; i < rows; i++) {
    const y = 4 + i * 4;
    let mat = 'wheat';
    let h = 3;
    if (stage === BuildStage.FarmHalf && i >= rows / 2) {
      mat = 'stubble';
      h = 1;
    } else if (stage === BuildStage.FarmLow) {
      mat = i < 2 ? 'wheat' : 'stubble';
      h = i < 2 ? 3 : 1;
    }
    const ears: Surface = { mat, paint: mat === 'wheat' ? ({ u, v }) => (noise(u, v, 57 + i) < 0.25 ? 'wheat+' : noise(u, v, 59 + i) < 0.12 ? 'crop' : undefined) : undefined };
    b.box(4, y, 0, S - 4, y + 2, h, ears, ears, { noShadow: h < 2 });
  }
  // Postes de las esquinas.
  for (const [x, y] of [
    [2, 2],
    [S - 3, 2],
    [2, S - 3],
    [S - 3, S - 3],
  ]) b.box(x, y, 0, x + 1, y + 1, 4, 'log', undefined, { decor: true });
}

// ── Militares ─────────────────────────────────────────────────────────

function barracks(b: Builder, L: Look): void {
  yard(b, 48);
  const g = L.gothic;
  const r: [number, number, number, number] = [6, 6, 40, 26];
  const h = 16;
  b.main(r[0], r[1], r[2], r[3], h);
  const wall = L.era === 0 ? (g ? LOGS : ADOBE) : L.wall;
  const lw = r[2] - r[0];
  const band = L.trim ? { v0: h - 3, v1: h - 1.5, mat: L.trim, checker: 'whitewash' } : undefined;
  if (g || L.era === 0) {
    hall(b, L, r, h, 'x', { left: holes(wall, [door(L, 0.5, 6, 10), ...windows(L, lw, 9, 8, 2, 4, (i) => i === 1 || i === 2)], band), right: holes(wall, [window(L, 0.5, 8)], band) });
  } else {
    // Mudéjar: cuartel de azotea almenada.
    b.box(r[0], r[1], 0, r[2], r[3], h, { left: holes(wall, [door(L, 0.5, 6, 10), ...windows(L, lw, 9, 8, 2, 4, (i) => i === 1 || i === 2)], band), right: holes(wall, [window(L, 0.5, 8)], band) }, 'paving');
    b.merlonRing(r[0], r[1], r[2], r[3], h, wall, 2, 4, 1.5, 3, true);
    b.main(r[0], r[1], r[2], r[3], h);
  }
  // Patio de armas: estafermo y armero.
  b.box(10, 34, 0, 11, 35, 9, 'log');
  b.box(8, 34, 6, 13, 35, 7, 'log');
  b.prism(10.5, 34.5, 1.6, 6, 3, 7, 'hay', 'hay');
  b.box(24, 30, 0, 34, 31, 6, 'plank');
  for (let x = 25; x < 34; x += 2) b.beam([x, 31.5, 0], [x + 0.6, 31.2, 8], 0.5, 'steel', { noShadow: true });
  b.flag(r[0] + lw / 2, (r[1] + r[3]) / 2, b.top - 1, 8, 5, 4);
  b.banner(r[0] + 7, r[3], 6, 4, 7);
  b.banner(r[2] - 11, r[3], 6, 4, 7);
}

function archeryRange(b: Builder, L: Look): void {
  yard(b, 48);
  // Galería cubierta al fondo, abierta por delante.
  const r: [number, number, number, number] = [5, 5, 26, 42];
  b.main(r[0], r[1], r[2], r[3], 12);
  b.box(r[0], r[1], 0, r[0] + 2, r[3], 12, L.gothic ? TIMBER : WHITEWASH);
  b.box(r[0], r[1], 0, r[2], r[1] + 2, 12, L.gothic ? TIMBER : WHITEWASH);
  for (let y = r[1] + 8; y <= r[3]; y += 8) b.box(r[2] - 1.5, y - 1, 0, r[2] - 0.5, y, 12, 'log');
  b.gable(r[0], r[1], r[2], r[3], 12, Math.round(10.5 * (L.gothic ? 1 : 0.6)), 'y', L.minorRoof, L.gothic ? TIMBER : WHITEWASH, 1.5);
  // Dianas de paja en el campo de tiro.
  for (const [x, y] of [
    [38, 10],
    [38, 22],
    [38, 34],
  ]) {
    b.box(x - 0.5, y - 3, 0, x + 0.5, y - 2, 5, 'log');
    b.quad(
      [
        [x - 0.8, y + 3, 1],
        [x - 0.8, y - 3, 1],
        [x - 0.8, y - 3, 7],
        [x - 0.8, y + 3, 7],
      ],
      {
        mat: 'hay',
        paint: ({ u, v, w, h }) => {
          const d = Math.hypot((u - w / 2) / 1.2, v - h / 2);
          return d < 0.9 ? 'tiles+' : d < 1.8 ? 'cloth' : d < 2.7 ? 'tiles' : undefined;
        },
      },
      { frame: { o: [x - 0.8, y + 3, 1], du: [0, -1, 0], dv: [0, 0, 1], w: 6, h: 6 } },
    );
  }
  // Un arco y un carcaj en un banco.
  b.box(28, 40, 0, 34, 42, 3, 'plank');
  b.flag(16, 24, b.top - 1, 8, 5, 4);
}

function stable(b: Builder, L: Look): void {
  yard(b, 48);
  const r: [number, number, number, number] = [6, 6, 30, 32];
  const h = 13;
  b.main(r[0], r[1], r[2], r[3], h);
  const wall = L.gothic ? PLANKS : ADOBE;
  const big: P.Opening = { f: 0.5, w: 8, h: 10, shape: L.gothic ? 'flat' : L.arch, fill: P.DOOR, frame: 'timber', alfiz: L.alfiz };
  hall(b, L, r, h, 'y', { left: holes(wall, [big]), right: holes(wall, [window(L, 0.25, 7, 3, 3), window(L, 0.75, 7, 3, 3)]) }, L.minorRoof, L.gothic ? 1.05 : 0.6);
  // Cercado con abrevadero y paja.
  fence(b, 32, 6, 44, 6);
  fence(b, 44, 6, 44, 30);
  fence(b, 32, 30, 44, 30);
  b.box(36, 18, 0, 42, 20, 2.5, 'plank', 'water');
  for (const [x, y] of [
    [10, 36],
    [14, 38],
    [11, 41],
  ]) b.box(x, y, 0, x + 4, y + 3, 3, { mat: 'hay', paint: ({ v }) => (Math.abs(v - 1.5) < 0.4 ? 'rope' : undefined) }, 'hay');
  b.flag(18, 19, b.top - 1, 7, 5, 4);
}

function siegeWorkshop(b: Builder, L: Look): void {
  yard(b, 64);
  const r: [number, number, number, number] = [6, 6, 42, 34];
  const h = 16;
  b.main(r[0], r[1], r[2], r[3], h);
  const wall = L.gothic ? TIMBER : PLANKS;
  hall(b, L, r, h, 'x', { left: holes(PLANKS, [{ f: 0.55, w: 12, h: 13, fill: 'void', frame: 'timber' }, window(L, 0.15, 8)]), right: holes(wall, [window(L, 0.5, 8)]) }, L.minorRoof, L.gothic ? 1 : 0.65);
  // Armazón de trabuquete a medio hacer.
  b.box(46, 22, 0, 60, 24, 2, 'log');
  b.box(46, 30, 0, 60, 32, 2, 'log');
  b.beam([47, 23, 2], [53, 27, 18], 1.4, 'log');
  b.beam([59, 23, 2], [53, 27, 18], 1.4, 'log');
  b.beam([47, 31, 2], [53, 27, 18], 1.4, 'log');
  b.beam([53, 27, 18], [44, 27, 26], 1, 'plank');
  // Ruedas y troncos.
  for (const [x, y] of [
    [12, 44],
    [18, 46],
  ]) b.quad(
    [
      [x - 3, y, 0],
      [x + 3, y, 0],
      [x + 3, y, 6],
      [x - 3, y, 6],
    ],
    { mat: 'plank', paint: ({ u, v }) => (Math.hypot(u - 3, v - 3) > 3 ? NONE : Math.hypot(u - 3, v - 3) > 2.2 ? 'plank-' : Math.abs(u - 3) < 0.5 || Math.abs(v - 3) < 0.5 ? 'plank' : NONE) },
    { frame: { o: [x - 3, y, 0], du: [1, 0, 0], dv: [0, 0, 1], w: 6, h: 6 } },
  );
  logPile(b, 30, 44, 16, 2);
  b.flag(24, 20, b.top - 1, 8, 5, 4);
}

function watchTower(b: Builder, L: Look): void {
  yard(b, 16);
  if (L.era === 0) {
    // Atalaya de madera: cuatro postes, plataforma y tejadillo.
    b.main(2, 2, 14, 14, 24);
    for (const [x, y] of [
      [3, 3],
      [12, 3],
      [3, 12],
      [12, 12],
    ]) b.box(x, y, 0, x + 1.4, y + 1.4, 30, 'log');
    b.beam([3.7, 13.4, 2], [12.7, 13.4, 20], 0.8, 'log');
    b.beam([13.4, 3.7, 2], [13.4, 12.7, 20], 0.8, 'log');
    b.box(1.5, 1.5, 22, 14.5, 14.5, 24, PLANKS, 'plank');
    b.box(1.5, 13, 24, 14.5, 14.5, 27, PLANKS);
    b.box(13, 1.5, 24, 14.5, 13, 27, PLANKS);
    b.pyramid(1.5, 1.5, 14.5, 14.5, 30, 7, L.minorRoof, 1);
    return;
  }
  b.main(3, 3, 13, 13, 34);
  squareTower(b, L, 3, 3, 13, 13, 34, L.wall, { slits: true, spire: L.gothic && L.era >= 2 ? 10 : 0, spireMat: L.slate });
  b.flag(8, 8, b.top, 7, 5, 3);
}

// ── Muros ─────────────────────────────────────────────────────────────

/** Tramos del muro hacia los vecinos que también son muro: así una línea de casillas se ve como un muro seguido. */
function wallArms(link: number, half: number): { x0: number; y0: number; x1: number; y1: number }[] {
  const c = 8;
  const out = [{ x0: c - half, y0: c - half, x1: c + half, y1: c + half }];
  if (link & WallLink.North) out.push({ x0: c - half, y0: 0, x1: c + half, y1: c - half });
  if (link & WallLink.South) out.push({ x0: c - half, y0: c + half, x1: c + half, y1: 16 });
  if (link & WallLink.West) out.push({ x0: 0, y0: c - half, x1: c - half, y1: c + half });
  if (link & WallLink.East) out.push({ x0: c + half, y0: c - half, x1: 16, y1: c + half });
  return out;
}

function palisade(b: Builder, link: number): void {
  b.main(4, 4, 12, 12, 12);
  // Troncos aguzados a lo largo de cada tramo.
  const logs: [number, number][] = [[8, 8]];
  const step = 2.8;
  const add = (dx: number, dy: number) => {
    for (let t = step; t <= 8.01; t += step) logs.push([8 + dx * t, 8 + dy * t]);
  };
  if (link & WallLink.North) add(0, -1);
  if (link & WallLink.South) add(0, 1);
  if (link & WallLink.West) add(-1, 0);
  if (link & WallLink.East) add(1, 0);
  if (logs.length === 1) {
    add(1, 0);
    add(-1, 0);
  }
  logs.forEach(([x, y], i) => {
    const h = 11 + (i % 3);
    b.prism(x, y, 1.5, 6, 0, h, LOGS);
    b.cone(x, y, 1.5, 6, h, 3, 'logEnd', 0);
  });
  b.mass(14);
}

function stoneWall(b: Builder, L: Look, link: number): void {
  const wall = L.masonry;
  b.main(4, 4, 12, 12, 14);
  for (const a of wallArms(link, 3.5)) b.box(a.x0, a.y0, 0, a.x1, a.y1, 14, wall, 'paving');
  // Almenas a lo largo de los tramos (y en el pilar del centro, si va suelto).
  if (link & (WallLink.North | WallLink.South) || link === 0) b.merlons(10.5, link & WallLink.North ? 0 : 4.5, 10.5, link & WallLink.South ? 16 : 11.5, 14, wall, 2, 4, 1.5, 3, L.stepped);
  if (link & (WallLink.East | WallLink.West)) b.merlons(link & WallLink.West ? 0 : 4.5, 10.5, link & WallLink.East ? 16 : 11.5, 10.5, 14, wall, 2, 4, 1.5, 3, L.stepped);
}

function gate(b: Builder, L: Look, link: number): void {
  const wall = L.masonry;
  b.main(1, 1, 15, 15, 18);
  const arch: P.Opening = { f: 0.5, w: 7, h: 11, shape: L.arch, fill: 'void', frame: L.frameBig, alfiz: L.alfiz };
  const portcullis: Paint = ({ u, v, w }) => {
    const du = u - w / 2;
    if (!P.insideArch(du, v, 7, 11, L.arch)) return undefined;
    return Math.abs(du % 2) < 0.6 || v % 2.5 < 0.6 ? 'iron' : 'void';
  };
  const face = { mat: matOf(wall), paint: P.withOpenings((at) => portcullis(at) ?? paintOf(wall)?.(at), [{ ...arch, fill: 'iron-' }]) };
  // El hueco se ve en la cara por la que pasa el camino (la del muro que sigue).
  const alongX = (link & (WallLink.East | WallLink.West)) !== 0 && (link & (WallLink.North | WallLink.South)) === 0;
  b.box(1, 1, 0, 15, 15, 18, alongX ? { left: face, right: wall } : { left: wall, right: face }, 'paving');
  b.merlonRing(1, 1, 15, 15, 18, wall, 2, 4, 1.5, 3, L.stepped);
  b.flag(8, 8, 18, 7, 5, 3);
}

// ── Edificios de las eras avanzadas ──────────────────────────────────

function market(b: Builder, L: Look): void {
  yard(b, 64, PAVING);
  // Lonja al fondo.
  const r: [number, number, number, number] = [6, 6, 40, 24];
  const h = 15;
  b.main(r[0], r[1], r[2], r[3], h);
  const wall = L.gothic ? TIMBER : WHITEWASH;
  const lw = r[2] - r[0];
  const arcade = holes(L.gothic ? L.socle : L.wall, [0.18, 0.39, 0.61, 0.82].map((f) => ({ f, w: 5, h: 7, shape: L.arch, fill: 'void', alfiz: L.alfiz }) as P.Opening));
  b.box(r[0], r[1], 0, r[2], r[3], 8, { left: arcade, right: holes(L.gothic ? L.socle : L.wall, [{ f: 0.5, w: 5, h: 7, shape: L.arch, fill: 'void' }]) });
  const up = { left: holes(wall, windows(L, lw, 8, 2, 2, 3)), right: holes(wall, windows(L, 18, 8, 2, 2, 3)) };
  b.box(r[0], r[1], 8, r[2], r[3], h, up);
  roof(b, L, r[0], r[1], r[2], r[3], h, 'x', up.right);
  // Puestos con toldos a rayas del equipo.
  const stall = (x: number, y: number, axis: 'x' | 'y') => {
    const w = axis === 'x' ? 10 : 6;
    const d = axis === 'x' ? 6 : 10;
    b.box(x, y, 0, x + w, y + d, 3, 'plank', { mat: 'plank', paint: ({ u, v }) => (noise(u / 2, v / 2, x + y) < 0.3 ? 'wheat' : noise(u / 2, v / 2, x * y) < 0.2 ? 'tiles+' : undefined) });
    for (const [px, py] of [
      [x, y],
      [x + w - 1, y],
      [x, y + d - 1],
      [x + w - 1, y + d - 1],
    ]) b.box(px, py, 3, px + 1, py + 1, 8, 'log', undefined, { decor: true });
    const stripes: Surface = { mat: 'team', paint: ({ u }) => (Math.floor(u / 2) % 2 === 0 ? 'cloth' : undefined) };
    if (axis === 'x') b.quad([[x - 0.5, y - 0.5, 9], [x + w + 0.5, y - 0.5, 9], [x + w + 0.5, y + d + 1.5, 6.5], [x - 0.5, y + d + 1.5, 6.5]], stripes, { frame: { o: [x - 0.5, y + d + 1.5, 6.5], du: [1, 0, 0], dv: [0, -1, 0.4], w: w + 1, h: d + 2 } });
    else b.quad([[x - 0.5, y - 0.5, 9], [x - 0.5, y + d + 0.5, 9], [x + w + 1.5, y + d + 0.5, 6.5], [x + w + 1.5, y - 0.5, 6.5]], stripes, { frame: { o: [x + w + 1.5, y + d + 0.5, 6.5], du: [0, -1, 0], dv: [-1, 0, 0.4], w: d + 1, h: w + 2 } });
  };
  stall(8, 32, 'x');
  stall(24, 32, 'x');
  stall(46, 8, 'y');
  stall(46, 24, 'y');
  for (const [x, y] of [
    [42, 42],
    [45, 44],
    [44, 40],
  ]) barrel(b, x, y);
  crate(b, 10, 44);
  crate(b, 14, 45);
  crate(b, 12, 44, 2.5, 3);
  b.flag(23, 15, b.top - 1, 8, 5, 4);
}

function blacksmith(b: Builder, L: Look): void {
  yard(b, 48);
  const r: [number, number, number, number] = [6, 6, 34, 28];
  const h = 14;
  b.main(r[0], r[1], r[2], r[3], h);
  const wall = L.gothic ? (L.era >= 2 ? L.wall : RUBBLE) : L.era >= 2 ? L.wall : ADOBE;
  const forge: P.Opening = { f: 0.62, w: 8, h: 9, shape: L.gothic ? 'flat' : L.arch, fill: 'glow!2', frame: 'timber' };
  hall(b, L, r, h, 'x', { left: holes(wall, [forge, door(L, 0.2, 4, 8)]), right: holes(wall, [window(L, 0.5, 7)]) }, L.gothic ? (L.era >= 2 ? L.slate : SHINGLE) : L.roof);
  chimney(b, L, 26, 10, h, b.top + 5);
  // Yunque, barril de temple y montón de carbón.
  b.box(22, 32, 0, 25, 34, 3, 'iron');
  b.box(21, 32.5, 3, 26, 33.5, 4, 'iron');
  barrel(b, 30, 34, 4);
  b.prism(12, 34, 3, 8, 0, 1.5, 'void', 'void+');
  b.flag(14, 17, b.top - 1, 7, 5, 4);
}

function university(b: Builder, L: Look): void {
  yard(b, 48, PAVING);
  const r: [number, number, number, number] = [6, 8, 38, 28];
  const h = 20;
  b.main(r[0], r[1], r[2], r[3], h);
  const lw = r[2] - r[0];
  const band = L.trim ? { v0: h - 3, v1: h - 1.5, mat: L.trim, checker: 'whitewash' } : undefined;
  hall(b, L, r, h, 'x', {
    left: holes(L.wall, [door(L, 0.5, 5, 9), ...windows(L, lw, 7, 11, 3, 7, (i) => false && i === 0)], band),
    right: holes(L.wall, windows(L, 20, 7, 11, 3, 7), band),
  });
  // Torre del reloj o cimborrio.
  if (L.gothic) squareTower(b, L, 30, 2, 40, 12, 30, L.wall, { spire: 14, spireMat: L.era >= 2 ? L.slate : L.roof });
  else {
    b.prism(14, 18, 5, 8, b.top - 2, b.top + 4, L.wall);
    b.cone(14, 18, 5, 8, b.top, 5, { mat: 'azulejo', paint: P.shingles('azulejo', 2, 2) }, 0.5);
  }
  if (L.gothic) b.flag(35, 7, b.top, 6, 4, 3);
  else b.flag(30, 18, b.top - 6, 7, 5, 3);
  b.banner(r[0] + 5, r[3], 7, 4, 8);
}

function monastery(b: Builder, L: Look): void {
  yard(b, 48, DIRT);
  // Iglesia a lo largo de x con su torre a la derecha y un claustro delante.
  const r: [number, number, number, number] = [5, 6, 32, 22];
  const h = 18;
  b.main(r[0], r[1], r[2], r[3], h);
  const wall = L.gothic ? L.wall : L.era >= 2 ? L.wall : WHITEWASH;
  hall(b, L, r, h, 'x', {
    left: holes(wall, windows(L, 27, 7, 9, 2, 6)),
    right: holes(wall, [door(L, 0.5, 5, 10), { f: 0.5, v0: 13, w: 3, h: 3, shape: 'round', fill: 'glass' }]),
  });
  squareTower(b, L, 33, 4, 43, 14, 32, wall, { spire: L.gothic ? 14 : 6, spireMat: L.gothic ? (L.era >= 2 ? L.slate : L.roof) : L.spireTile, bells: true });
  // Claustro: pandas bajas de arcos alrededor de un huerto.
  const cl = holes(wall, [0.17, 0.39, 0.61, 0.83].map((f) => ({ f, w: 3, h: 5, shape: L.arch === 'horseshoe' ? 'horseshoe' : 'round', fill: 'void' }) as P.Opening));
  b.box(5, 26, 0, 32, 30, 7, { left: cl, right: cl }, L.minorRoof);
  b.box(28, 30, 0, 32, 43, 7, { left: cl, right: cl }, L.minorRoof);
  b.groundRect(6, 31, 27, 43, { mat: 'crop', paint: ({ u, v }) => (noise(u, v, 61) < 0.3 ? 'crop-' : noise(u, v, 63) < 0.08 ? 'tiles+' : undefined) }, 0, 0.1);
  b.box(15, 35, 0, 18, 38, 2, 'stone', 'water');
}

function castle(b: Builder, L: Look): void {
  yard(b, 64, DIRT);
  const g = L.gothic;
  const wall = L.wall;
  const wh = 18;
  b.main(4, 4, 60, 60, wh);
  // Lienzos de muralla con el paseo de ronda.
  const t = 5;
  const gateArch: P.Opening = { f: 0.5, w: 8, h: 12, shape: L.arch, fill: 'void', frame: g ? 'ashlar+' : 'brick-', alfiz: L.alfiz };
  const band = L.trim ? { v0: wh - 3, v1: wh - 1.5, mat: L.trim, checker: 'whitewash' } : undefined;
  b.box(6, 6, 0, 58, 6 + t, wh, wall, 'paving'); // fondo
  b.box(6, 6, 0, 6 + t, 58, wh, wall, 'paving');
  b.box(6, 58 - t, 0, 58, 58, wh, { left: holes(wall, [gateArch], band), right: wall }, 'paving');
  b.box(58 - t, 6, 0, 58, 58, wh, { left: wall, right: holes(wall, [{ f: 0.5, v0: 8, w: 1, h: 4, fill: 'void' }], band) }, 'paving');
  b.merlons(6, 57.25, 58, 57.25, wh, wall, 2, 4, 1.5, 3, L.stepped);
  b.merlons(57.25, 58, 57.25, 6, wh, wall, 2, 4, 1.5, 3, L.stepped);
  b.merlons(6, 6.75, 58, 6.75, wh, wall, 2, 4, 1.5, 3, L.stepped);
  b.merlons(6.75, 58, 6.75, 6, wh, wall, 2, 4, 1.5, 3, L.stepped);
  // Patio y torre del homenaje.
  b.groundRect(11, 11, 53, 53, PAVING, 0, 0.1);
  const kh = 40;
  squareTower(b, L, 20, 18, 42, 38, kh, wall, { slits: true });
  b.flag(31, 28, b.top, 10, 7, 5);
  // Torres de las esquinas.
  const corners: [number, number][] = [
    [8, 8],
    [56, 8],
    [8, 56],
    [56, 56],
  ];
  for (const [cx, cy] of corners) {
    if (g) roundTower(b, L, cx, cy, 6.5, 28, wall, L.era >= 2 ? 12 : 0, L.slate);
    else squareTower(b, L, cx - 6, cy - 6, cx + 6, cy + 6, 28, wall, { slits: true });
  }
  b.flag(56, 56, b.top - 10, 6, 5, 3);
  b.banner(24, 58, 6, 4, 8);
  b.banner(36, 58, 6, 4, 8);
}

function foundry(b: Builder, L: Look): void {
  yard(b, 48);
  const r: [number, number, number, number] = [6, 6, 34, 28];
  const h = 16;
  b.main(r[0], r[1], r[2], r[3], h);
  const wall: Surface = L.gothic ? { mat: 'stoneDark', paint: P.ashlar('stoneDark') } : BRICK;
  hall(b, L, r, h, 'x', {
    left: holes(wall, [{ f: 0.4, w: 9, h: 10, shape: L.gothic ? 'flat' : L.arch, fill: 'glow!2', frame: 'iron' }, window(L, 0.85, 8, 2, 4, 'glow!1')]),
    right: holes(wall, [window(L, 0.3, 8, 2, 4, 'glow!1'), window(L, 0.7, 8, 2, 4, 'glow!1')]),
  }, { mat: 'lead', paint: P.shingles('lead', 3, 5) }, 0.8);
  // Horno: chimenea redonda alta.
  b.prism(30, 10, 3.5, 10, 0, 36, wall, 'void');
  if (b.limit === Infinity) b.emitters.push({ kind: 'smoke', p: [30, 10, 38] });
  b.box(28, 7, 34, 32, 13, 36, 'iron');
  // Una bombarda recién fundida y balas.
  b.beam([12, 36, 2], [26, 36, 3.5], 3.2, 'iron', { ends: 'void' });
  b.box(13, 34, 0, 16, 38, 2, 'log');
  b.box(22, 34, 0, 25, 38, 2, 'log');
  for (const [x, y] of [
    [32, 36],
    [34, 37],
    [33, 39],
  ]) b.prism(x, y, 1, 6, 0, 1.8, 'iron');
  b.flag(16, 17, b.top - 1, 7, 5, 4);
}

function cathedral(b: Builder, L: Look): void {
  yard(b, 80, PAVING);
  const g = L.gothic;
  const wall = L.wall;
  // Nave a lo largo de y: la fachada mira a la izquierda (+y), la cara más iluminada.
  const nave: [number, number, number, number] = [26, 10, 54, 62];
  const nh = g ? 38 : 30;
  b.main(nave[0], nave[1], nave[2], nave[3], nh);
  const sideWin = windows(L, 52, 8, nh * 0.35, 3, g ? 14 : 9);
  b.box(nave[0], nave[1], 0, nave[2], nave[3], nh, { left: wall, right: holes(wall, sideWin) });
  roof(b, L, nave[0], nave[1], nave[2], nave[3], nh, 'y', wall, g ? { mat: 'lead', paint: P.shingles('lead', 3, 5) } : L.spireTile, g ? 1.4 : 0.6);
  // Naves laterales más bajas.
  b.box(nave[2], nave[1] + 4, 0, nave[2] + 8, nave[3] - 6, nh * 0.5, { left: wall, right: holes(wall, windows(L, 42, 8, 6, 3, 7)) });
  b.quad(
    [
      [nave[2] - 0.5, nave[1] + 3, nh * 0.5 + 6],
      [nave[2] - 0.5, nave[3] - 5, nh * 0.5 + 6],
      [nave[2] + 9, nave[3] - 5, nh * 0.5 - 0.5],
      [nave[2] + 9, nave[1] + 3, nh * 0.5 - 0.5],
    ],
    g ? { mat: 'lead', paint: P.shingles('lead', 3, 5) } : L.spireTile,
  );
  if (g) {
    // Arbotantes.
    for (let y = nave[1] + 8; y < nave[3] - 8; y += 8) {
      b.box(nave[2] + 7, y - 1, 0, nave[2] + 10, y + 1, nh * 0.5 + 6, wall);
      b.beam([nave[2] + 9, y, nh * 0.5 + 6], [nave[2], y, nh - 4], 1.2, matOf(wall));
    }
  }
  // Fachada con rosetón y portada.
  const facade = holes(wall, [
    { f: 0.5, w: 9, h: 16, shape: L.arch, fill: P.DOOR, frame: g ? 'ashlar+' : 'brick-', alfiz: L.alfiz },
    { f: 0.5, v0: 21, w: 9, h: 9, shape: 'round', fill: 'glass', frame: g ? 'ashlar+' : 'mortar' },
  ]);
  const roseFacade: Surface = {
    mat: matOf(wall),
    paint: (at) => {
      const d = Math.hypot(at.u - at.w / 2, at.v - 25.5);
      if (d < 4.5) return d < 1 ? 'gold' : Math.floor(Math.atan2(at.v - 25.5, at.u - at.w / 2) / (Math.PI / 4)) % 2 === 0 ? 'glass+' : 'glass';
      return paintOf(facade)?.(at);
    },
  };
  b.box(nave[0] + 6, nave[3], 0, nave[2] - 6, nave[3] + 2, nh, { left: roseFacade, right: wall });
  if (g) {
    // Dos torres con chapitel.
    for (const x of [nave[0] - 4, nave[2] - 8]) squareTower(b, L, x, nave[3] - 6, x + 12, nave[3] + 6, 62, wall, { spire: 34, spireMat: { mat: 'lead', paint: P.shingles('lead', 3, 3) }, bells: true });
    // Cimborrio en el crucero.
    b.prism(40, 30, 6, 8, nh + 4, nh + 14, wall);
    b.cone(40, 30, 6, 8, nh + 14, 18, { mat: 'lead', paint: P.shingles('lead', 3, 3) }, 0.5);
  } else {
    // Torre mudéjar: ladrillo, azulejos y tejado a cuatro aguas.
    squareTower(b, L, nave[2] - 6, nave[3] - 8, nave[2] + 8, nave[3] + 6, 70, wall, { spire: 10, spireMat: { mat: 'azulejo', paint: P.shingles('azulejo', 2, 2) }, bells: true, slits: true });
    b.prism(40, 30, 7, 8, nh + 2, nh + 10, wall);
    b.cone(40, 30, 7, 8, nh + 10, 7, { mat: 'azulejo', paint: P.shingles('azulejo', 2, 2) }, 0.5);
  }
  b.banner(nave[0] + 9, nave[3] + 2, 6, 4, 9);
  b.banner(nave[2] - 13, nave[3] + 2, 6, 4, 9);
  b.flag(g ? nave[0] + 2 : nave[2] + 1, nave[3], b.top, 10, 7, 5);
}

// ── Montaje ───────────────────────────────────────────────────────────

const MODELS: Readonly<Record<BuildingType, (b: Builder, L: Look, link: number, stage: BuildStage) => void>> = {
  [BuildingType.TownCenter]: (b, L) => townCenter(b, L),
  [BuildingType.House]: (b, L) => house(b, L),
  [BuildingType.Mill]: (b, L) => mill(b, L),
  [BuildingType.LumberCamp]: (b, L) => lumberCamp(b, L),
  [BuildingType.MiningCamp]: (b, L) => miningCamp(b, L),
  [BuildingType.Farm]: (b, _L, _link, stage) => farm(b, stage),
  [BuildingType.Barracks]: (b, L) => barracks(b, L),
  [BuildingType.ArcheryRange]: (b, L) => archeryRange(b, L),
  [BuildingType.Stable]: (b, L) => stable(b, L),
  [BuildingType.WatchTower]: (b, L) => watchTower(b, L),
  [BuildingType.Palisade]: (b, _L, link) => palisade(b, link),
  [BuildingType.StoneWall]: (b, L, link) => stoneWall(b, L, link),
  [BuildingType.Gate]: (b, L, link) => gate(b, L, link),
  [BuildingType.Market]: (b, L) => market(b, L),
  [BuildingType.Blacksmith]: (b, L) => blacksmith(b, L),
  [BuildingType.University]: (b, L) => university(b, L),
  [BuildingType.Monastery]: (b, L) => monastery(b, L),
  [BuildingType.SiegeWorkshop]: (b, L) => siegeWorkshop(b, L),
  [BuildingType.Castle]: (b, L) => castle(b, L),
  [BuildingType.Foundry]: (b, L) => foundry(b, L),
  [BuildingType.Cathedral]: (b, L) => cathedral(b, L),
};

export interface BuildingModel {
  readonly faces: Builder['faces'];
  /** Humo, banderas y aspas que se animan aparte (solo en el modelo animado y terminado). */
  readonly emitters: Builder['emitters'];
  /** Rectángulo de la parte principal. */
  readonly main: readonly [number, number, number, number];
  /** Altura de los muros y punto más alto (sin mástiles), en píxeles. */
  readonly eave: number;
  readonly top: number;
}

/** Cimientos: el solar con el contorno de piedras (o troncos), estacas y material apilado. */
function foundation(b: Builder, type: BuildingType, main: readonly [number, number, number, number]): void {
  const [x0, y0, x1, y1] = main;
  if (type === BuildingType.Farm || x1 <= x0) return;
  const wooden = type === BuildingType.Palisade || type === BuildingType.LumberCamp;
  const mat = wooden ? 'log' : 'stone';
  const s = 1.6;
  const ring = (ax: number, ay: number, bx: number, by: number) => {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.floor(len / 2.6));
    for (let i = 0; i < n; i++) {
      const x = ax + ((bx - ax) * (i + 0.5)) / n;
      const y = ay + ((by - ay) * (i + 0.5)) / n;
      const k = 0.4 + noise(x, y, 71) * 0.6;
      b.box(x - s / 2, y - s / 2, 0, x + s / 2, y + s / 2, s * k + 0.4, mat, undefined, { always: true, noShadow: true });
    }
  };
  ring(x0, y1, x1, y1);
  ring(x1, y1, x1, y0);
  ring(x0, y0, x1, y0);
  ring(x0, y0, x0, y1);
  for (const [x, y] of [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
  ]) b.box(x - 0.5, y - 0.5, 0, x + 0.5, y + 0.5, 5, 'log', undefined, { always: true, decor: true });
  // Tablones y sillares preparados.
  if (x1 - x0 >= 10) {
    b.box(x0 + 2, y1 - 6, 0, x0 + 8, y1 - 3, 1.2, 'plank', undefined, { always: true });
    b.box(x0 + 2.5, y1 - 5.5, 1.2, x0 + 7.5, y1 - 3.5, 2.2, 'plank', undefined, { always: true });
    b.box(x1 - 6, y0 + 3, 0, x1 - 3, y0 + 6, 2.5, wooden ? 'log' : 'stone', undefined, { always: true });
  }
}

/** Escombros: restos de muros, cascotes y vigas quemadas. */
function rubble(b: Builder, main: readonly [number, number, number, number], wallMat: string, seed: number): void {
  const [x0, y0, x1, y1] = main;
  const area = (x1 - x0) * (y1 - y0);
  const count = Math.min(40, Math.max(6, Math.round(area / 18)));
  for (let i = 0; i < count; i++) {
    const x = x0 + noise(i, 1, seed) * (x1 - x0 - 3);
    const y = y0 + noise(i, 2, seed) * (y1 - y0 - 3);
    const s = 1.4 + noise(i, 3, seed) * 2.2;
    const mat = noise(i, 4, seed) < 0.25 ? 'void' : noise(i, 5, seed) < 0.3 ? 'log' : wallMat;
    b.box(x, y, 0, x + s, y + s * (0.6 + noise(i, 6, seed) * 0.6), s * 0.6, mat, undefined, { always: true });
  }
  for (let i = 0; i < Math.min(5, count / 4); i++) {
    const x = x0 + 2 + noise(i, 7, seed) * (x1 - x0 - 6);
    const y = y0 + 2 + noise(i, 8, seed) * (y1 - y0 - 6);
    b.beam([x, y, 0.5], [x + 5 + noise(i, 9, seed) * 4, y + 2 - noise(i, 10, seed) * 4, 1.5 + noise(i, 11, seed) * 3], 1, 'timber', { always: true });
  }
}

/** Monta el modelo de un edificio en una fase. `link` solo cuenta para los muros. */
export function buildingModel(type: BuildingType, era: number, arch: Architecture, stage: BuildStage, link = 0, animated = false): BuildingModel {
  const L = lookFor(arch, Math.max(0, Math.min(3, era)));
  const model = MODELS[type];
  // Primera pasada completa para conocer la parte principal y la altura de los muros.
  const probe = new Builder();
  probe.animated = animated;
  model(probe, L, link, BuildStage.Complete);
  if (stage === BuildStage.Complete || stage === BuildStage.Damaged || stage === BuildStage.FarmHalf || stage === BuildStage.FarmLow) {
    if (stage === BuildStage.FarmHalf || stage === BuildStage.FarmLow) {
      const b = new Builder();
      model(b, L, link, stage);
      return { faces: b.faces, emitters: [], main: b.mainRect, eave: b.eave, top: b.top };
    }
    return { faces: probe.faces, emitters: probe.emitters, main: probe.mainRect, eave: probe.eave, top: probe.top };
  }
  const eave = probe.eave;
  const limit = stage === BuildStage.Foundation ? -1 : stage === BuildStage.Frame ? Math.max(3, Math.round(eave * 0.45)) : stage === BuildStage.Walls ? eave : Math.max(4, Math.round(eave * 0.55));
  const b = new Builder(limit, stage === BuildStage.Ruins);
  model(b, L, link, stage);
  const main = probe.mainRect;
  if (stage === BuildStage.Foundation) foundation(b, type, main);
  else if (stage === BuildStage.Frame || stage === BuildStage.Walls) {
    if (type !== BuildingType.Farm && BUILDING_DEFS[type].size > 1) scaffold(b, main[0], main[1], main[2], main[3], limit);
  } else if (stage === BuildStage.Ruins) rubble(b, main, L.rubble, type * 7 + 3);
  return { faces: b.faces, emitters: [], main, eave: Math.min(limit, eave), top: Math.max(0, Math.min(limit, b.top)) };
}
