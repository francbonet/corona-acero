import { describe, expect, it } from 'vitest';
import { TEAM_KEYS, parseAseprite, recolorTeam } from '../src/render/assets/aseprite';

const sheet = {
  frames: [
    { frame: { x: 0, y: 0, w: 32, h: 32 }, duration: 500 },
    { frame: { x: 32, y: 0, w: 32, h: 32 }, duration: 500 },
    { frame: { x: 0, y: 32, w: 32, h: 32 }, duration: 100 },
  ],
  meta: {
    frameTags: [
      { name: 'reposo/S', from: 0, to: 1 },
      { name: 'andar/SO', from: 2, to: 2 },
      { name: 'otra-cosa', from: 0, to: 0 },
    ],
    slices: [{ name: 'pies', keys: [{ frame: 0, bounds: { x: 2, y: 3, w: 28, h: 28 }, pivot: { x: 14, y: 25 } }] }],
  },
};

describe('hojas de Aseprite', () => {
  it('lee los fotogramas por animación y dirección, y el pivote de los pies', () => {
    const s = parseAseprite(sheet);
    expect(s.frameW).toBe(32);
    expect(s.anims.get('idle')?.get('S')).toHaveLength(2);
    expect(s.anims.get('walk')?.get('SW')?.[0]).toMatchObject({ x: 0, y: 32, duration: 100 });
    expect(s.anims.size).toBe(2); // la etiqueta que no sigue el formato se ignora
    expect(s.pivot).toEqual({ x: 16, y: 28 });
    expect(parseAseprite({ ...sheet, meta: { frameTags: [] } }).pivot).toEqual({ x: 16, y: 27 });
    expect(() => parseAseprite({ frames: [], meta: {} })).toThrow();
  });

  it('cambia los magentas reservados por la rampa del jugador y deja el resto', () => {
    const px = new Uint8ClampedArray([...TEAM_KEYS[0], 255, ...TEAM_KEYS[3], 255, 10, 20, 30, 255, ...TEAM_KEYS[1], 0]);
    const out = recolorTeam(px, ['#000011', '#000022', '#000033', '#000044']);
    expect(Array.from(out.slice(0, 4))).toEqual([0, 0, 0x44, 255]); // clave clara → tono claro
    expect(Array.from(out.slice(4, 8))).toEqual([0, 0, 0x11, 255]); // clave oscura → tono oscuro
    expect(Array.from(out.slice(8, 12))).toEqual([10, 20, 30, 255]);
    expect(Array.from(out.slice(12, 16))).toEqual([...TEAM_KEYS[1], 0]); // transparente: se queda
  });
});
