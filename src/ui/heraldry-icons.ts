import type { Faction } from '../data/factions';
import { europeLandAtDiamond } from '../map/europe';
import { renderShield } from '../render/heraldry';
import { createCanvas } from '../render/pixel-canvas';

/** Escudos y miniaturas de mapa para el menú y el HUD, como data URLs (se pintan una vez). */

const cache = new Map<string, string>();

function memo(key: string, make: () => string): string {
  let url = cache.get(key);
  if (!url) {
    url = make();
    cache.set(key, url);
  }
  return url;
}

/** Escudo de una corona (20 × 22 píxeles; se muestra con `image-rendering: pixelated`). */
export function shieldUrl(faction: Faction | 'random'): string {
  return memo(`shield:${faction}`, () => {
    const img = renderShield(faction);
    const { canvas, ctx } = createCanvas(img.width, img.height);
    ctx.putImageData(new ImageData(new Uint8ClampedArray(img.rgba), img.width, img.height), 0, 0);
    return canvas.toDataURL();
  });
}

export const THUMB_W = 160;
export const THUMB_H = 80;

const SEA = [38, 66, 120];
const SEA_EDGE = [70, 110, 160];
const LAND = [86, 132, 62];
const LAND_DRY = [150, 118, 70];
const FOREST = [46, 92, 50];

/** Ruido de valor sencillo y fijo (solo para el dibujo de las miniaturas). */
function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smoothNoise(x: number, y: number, cell: number, seed: number): number {
  const fx = x / cell;
  const fy = y / cell;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const a = hash(x0, y0, seed) + (hash(x0 + 1, y0, seed) - hash(x0, y0, seed)) * tx;
  const b = hash(x0, y0 + 1, seed) + (hash(x0 + 1, y0 + 1, seed) - hash(x0, y0 + 1, seed)) * tx;
  return a + (b - a) * ty;
}

/**
 * Miniatura isométrica (un rombo de 160 × 80): `kind` = 'europe' dibuja Europa; un número (las casillas de lado),
 * un mapa generado de ejemplo, con el rombo más pequeño cuanto más pequeño es el mapa.
 */
export function mapThumbUrl(kind: 'europe' | number): string {
  return memo(`thumb:${kind}`, () => {
    const { canvas, ctx } = createCanvas(THUMB_W, THUMB_H);
    const data = ctx.createImageData(THUMB_W, THUMB_H);
    const landAt = (e: number, n: number): number => {
      if (kind === 'europe') return europeLandAtDiamond(e, n);
      const v = smoothNoise((e + 1) * 40, (n + 1) * 40, 9, kind) * 0.7 + smoothNoise((e + 1) * 40, (n + 1) * 40, 4, kind + 9) * 0.3;
      return v > 0.36 ? 1 : 0;
    };
    const scale = kind === 'europe' ? 1 : 0.5 + kind / 320;
    for (let py = 0; py < THUMB_H; py++) {
      for (let px = 0; px < THUMB_W; px++) {
        const e = (((px + 0.5) / THUMB_W) * 2 - 1) / scale;
        const n = (1 - ((py + 0.5) / THUMB_H) * 2) / scale;
        if (Math.abs(e) + Math.abs(n) > 1) continue;
        const id = landAt(e, n);
        let c = SEA;
        if (id) {
          const forest = smoothNoise(px, py, 4, 77) > 0.62;
          const dry = kind === 'europe' && n < -0.2 && smoothNoise(px, py, 5, 31) > 0.45;
          c = forest ? FOREST : dry ? LAND_DRY : LAND;
        } else {
          // Agua junto a la costa, más clara.
          const step = 2 / THUMB_W;
          if (landAt(e + step, n) || landAt(e - step, n) || landAt(e, n + step * 2) || landAt(e, n - step * 2)) c = SEA_EDGE;
        }
        const i = (py * THUMB_W + px) * 4;
        data.data[i] = c[0];
        data.data[i + 1] = c[1];
        data.data[i + 2] = c[2];
        data.data[i + 3] = 255;
      }
    }
    ctx.putImageData(data, 0, 0);
    return canvas.toDataURL();
  });
}
