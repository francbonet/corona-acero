import { Texture } from 'pixi.js';
import { BUILDING_DEFS, BuildingType } from '../data/buildings';
import { hash2 } from '../engine/rng';
import { type IsoRamps, projectedBounds, rasterizeIso } from './arch/iso-raster';
import { archRampsFor } from './arch/materials';
import { Builder } from './arch/builder';
import { type Architecture, BuildStage, buildingModel, millSails } from './arch/models';
import { TEAM_COLORS } from './palette';
import { type CardImage, ICON_SIZE, backdrop, stamp } from './icon-card';
import { createCanvas, diamondSpanN, drawTextSprite, px } from './pixel-canvas';
import { NODE_COLORS, RALLY_FLAG } from './node-sprites';

/**
 * Arte de los edificios: se modelan con piezas en 3D (`arch/models.ts`) y se pintan con el rasterizador
 * isométrico (`arch/iso-raster.ts`) la primera vez que hacen falta, por tipo, jugador, era, fase y, en los
 * muros, según con qué vecinos enlazan. Las fases dañada y en ruinas salen del edificio terminado.
 */

export { BuildStage };
export type { Architecture };

/** Edificio ya pintado, en RGBA (sin DOM, para poder probarlo en Node). */
export interface BuildingImage {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  /** Píxel del lienzo donde cae el vértice de arriba de la huella. */
  readonly originX: number;
  readonly originY: number;
  /** Altura de los muros y punto más alto (sin mástiles), en píxeles sobre el suelo. */
  readonly eave: number;
  readonly top: number;
  /** Lo que se anima encima (humo, banderas, aspas), en píxeles del lienzo. */
  readonly emitters: readonly SpriteEmitter[];
  /** Dónde arde el tejado cuando está dañado, en píxeles del lienzo (de más a menos importante). */
  readonly firePoints: readonly (readonly [number, number])[];
}

export interface SpriteEmitter {
  readonly kind: 'smoke' | 'flag' | 'sails';
  readonly x: number;
  readonly y: number;
  readonly w?: number;
  readonly h?: number;
}

export interface BuildingSprite {
  readonly texture: Texture;
  readonly originX: number;
  readonly originY: number;
  readonly eave: number;
  readonly top: number;
  readonly emitters: readonly SpriteEmitter[];
  readonly firePoints: readonly (readonly [number, number])[];
}

/** Fotogramas con su punto de apoyo normalizado. */
export interface AnimFrames {
  readonly frames: readonly Texture[];
  readonly ax: number;
  readonly ay: number;
}

const ROOFS = new Set(['thatch', 'tiles', 'slate', 'shingle', 'lead', 'copper', 'azulejo']);
const WALLS = new Set(['ashlar', 'stone', 'stoneDark', 'brick', 'whitewash', 'plaster', 'adobe', 'plank', 'log', 'mortar']);

/** Pinta un edificio. `link` (muros): con qué vecinos enlaza. */
export function renderBuilding(type: BuildingType, era: number, arch: Architecture, stage: BuildStage, team: readonly [string, string, string], link = 0): BuildingImage {
  const geometryStage = stage === BuildStage.Damaged ? BuildStage.Complete : stage;
  const model = buildingModel(type, era, arch, geometryStage, link, true);
  const n = BUILDING_DEFS[type].size;
  const bb = projectedBounds(model.faces);
  // El lienzo cubre siempre el rombo de la huella, más un píxel para el contorno.
  const x0 = Math.min(bb.x0, -16 * n) - 1;
  const y0 = Math.min(bb.y0, 0) - 1;
  const x1 = Math.max(bb.x1, 16 * n) + 1;
  const y1 = Math.max(bb.y1, 16 * n) + 1;
  const width = x1 - x0;
  const height = y1 - y0;
  const ramps = archRampsFor(team);
  const r = rasterizeIso(model.faces, { width, height, originX: -x0, originY: -y0, ramps });
  if (stage === BuildStage.Damaged) damage(r, ramps, type * 131 + era * 7);
  const toPx = (p: readonly [number, number, number]): [number, number] => [Math.round(-x0 + p[0] - p[1]), Math.round(-y0 + (p[0] + p[1]) / 2 - p[2])];
  const emitters = model.emitters.map((em) => {
    const [x, y] = toPx(em.p);
    return { kind: em.kind, x, y, w: em.w, h: em.h };
  });
  // Fuego sobre el tejado: en medio de la parte principal y hacia sus esquinas de delante.
  const [mx0, my0, mx1, my1] = model.main;
  const roofZ = (k: number) => model.eave + (model.top - model.eave) * k;
  const firePoints =
    mx1 > mx0
      ? [
          toPx([(mx0 + mx1) / 2, (my0 + my1) / 2, roofZ(0.6)]),
          toPx([mx0 + (mx1 - mx0) * 0.3, my0 + (my1 - my0) * 0.7, roofZ(0.3)]),
          toPx([mx0 + (mx1 - mx0) * 0.75, my0 + (my1 - my0) * 0.35, roofZ(0.35)]),
        ]
      : [];
  return { width, height, rgba: r.rgba, originX: -x0, originY: -y0, eave: model.eave, top: model.top, emitters, firePoints };
}

/** Lienzo de las aspas del molino: el eje cae en el centro. */
const SAILS_W = 44;
const SAILS_H = 60;
export const SAIL_FRAMES = 4;

/** Aspas del molino girando (4 fotogramas, un cuarto de vuelta: las cuatro aspas son iguales). */
export function renderSails(team: readonly [string, string, string]): { width: number; height: number; frames: Uint8ClampedArray[] } {
  const frames: Uint8ClampedArray[] = [];
  for (let f = 0; f < SAIL_FRAMES; f++) {
    const b = new Builder();
    millSails(b, [0, 0, 0], (f * Math.PI) / 2 / SAIL_FRAMES);
    const r = rasterizeIso(b.faces, { width: SAILS_W, height: SAILS_H, originX: SAILS_W / 2, originY: SAILS_H / 2, ramps: archRampsFor(team), shadows: false });
    frames.push(r.rgba);
  }
  return { width: SAILS_W, height: SAILS_H, frames };
}

/** Bandera ondeando (4 fotogramas) de w×h, en la perspectiva de la pared izquierda: baja medio píxel por columna. */
export function renderFlag(team: readonly [string, string, string], w: number, h: number): { width: number; height: number; frames: Uint8ClampedArray[] } {
  const width = w + 2;
  const height = h + Math.ceil(w / 2) + 3;
  const rgb = (c: string) => {
    const n = Number.parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [dark, mid, light] = team.map(rgb);
  const edge = dark.map((v) => v * 0.55);
  const frames: Uint8ClampedArray[] = [];
  for (let f = 0; f < 4; f++) {
    const out = new Uint8ClampedArray(width * height * 4);
    const set = (x: number, y: number, c: number[]) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const k = (y * width + x) * 4;
      out[k] = c[0];
      out[k + 1] = c[1];
      out[k + 2] = c[2];
      out[k + 3] = 255;
    };
    for (let x = 0; x < w; x++) {
      // La ola crece hacia la punta y avanza un cuarto de periodo por fotograma.
      const phase = (x / w) * Math.PI * 1.6 - (f * Math.PI) / 2;
      const amp = (x / w) * 1.4;
      const off = Math.round(Math.sin(phase) * amp);
      const shade = Math.cos(phase);
      const top = 1 + Math.floor(x / 2) + off;
      for (let y = 0; y < h; y++) {
        const c = y === h - 1 ? dark : shade > 0.35 ? light : shade < -0.35 ? dark : mid;
        set(x + 1, top + y, c);
      }
      set(x + 1, top - 1, edge);
      set(x + 1, top + h, edge);
    }
    for (let y = 0; y < h; y++) set(w + 1, 1 + Math.floor((w - 1) / 2) + Math.round(Math.sin(Math.PI * 1.6 - (f * Math.PI) / 2) * 1.4) + y, edge);
    frames.push(out);
  }
  return { width, height, frames };
}

/** Daños: grietas en los muros, hollín y boquetes en el tejado (a partir del edificio entero). */
function damage(r: ReturnType<typeof rasterizeIso>, ramps: IsoRamps, seed: number): void {
  const { width, height, rgba, kind, tone } = r;
  const set = (x: number, y: number, mat: string, t: number) => {
    const k = y * width + x;
    const hex = ramps[mat][Math.max(0, Math.min(3, t))];
    const c = Number.parseInt(hex.slice(1), 16);
    rgba[k * 4] = (c >> 16) & 255;
    rgba[k * 4 + 1] = (c >> 8) & 255;
    rgba[k * 4 + 2] = c & 255;
    rgba[k * 4 + 3] = 255;
  };
  const walls: number[] = [];
  const roofs: number[] = [];
  for (let k = 0; k < width * height; k++) {
    if (kind[k] !== 1 || tone[k] === 0) continue;
    const m = r.matAt(k % width, Math.floor(k / width));
    if (ROOFS.has(m)) roofs.push(k);
    else if (WALLS.has(m)) walls.push(k);
  }
  const pick = (list: number[], i: number) => list[hash2(i, seed, 0xda) % list.length];
  // Grietas: zigzag hacia abajo.
  const cracks = Math.min(10, Math.max(2, Math.round(walls.length / 220)));
  for (let i = 0; walls.length > 0 && i < cracks; i++) {
    const k0 = pick(walls, i);
    let x = k0 % width;
    let y = Math.floor(k0 / width);
    const len = 4 + (hash2(i, seed, 3) % 7);
    for (let s = 0; s < len && y < height; s++) {
      const k = y * width + x;
      if (kind[k] !== 1) break;
      const m = r.matAt(x, y);
      if (!WALLS.has(m)) break;
      set(x, y, m, 0);
      y += 1;
      const turn = hash2(i, s, seed) % 3;
      x += turn === 0 ? -1 : turn === 1 ? 1 : 0;
      if (x < 0 || x >= width) break;
    }
  }
  // Hollín: manchas oscuras en los muros.
  for (let i = 0; walls.length > 0 && i < cracks; i++) {
    const k0 = pick(walls, i + 50);
    const cx = k0 % width;
    const cy = Math.floor(k0 / width);
    for (let dy = -3; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const k = y * width + x;
        if (kind[k] !== 1 || tone[k] === 0 || dx * dx + dy * dy > 6 || hash2(x, y, seed) % 3 === 0) continue;
        const m = r.matAt(x, y);
        if (WALLS.has(m)) set(x, y, m, tone[k] - 1);
      }
    }
  }
  // Boquetes en el tejado: hueco oscuro con un par de vigas a la vista.
  const holes = Math.min(4, Math.max(1, Math.round(roofs.length / 500)));
  for (let i = 0; roofs.length > 0 && i < holes; i++) {
    const k0 = pick(roofs, i + 100);
    const cx = k0 % width;
    const cy = Math.floor(k0 / width);
    const rad = 2 + (hash2(i, seed, 9) % 2);
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad - 1; dx <= rad + 1; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const k = y * width + x;
        if (kind[k] !== 1 || !ROOFS.has(r.matAt(x, y))) continue;
        const d = (dx * dx) / 1.6 + dy * dy;
        if (d > rad * rad + (hash2(x, y, seed + 1) % 3)) continue;
        if ((x + 2 * y) % 4 === 0) set(x, y, 'timber', 2);
        else set(x, y, 'void', d > rad * rad - 2 ? 2 : 0);
      }
    }
  }
}

/**
 * Icono de un edificio: una tarjeta de 44×44 con el paisaje de fondo y el edificio terminado encima, pintado
 * directamente a escala pequeña (con sus puertas, ventanas y color de equipo, sin las juntas ni las tejas, que
 * a ese tamaño solo ensucian) y apoyado en la hierba.
 */
export function buildingIcon(type: BuildingType, era: number, arch: Architecture, team: readonly [string, string, string]): CardImage {
  const model = buildingModel(type, era, arch, BuildStage.Complete);
  const faces = model.faces.filter((f) => !f.ground).map((f) => (f.paint ? { ...f, paint: flatPaint(f.paint, f.mat) } : f));
  const bb = projectedBounds(faces, 0);
  const w0 = bb.x1 - bb.x0;
  const h0 = bb.y1 - bb.y0;
  // Lo más grande que quepa: casi todo el ancho y sin tapar del todo el cielo.
  const s = Math.min(1, (ICON_SIZE - 4) / w0, (ICON_SIZE - 8) / h0);
  const width = Math.ceil(w0 * s) + 3;
  const height = Math.ceil(h0 * s) + 3;
  const r = rasterizeIso(faces, { width, height, originX: -bb.x0 * s + 1, originY: -bb.y0 * s + 1, ramps: archRampsFor(team), shadows: true, scale: s });
  const card = backdrop('field', 30);
  stamp(card, r, Math.round((ICON_SIZE - width) / 2), ICON_SIZE - 2 - height);
  return card;
}

/** Nombre del material de un token (sin los modificadores de tono). */
const matName = (token: string) => token.replace(/!\d$/, '').replace(/[-+]+$/, '');

/**
 * Del dibujo de una cara solo deja lo que cambia de material (puertas, ventanas, franjas, color de equipo),
 * no los matices del mismo material (juntas, tejas, vetas), que al reducir el edificio solo ensucian.
 */
function flatPaint(paint: NonNullable<Parameters<typeof rasterizeIso>[0][number]['paint']>, mat: string): typeof paint {
  const base = matName(mat);
  return (at) => {
    const m = paint(at);
    if (!m) return undefined;
    const name = matName(m);
    return name === base || name === 'mortar' ? undefined : m;
  };
}

/** Altura de los muros y del tejado de un edificio terminado (para la zona de clic y la barra de vida). */
const heightCache = new Map<string, { eave: number; top: number }>();
export function buildingHeights(type: BuildingType, era: number, arch: Architecture): { eave: number; top: number } {
  const key = `${type}:${era}:${arch}`;
  let h = heightCache.get(key);
  if (!h) {
    const m = buildingModel(type, era, arch, BuildStage.Complete);
    h = { eave: m.eave, top: Math.max(m.eave, m.top) };
    heightCache.set(key, h);
  }
  return h;
}

export interface BuildingArt {
  /** Edificio de un jugador en una era y fase (se pinta la primera vez que se pide). */
  sprite(type: BuildingType, player: number, era: number, stage: BuildStage, link?: number): BuildingSprite;
  /** Aspas del molino girando; el punto de apoyo es el eje. */
  sails(player: number): AnimFrames;
  /** Bandera ondeando de w×h; el punto de apoyo es lo alto del mástil. */
  flag(player: number, w: number, h: number): AnimFrames;
  /** Alturas del edificio terminado, para la zona de clic y la barra de vida. */
  heights(type: BuildingType, player: number, era: number): { eave: number; top: number };
  /** Icono del HUD como data URL. */
  icon(type: BuildingType, player: number, era: number): string;
  /** Contorno del rombo de N casillas (índice = N), en blanco para teñirlo. */
  readonly outlines: Texture[];
  /** Bandera de reunión por jugador. */
  readonly flags: Texture[];
}

function toTexture(img: { width: number; height: number; rgba: Uint8ClampedArray }): Texture {
  const { canvas, ctx } = createCanvas(img.width, img.height);
  ctx.putImageData(new ImageData(new Uint8ClampedArray(img.rgba), img.width, img.height), 0, 0);
  const tex = Texture.from(canvas);
  tex.source.scaleMode = 'nearest';
  return tex;
}

export function createBuildingArt(architectureOf: (player: number) => Architecture): BuildingArt {
  const cache = new Map<string, BuildingSprite>();
  const icons = new Map<string, string>();
  const teamOf = (player: number) => TEAM_COLORS[Math.min(player, TEAM_COLORS.length - 1)];

  const sprite = (type: BuildingType, player: number, era: number, stage: BuildStage, link = 0): BuildingSprite => {
    const arch = architectureOf(player);
    const isWall = BUILDING_DEFS[type].wall === true;
    const key = `${type}:${player}:${era}:${arch}:${stage}:${isWall ? link : 0}`;
    let s = cache.get(key);
    if (!s) {
      const img = renderBuilding(type, era, arch, stage, teamOf(player), isWall ? link : 0);
      s = { texture: toTexture(img), originX: img.originX, originY: img.originY, eave: img.eave, top: img.top, emitters: img.emitters, firePoints: img.firePoints };
      cache.set(key, s);
    }
    return s;
  };
  const anims = new Map<string, AnimFrames>();
  const animFrames = (key: string, make: () => { width: number; height: number; frames: Uint8ClampedArray[] }, ax: (w: number) => number, ay: (h: number) => number): AnimFrames => {
    let a = anims.get(key);
    if (!a) {
      const img = make();
      a = { frames: img.frames.map((rgba) => toTexture({ width: img.width, height: img.height, rgba })), ax: ax(img.width) / img.width, ay: ay(img.height) / img.height };
      anims.set(key, a);
    }
    return a;
  };

  const outlines: Texture[] = [Texture.EMPTY];
  for (let n = 1; n <= 5; n++) {
    const { canvas, ctx } = createCanvas(32 * n, 16 * n);
    for (let r = 0; r < 16 * n; r++) {
      const [a, b] = diamondSpanN(n, r);
      const c = 16 * n;
      for (let x = a; x < b; x++) if (x < a + 2 || x >= b - 2) px(ctx, c + x, r, '#ffffff');
    }
    const tex = Texture.from(canvas);
    tex.source.scaleMode = 'nearest';
    outlines.push(tex);
  }

  const flags = TEAM_COLORS.map((team) => {
    const { canvas, ctx } = createCanvas(RALLY_FLAG[0].length, RALLY_FLAG.length);
    drawTextSprite(ctx, RALLY_FLAG, 0, 0, NODE_COLORS, team);
    const tex = Texture.from(canvas);
    tex.source.scaleMode = 'nearest';
    return tex;
  });

  return {
    sprite,
    sails: (player) => animFrames(`sails:${architectureOf(player)}`, () => renderSails(teamOf(player)), (w) => w / 2, (h) => h / 2),
    flag: (player, w, h) => animFrames(`flag:${player}:${w}:${h}`, () => renderFlag(teamOf(player), w, h), () => 0, () => 1),
    heights: (type, player, era) => buildingHeights(type, era, architectureOf(player)),
    icon: (type, player, era) => {
      const arch = architectureOf(player);
      const key = `${type}:${player}:${era}:${arch}`;
      let url = icons.get(key);
      if (!url) {
        const img = buildingIcon(type, era, arch, teamOf(player));
        const { canvas, ctx } = createCanvas(img.width, img.height);
        ctx.putImageData(new ImageData(new Uint8ClampedArray(img.rgba), img.width, img.height), 0, 0);
        url = canvas.toDataURL();
        icons.set(key, url);
      }
      return url;
    },
    outlines,
    flags,
  };
}
