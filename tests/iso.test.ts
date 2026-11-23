import { describe, expect, it } from 'vitest';
import {
  HALF_W,
  TILE_H,
  TILE_W,
  diamondRowSpan,
  mapWorldBounds,
  tileCenterToWorld,
  tileToWorld,
  worldToTile,
  worldToTileFloor,
} from '../src/render/iso';

describe('coordenadas isométricas', () => {
  it('ida y vuelta casilla → mundo → casilla', () => {
    for (let ty = -5; ty < 40; ty += 3) {
      for (let tx = -5; tx < 40; tx += 3) {
        const w = tileToWorld(tx, ty);
        const t = worldToTile(w.x, w.y);
        expect(t.x).toBeCloseTo(tx, 10);
        expect(t.y).toBeCloseTo(ty, 10);
      }
    }
  });

  it('el centro de una casilla pertenece a esa casilla', () => {
    for (let ty = 0; ty < 20; ty++) {
      for (let tx = 0; tx < 20; tx++) {
        const c = tileCenterToWorld(tx, ty);
        expect(worldToTileFloor(c.x, c.y)).toEqual({ x: tx, y: ty });
      }
    }
  });

  it('cada píxel del rombo dibujado se detecta como su casilla (y los de fuera no)', () => {
    for (let r = 0; r < TILE_H; r++) {
      const [a, b] = diamondRowSpan(r);
      for (let col = 0; col < TILE_W; col++) {
        const dx = col - HALF_W;
        const drawn = dx >= a && dx < b;
        const tile = worldToTileFloor(dx + 0.5, r + 0.5);
        expect(tile.x === 0 && tile.y === 0).toBe(drawn);
      }
    }
  });

  it('los rombos encajan sin huecos ni solapes', () => {
    // Las filas de una casilla y de su vecina diagonal suman siempre el ancho completo.
    for (let r = 0; r < TILE_H / 2; r++) {
      const [a0, b0] = diamondRowSpan(r);
      const [a1, b1] = diamondRowSpan(r + TILE_H / 2);
      expect(b0 - a0 + (b1 - a1)).toBe(TILE_W);
    }
  });

  it('calcula los límites del mapa', () => {
    expect(mapWorldBounds(64, 32)).toEqual({ minX: -32 * 16, maxX: 64 * 16, minY: 0, maxY: 96 * 8 });
  });
});
