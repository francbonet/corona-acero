import { describe, expect, it } from 'vitest';
import { Rng, hash2, hashString } from '../src/engine/rng';

describe('Rng', () => {
  it('la misma semilla produce la misma secuencia', () => {
    const a = new Rng(1234);
    const b = new Rng(1234);
    for (let i = 0; i < 1000; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('semillas distintas producen secuencias distintas', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const same = Array.from({ length: 50 }, () => a.nextU32() === b.nextU32()).filter(Boolean).length;
    expect(same).toBeLessThan(3);
  });

  it('nextInt y nextRange respetan los límites y se reparten de forma uniforme', () => {
    const rng = new Rng(99);
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 20000; i++) {
      const v = rng.nextInt(10);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
      buckets[v] = (buckets[v] ?? 0) + 1;
    }
    for (const n of buckets) expect(n).toBeGreaterThan(1700);
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextRange(-3, 3);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThanOrEqual(3);
    }
  });

  it('guardar y restaurar el estado reproduce la secuencia', () => {
    const rng = new Rng(7);
    rng.nextU32();
    const saved = rng.getState();
    const first = [rng.nextU32(), rng.nextU32(), rng.nextU32()];
    rng.setState(saved);
    expect([rng.nextU32(), rng.nextU32(), rng.nextU32()]).toEqual(first);
  });

  it('los hashes son deterministas', () => {
    expect(hashString('corona-y-acero')).toBe(hashString('corona-y-acero'));
    expect(hashString('a')).not.toBe(hashString('b'));
    expect(hash2(3, 4, 1)).toBe(hash2(3, 4, 1));
    expect(hash2(3, 4)).not.toBe(hash2(4, 3));
  });
});
