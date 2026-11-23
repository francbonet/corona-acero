import { Texture } from 'pixi.js';
import { HALF_H, HALF_W, TILE_H, TILE_W, diamondRowSpan } from './iso';
import { createCanvas } from './pixel-canvas';

/** Rombos de una casilla en blanco, para teñirlos: cursor y rejilla. */
export interface TileShapes {
  /** Contorno completo del rombo (cursor, selección). */
  readonly tileOutline: Texture;
  /** Solo los dos bordes de arriba, para dibujar la rejilla sin líneas dobles. */
  readonly tileGrid: Texture;
}

function shape(paint: (row: (x0: number, x1: number, y: number) => void) => void): Texture {
  const { canvas, ctx } = createCanvas(TILE_W, TILE_H);
  ctx.fillStyle = '#ffffff';
  paint((x0, x1, y) => ctx.fillRect(x0, y, x1 - x0, 1));
  const tex = Texture.from(canvas);
  tex.source.scaleMode = 'nearest';
  return tex;
}

/** Bordes del rombo (2 píxeles por lado en cada fila) para las filas 0..rows-1. */
function outline(rows: number) {
  return (row: (x0: number, x1: number, y: number) => void) => {
    for (let r = 0; r < rows; r++) {
      const [a, b] = diamondRowSpan(r);
      row(HALF_W + a, HALF_W + Math.min(a + 2, b), r);
      row(HALF_W + Math.max(b - 2, a), HALF_W + b, r);
    }
  };
}

export function createTileShapes(): TileShapes {
  return {
    tileOutline: shape(outline(TILE_H)),
    tileGrid: shape(outline(HALF_H)),
  };
}
