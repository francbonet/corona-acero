import { Texture } from 'pixi.js';
import { type NatureImage, renderBush, renderDeposit, renderTree, type TreeSpeciesName, type TreeState } from './nature-art';
import { createCanvas, drawTextSprite } from './pixel-canvas';
import { CARCASS, CARRY_SPRITES, FIRE, NODE_COLORS, SPARK } from './node-sprites';

/** Textura con su punto de apoyo normalizado (para `Sprite.anchor`). */
export interface AnchoredTexture {
  readonly texture: Texture;
  readonly ax: number;
  readonly ay: number;
  /** Escala del sprite (los cadáveres de animales usan texturas de unidad, a doble densidad). */
  readonly scale?: number;
}

export interface NodeArt {
  /** Árbol: especie, variante (0–2) y estado (en pie, talado o tocón). */
  tree(species: TreeSpeciesName, variant: number, state: TreeState): AnchoredTexture;
  /** Mina de oro o de piedra con lo que queda (0 = casi agotada, 1 = a medias, 2 = entera). */
  deposit(kind: 'gold' | 'stone', level: number): AnchoredTexture;
  /** Arbusto de bayas con lo que queda (0–2). */
  bush(level: number): AnchoredTexture;
  /** Carne genérica (por si un animal no tiene animación de muerte). */
  readonly carcass: Texture;
  /** Carga a cuestas por recurso (comida, madera, piedra, oro). */
  readonly carry: readonly Texture[];
  readonly spark: Texture;
  readonly fire: readonly Texture[];
}

function texture(rows: readonly string[]): Texture {
  const { canvas, ctx } = createCanvas(rows[0].length, rows.length);
  drawTextSprite(ctx, rows, 0, 0, NODE_COLORS);
  const tex = Texture.from(canvas);
  tex.source.scaleMode = 'nearest';
  return tex;
}

function anchored(img: NatureImage): AnchoredTexture {
  const { canvas, ctx } = createCanvas(img.width, img.height);
  ctx.putImageData(new ImageData(img.rgba, img.width, img.height), 0, 0);
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';
  return { texture, ax: img.anchorX / img.width, ay: img.anchorY / img.height };
}

const LEVELS = [0.2, 0.5, 1];

export function createNodeArt(): NodeArt {
  const cache = new Map<string, AnchoredTexture>();
  const memo = (key: string, make: () => NatureImage): AnchoredTexture => {
    let t = cache.get(key);
    if (!t) {
      t = anchored(make());
      cache.set(key, t);
    }
    return t;
  };
  return {
    tree: (species, variant, state) => memo(`t:${species}:${variant}:${state}`, () => renderTree(species, variant, state)),
    deposit: (kind, level) => memo(`d:${kind}:${level}`, () => renderDeposit(kind, LEVELS[level] ?? 1)),
    bush: (level) => memo(`b:${level}`, () => renderBush(LEVELS[level] ?? 1)),
    carcass: texture(CARCASS),
    carry: CARRY_SPRITES.map(texture),
    spark: texture(SPARK),
    fire: FIRE.map(texture),
  };
}
