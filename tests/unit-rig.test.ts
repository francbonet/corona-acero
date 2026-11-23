import { describe, expect, it } from 'vitest';
import { UNIT_TYPE_COUNT, UnitType } from '../src/data/units';
import { TEAM_COLORS } from '../src/render/palette';
import { Job, unitModel } from '../src/render/rig/catalog';
import { rampsFor } from '../src/render/rig/materials';
import { DIRECTIONS, box, ell, mirror, opaqueBounds, rasterize, shaped } from '../src/render/rig/raster';
import { dirFromScreen, facingSign } from '../src/render/unit-art';

const render = (type: UnitType, anim: Parameters<ReturnType<typeof unitModel>['pose']>[0], f: number, dir: (typeof DIRECTIONS)[number], player = 1) => {
  const m = unitModel(type);
  return rasterize(m.pose(anim, f), dir, { width: m.cell, height: m.cell, originX: m.originX, originY: m.originY, ramps: rampsFor(TEAM_COLORS[player]) });
};
const opaque = (r: { rgba: Uint8ClampedArray }) => r.rgba.filter((_, i) => i % 4 === 3 && r.rgba[i] > 0).length;

describe('figuras de las unidades', () => {
  for (let type = 0; type < UNIT_TYPE_COUNT; type++) {
    const name = Object.entries(UnitType).find(([, v]) => v === type)?.[0] ?? String(type);
    it(`${name}: todas sus animaciones se pintan dentro de la celda y sin tocar los bordes`, () => {
      const m = unitModel(type as UnitType);
      expect(m.anims.some((a) => a.name === 'idle')).toBe(true);
      expect(m.anims.some((a) => a.name === 'walk')).toBe(true);
      for (const spec of m.anims) {
        for (let f = 0; f < spec.frames; f++) {
          for (const dir of DIRECTIONS) {
            const r = render(type as UnitType, spec.name, f, dir);
            const b = opaqueBounds(r);
            expect(b, `${spec.name} ${f} ${dir}`).not.toBeNull();
            // Margen de un píxel: nada recortado por la celda.
            expect(b!.x0, `${spec.name} ${f} ${dir}`).toBeGreaterThan(0);
            expect(b!.y0, `${spec.name} ${f} ${dir}`).toBeGreaterThan(0);
            expect(b!.x1, `${spec.name} ${f} ${dir}`).toBeLessThan(m.cell - 1);
            expect(b!.y1, `${spec.name} ${f} ${dir}`).toBeLessThan(m.cell);
          }
        }
      }
    });
  }

  it('las figuras a pie miden lo que dice la biblia de arte (19–28 px con el sombrero) y apoyan los pies en su sitio', () => {
    for (const type of [UnitType.Villager, UnitType.Militia, UnitType.Archer, UnitType.Monk]) {
      const m = unitModel(type);
      const b = opaqueBounds(render(type, 'idle', 0, 'S'))!;
      const height = b.y1 - b.y0 + 1;
      expect(height, String(type)).toBeGreaterThanOrEqual(19);
      expect(height, String(type)).toBeLessThanOrEqual(28);
      expect(b.y1 - m.originY, String(type)).toBeGreaterThanOrEqual(-1);
      expect(b.y1 - m.originY, String(type)).toBeLessThanOrEqual(1);
    }
  });

  it('cada dirección y cada fotograma de andar se ven distintos', () => {
    const key = (r: { rgba: Uint8ClampedArray }) => Array.from(r.rgba).join(',');
    const frames = DIRECTIONS.map((d) => key(render(UnitType.Spearman, 'idle', 0, d)));
    expect(new Set(frames).size).toBe(DIRECTIONS.length);
    const walk = [0, 1, 2, 3, 4, 5].map((f) => key(render(UnitType.Villager, 'walk', f, 'SW')));
    expect(new Set(walk).size).toBeGreaterThanOrEqual(4);
  });

  it('el color de equipo cambia el dibujo y la misma pose sale siempre igual', () => {
    const blue = render(UnitType.ManAtArms, 'idle', 0, 'S', 1);
    const red = render(UnitType.ManAtArms, 'idle', 0, 'S', 2);
    expect(Array.from(red.rgba).join(',')).not.toBe(Array.from(blue.rgba).join(','));
    expect(opaque(red)).toBe(opaque(blue));
    expect(render(UnitType.ManAtArms, 'idle', 0, 'S', 1).rgba).toEqual(blue.rgba);
  });

  it('la muerte acaba con la figura en el suelo (más ancha que alta)', () => {
    const b = opaqueBounds(render(UnitType.Militia, 'die', 4, 'SW'))!;
    expect(b.x1 - b.x0).toBeGreaterThan(b.y1 - b.y0);
  });

  it('el trabuquete montado es más alto que recogido', () => {
    const packed = opaqueBounds(render(UnitType.Trebuchet, 'idle', 0, 'SW'))!;
    const ready = opaqueBounds(render(UnitType.Trebuchet, 'ready', 0, 'SW'))!;
    expect(ready.y1 - ready.y0).toBeGreaterThan(packed.y1 - packed.y0 + 6);
  });

  it('reflejar es simétrico y las direcciones de pantalla se reparten bien', () => {
    const r = render(UnitType.Archer, 'attack', 1, 'W');
    expect(mirror(mirror(r)).rgba).toEqual(r.rgba);
    expect(dirFromScreen(0, 1)).toBe('S');
    expect(dirFromScreen(-1, 0)).toBe('W');
    expect(dirFromScreen(1, 0)).toBe('E');
    expect(dirFromScreen(0, -1)).toBe('N');
    expect(dirFromScreen(-1, 1)).toBe('SW');
    expect(dirFromScreen(1, -1)).toBe('NE');
    expect(facingSign('SW')).toBe(-1);
    expect(facingSign('E')).toBe(1);
    expect(facingSign('N')).toBe(0);
  });
});

describe('animales', () => {
  it('llevan la cabeza delante del cuerpo (no metida en él)', () => {
    const U = UnitType;
    for (const [type, headMat] of [
      [U.Sheep, 'sheepFace'],
      [U.Wolf, 'wolf'],
      [U.Deer, 'deer'],
      [U.Boar, 'boar'],
    ] as const) {
      const prims = unitModel(type).pose('idle', 0);
      const zs = prims.filter((p) => p.mat === headMat).map((p) => p.center[2]);
      // La pieza más adelantada de su material (la cabeza) va por delante del centro.
      expect(Math.max(...zs), String(type)).toBeGreaterThan(3);
    }
  });

  it('se giran un poco de frente y de espaldas para que se les vea el costado', () => {
    const U = UnitType;
    expect(unitModel(U.Sheep).turn).toBeGreaterThan(0);
    expect(unitModel(U.Knight).turn).toBeGreaterThan(0);
    expect(unitModel(U.Villager).turn ?? 0).toBe(0);
  });
});

describe('formas redondeadas y líneas interiores', () => {
  const ramps = rampsFor(TEAM_COLORS[1]);
  const opts = { width: 24, height: 24, originX: 12, originY: 20, ramps, outline: false } as const;

  it('un elipsoide se ve redondo (menos píxeles que su caja) y sombreado con varios tonos', () => {
    const cube = rasterize([box([0, 6, 0], [10, 10, 10], 'linen')], 'S', opts);
    const ball = rasterize([ell([0, 6, 0], [10, 10, 10], 'linen')], 'S', opts);
    expect(opaque(ball)).toBeLessThan(opaque(cube) * 0.9);
    const colors = new Set<string>();
    for (let i = 0; i < ball.rgba.length; i += 4) if (ball.rgba[i + 3]) colors.add(`${ball.rgba[i]},${ball.rgba[i + 1]},${ball.rgba[i + 2]}`);
    expect(colors.size).toBeGreaterThanOrEqual(3);
  });

  it('una pieza que se estrecha ocupa menos que la recta', () => {
    const straight = rasterize([shaped(box([0, 6, 0], [6, 10, 6], 'linen'), 'cyl')], 'S', opts);
    const tapered = rasterize([shaped(box([0, 6, 0], [6, 10, 6], 'linen'), 'cyl', 0.5)], 'S', opts);
    expect(opaque(tapered)).toBeLessThan(opaque(straight));
  });

  it('la pieza de detrás se oscurece en el borde de la de delante, salvo si son del mismo grupo', () => {
    const back = box([0, 8, -3], [12, 12, 2], 'linen');
    const front = box([0, 6, 3], [4, 6, 2], 'linen');
    const sum = (r: { rgba: Uint8ClampedArray }) => r.rgba.reduce((s, v, i) => (i % 4 === 3 ? s : s + v), 0);
    const plain = rasterize([back, front], 'S', { ...opts, innerLines: false });
    const lined = rasterize([back, front], 'S', opts);
    const grouped = rasterize([{ ...back, group: 'g' }, { ...front, group: 'g' }], 'S', opts);
    expect(sum(lined)).toBeLessThan(sum(plain));
    expect(grouped.rgba).toEqual(plain.rgba);
  });
});

describe('aldeanos', () => {
  const draw = (anim: 'idle' | 'walk', look: number, job: Job) => {
    const m = unitModel(UnitType.Villager);
    return rasterize(m.pose(anim, 0, look, job), 'SW', { width: m.cell, height: m.cell, originX: m.originX, originY: m.originY, ramps: rampsFor(TEAM_COLORS[1]) });
  };

  it('tienen cuatro aspectos distintos (aldeanos y aldeanas)', () => {
    const m = unitModel(UnitType.Villager);
    expect(m.looks?.length).toBe(4);
    const keys = [0, 1, 2, 3].map((l) => draw('idle', l, Job.None).rgba.join(','));
    expect(new Set(keys).size).toBe(4);
  });

  it('cada oficio lleva su herramienta al andar y en reposo', () => {
    expect(unitModel(UnitType.Villager).jobs).toBe(true);
    const jobs = [Job.None, Job.Wood, Job.Mine, Job.Farm, Job.Forage, Job.Build];
    const keys = jobs.map((j) => draw('walk', 0, j).rgba.join(','));
    expect(new Set(keys).size).toBe(jobs.length);
    // Las demás unidades no cambian con el oficio.
    const militia = unitModel(UnitType.Militia);
    expect(militia.jobs ?? false).toBe(false);
  });
});

describe('retratos', () => {
  it('son tarjetas de 44×44: la gente a pie en plano medio (la figura llena la tarjeta) y la caballería entera', async () => {
    const { unitCard } = await import('../src/render/unit-art');
    const { ICON_SIZE, backdrop } = await import('../src/render/icon-card');
    const bg = backdrop('field').rgba;
    const cover = (type: UnitType) => {
      const c = unitCard(type, unitModel(type), TEAM_COLORS[1]);
      expect(c.width).toBe(ICON_SIZE);
      let n = 0;
      for (let i = 0; i < bg.length; i += 4) if (c.rgba[i] !== bg[i] || c.rgba[i + 1] !== bg[i + 1] || c.rgba[i + 2] !== bg[i + 2]) n++;
      return n / (ICON_SIZE * ICON_SIZE);
    };
    for (const t of [UnitType.Villager, UnitType.Militia, UnitType.Archer, UnitType.Monk]) expect(cover(t), String(t)).toBeGreaterThan(0.3);
    for (const t of [UnitType.Knight, UnitType.Trebuchet, UnitType.Sheep]) expect(cover(t), String(t)).toBeGreaterThan(0.08);
  });
});

describe('doble densidad', () => {
  it('a densidad 2 la figura mide el doble y apoya los pies en el mismo punto', async () => {
    const { drawUnitFrame, UNIT_DETAIL } = await import('../src/render/unit-art');
    expect(UNIT_DETAIL).toBe(2);
    for (const t of [UnitType.Villager, UnitType.Knight, UnitType.Sheep]) {
      const m = unitModel(t);
      const a = opaqueBounds(drawUnitFrame(m, TEAM_COLORS[1], 'idle', 'SW', 0, 0, 0, 1))!;
      const b = opaqueBounds(drawUnitFrame(m, TEAM_COLORS[1], 'idle', 'SW', 0, 0, 0, 2))!;
      const ha = a.y1 - a.y0 + 1;
      const hb = b.y1 - b.y0 + 1;
      // El contorno mide 1 px a las dos densidades: de ahí el margen.
      expect(hb, String(t)).toBeGreaterThanOrEqual(ha * 2 - 5);
      expect(hb, String(t)).toBeLessThanOrEqual(ha * 2 + 3);
      // Los pies, en el mismo punto a las dos densidades (en los animales largos, las patas de delante quedan algo
      // por debajo del origen por la perspectiva, a las dos).
      expect(Math.abs(b.y1 - m.originY * 2 - 2 * (a.y1 - m.originY)), String(t)).toBeLessThanOrEqual(3);
    }
  });
});
