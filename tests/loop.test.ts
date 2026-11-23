import { describe, expect, it } from 'vitest';
import { FixedLoop } from '../src/engine/loop';

describe('FixedLoop', () => {
  it('ejecuta 20 ticks por segundo de tiempo real', () => {
    const ticks: number[] = [];
    const loop = new FixedLoop({ tickRate: 20, onTick: (t) => ticks.push(t) });
    for (let i = 0; i < 100; i++) loop.advance(10);
    expect(loop.tick).toBe(20);
    expect(ticks).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });

  it('no depende de la tasa de fotogramas', () => {
    const slow = new FixedLoop({ tickRate: 20, onTick: () => {} });
    const fast = new FixedLoop({ tickRate: 20, onTick: () => {} });
    for (let i = 0; i < 30; i++) slow.advance(100); // 10 fps
    for (let i = 0; i < 375; i++) fast.advance(8); // 125 fps
    expect(slow.tick).toBe(60);
    expect(fast.tick).toBe(60);
  });

  it('devuelve alfa en [0, 1) para interpolar', () => {
    const loop = new FixedLoop({ tickRate: 20, onTick: () => {} });
    expect(loop.advance(25)).toBeCloseTo(0.5);
    expect(loop.advance(30)).toBeCloseTo(0.1);
    expect(loop.tick).toBe(1);
  });

  it('limita el tiempo de un fotograma muy largo', () => {
    const loop = new FixedLoop({ tickRate: 20, onTick: () => {}, maxFrameMs: 250 });
    loop.advance(10_000);
    expect(loop.tick).toBe(5);
  });

  it('ignora tiempos negativos o no numéricos', () => {
    const loop = new FixedLoop({ tickRate: 20, onTick: () => {} });
    loop.advance(-100);
    loop.advance(Number.NaN);
    expect(loop.tick).toBe(0);
  });

  it('rechaza un tickRate no válido', () => {
    expect(() => new FixedLoop({ tickRate: 0, onTick: () => {} })).toThrow(RangeError);
  });
});
