import { describe, expect, it } from 'vitest';
import { FP_ONE, fixedLength, fixedToTile, idiv, isqrt, tileCenterFixed, toFixed } from '../src/engine/fixed';

describe('punto fijo', () => {
  it('isqrt es exacto', () => {
    for (let n = 0; n < 20000; n++) {
      const r = isqrt(n);
      expect(r * r).toBeLessThanOrEqual(n);
      expect((r + 1) * (r + 1)).toBeGreaterThan(n);
    }
    expect(isqrt(2 ** 40)).toBe(2 ** 20);
    expect(isqrt(2 ** 40 - 1)).toBe(2 ** 20 - 1);
  });

  it('convierte entre casillas y punto fijo', () => {
    expect(FP_ONE).toBe(256);
    expect(toFixed(1.5)).toBe(384);
    expect(fixedToTile(383)).toBe(1);
    expect(fixedToTile(-1)).toBe(-1);
    expect(tileCenterFixed(2)).toBe(640);
  });

  it('longitud y división enteras', () => {
    expect(fixedLength(3, 4)).toBe(5);
    expect(idiv(7, 2)).toBe(3);
    expect(idiv(-7, 2)).toBe(-3);
  });
});
