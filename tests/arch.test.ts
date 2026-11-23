import { describe, expect, it } from 'vitest';
import { ICON_SIZE, backdrop } from '../src/render/icon-card';
import { BUILDING_DEFS, BUILDING_TYPE_COUNT, BuildingType } from '../src/data/buildings';
import { Builder } from '../src/render/arch/builder';
import { project, rasterizeIso } from '../src/render/arch/iso-raster';
import { NEUTRAL_RAMPS } from '../src/render/arch/materials';
import { BuildStage, WallLink, buildingModel } from '../src/render/arch/models';
import { buildingHeights, buildingIcon, renderBuilding, renderFlag, renderSails } from '../src/render/building-art';
import { diamondRowSpan } from '../src/render/iso';

const TEAM = ['#1e3a8a', '#3a5fcd', '#7a9cf0'] as const;
const opaque = (rgba: Uint8ClampedArray) => {
  let n = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] === 255) n++;
  return n;
};

describe('rasterizador isométrico', () => {
  it('la proyección es la 2:1 del juego', () => {
    expect(project([16, 0, 0])).toEqual([16, 8]);
    expect(project([0, 16, 0])).toEqual([-16, 8]);
    expect(project([0, 0, 10])).toEqual([0, -10]);
  });

  it('el suelo de una casilla pinta exactamente el rombo del terreno', () => {
    const b = new Builder();
    b.groundRect(0, 0, 16, 16, 'dirt');
    const r = rasterizeIso(b.faces, { width: 32, height: 16, originX: 16, originY: 0, ramps: NEUTRAL_RAMPS, shadows: false, outline: false });
    for (let y = 0; y < 16; y++) {
      const [a, c] = diamondRowSpan(y);
      for (let x = 0; x < 32; x++) {
        const inside = x - 16 >= a && x - 16 < c;
        expect(r.rgba[(y * 32 + x) * 4 + 3] === 255, `(${x}, ${y})`).toBe(inside);
      }
    }
  });

  it('una caja tiene la cara de arriba más clara que la izquierda, y esta que la derecha', () => {
    const b = new Builder();
    b.box(0, 0, 0, 16, 16, 12, 'stone');
    const r = rasterizeIso(b.faces, { width: 40, height: 40, originX: 20, originY: 14, ramps: NEUTRAL_RAMPS, shadows: false });
    const tone = (x: number, y: number) => r.tone[y * 40 + x];
    expect(tone(20, 10)).toBe(3); // arriba
    expect(tone(12, 20)).toBe(2); // izquierda, a media altura
    expect(tone(28, 20)).toBe(1); // derecha
  });

  it('arroja sombra semitransparente hacia la derecha', () => {
    const b = new Builder();
    b.box(4, 4, 0, 12, 12, 24, 'stone');
    const r = rasterizeIso(b.faces, { width: 64, height: 56, originX: 24, originY: 30, ramps: NEUTRAL_RAMPS });
    let shadowRight = 0;
    let shadowLeft = 0;
    for (let y = 0; y < 56; y++) {
      for (let x = 0; x < 64; x++) {
        const a = r.rgba[(y * 64 + x) * 4 + 3];
        if (a > 0 && a < 255) (x > 24 ? shadowRight++ : shadowLeft++);
      }
    }
    expect(shadowRight).toBeGreaterThan(20);
    expect(shadowLeft).toBe(0);
  });
});

describe('modelos de edificios', () => {
  const stages = [BuildStage.Foundation, BuildStage.Frame, BuildStage.Walls, BuildStage.Complete, BuildStage.Damaged, BuildStage.Ruins] as const;

  it('todos los tipos se pintan en todas las eras, arquitecturas y fases', () => {
    for (let t = 0; t < BUILDING_TYPE_COUNT; t++) {
      for (let era = 0; era < 4; era++) {
        for (const arch of ['mudejar', 'gothic', 'catalan', 'french', 'nasrid', 'portuguese', 'scottish'] as const) {
          for (const stage of stages) {
            const img = renderBuilding(t as BuildingType, era, arch, stage, TEAM);
            const n = BUILDING_DEFS[t as BuildingType].size;
            expect(img.width, `${t}/${era}/${arch}/${stage}`).toBeGreaterThanOrEqual(32 * n);
            expect(img.height).toBeLessThan(260);
            expect(opaque(img.rgba)).toBeGreaterThan(0);
          }
        }
      }
    }
  }, 60_000);

  it('el lienzo cubre la huella y el origen cae en su vértice de arriba', () => {
    for (let t = 0; t < BUILDING_TYPE_COUNT; t++) {
      const img = renderBuilding(t as BuildingType, 2, 'gothic', BuildStage.Complete, TEAM);
      const n = BUILDING_DEFS[t as BuildingType].size;
      expect(img.originX).toBeGreaterThanOrEqual(16 * n);
      expect(img.width - img.originX).toBeGreaterThanOrEqual(16 * n);
      expect(img.height - img.originY).toBeGreaterThanOrEqual(16 * n);
    }
  });

  it('las dos arquitecturas se distinguen y cada era cambia el centro de la villa y las casas', () => {
    for (const t of [BuildingType.TownCenter, BuildingType.House]) {
      const g = renderBuilding(t, 2, 'gothic', BuildStage.Complete, TEAM).rgba;
      const m = renderBuilding(t, 2, 'mudejar', BuildStage.Complete, TEAM).rgba;
      expect(g).not.toEqual(m);
      for (const arch of ['gothic', 'mudejar'] as const) {
        const eras = [0, 1, 2, 3].map((era) => renderBuilding(t, era, arch, BuildStage.Complete, TEAM).rgba.join(','));
        expect(new Set(eras).size, `${t} ${arch}`).toBe(4);
      }
    }
  });

  it('es determinista', () => {
    const a = renderBuilding(BuildingType.Castle, 3, 'mudejar', BuildStage.Damaged, TEAM);
    const b = renderBuilding(BuildingType.Castle, 3, 'mudejar', BuildStage.Damaged, TEAM);
    expect(a.rgba).toEqual(b.rgba);
  });

  it('la obra sube por fases y el edificio dañado no es el entero', () => {
    for (const t of [BuildingType.House, BuildingType.Barracks, BuildingType.Castle]) {
      const f = buildingModel(t, 2, 'gothic', BuildStage.Foundation);
      const fr = buildingModel(t, 2, 'gothic', BuildStage.Frame);
      const w = buildingModel(t, 2, 'gothic', BuildStage.Walls);
      const c = buildingModel(t, 2, 'gothic', BuildStage.Complete);
      expect(f.top).toBeLessThanOrEqual(6);
      expect(fr.top).toBeLessThan(c.top);
      expect(w.top).toBeLessThan(c.top);
      const done = renderBuilding(t, 2, 'gothic', BuildStage.Complete, TEAM).rgba;
      const hurt = renderBuilding(t, 2, 'gothic', BuildStage.Damaged, TEAM).rgba;
      expect(hurt).not.toEqual(done);
    }
  });

  it('los muros enlazan con sus vecinos', () => {
    const lone = renderBuilding(BuildingType.StoneWall, 2, 'gothic', BuildStage.Complete, TEAM, 0);
    const line = renderBuilding(BuildingType.StoneWall, 2, 'gothic', BuildStage.Complete, TEAM, WallLink.North | WallLink.South);
    expect(opaque(line.rgba)).toBeGreaterThan(opaque(lone.rgba));
  });

  it('las alturas sirven para la barra de vida y la zona de clic', () => {
    for (let t = 0; t < BUILDING_TYPE_COUNT; t++) {
      if (t === BuildingType.Farm) continue;
      const h = buildingHeights(t as BuildingType, 2, 'gothic');
      expect(h.top, String(t)).toBeGreaterThan(5);
      expect(h.top).toBeGreaterThanOrEqual(h.eave);
    }
  });

  it('los iconos son tarjetas de 44×44 con el edificio ocupando buena parte, y todos distintos', () => {
    const bg = backdrop('field', 30).rgba;
    const seen = new Set<string>();
    for (let t = 0; t < BUILDING_TYPE_COUNT; t++) {
      const icon = buildingIcon(t as BuildingType, 1, 'mudejar', TEAM);
      expect(icon.width, String(t)).toBe(ICON_SIZE);
      expect(icon.height, String(t)).toBe(ICON_SIZE);
      let changed = 0;
      for (let i = 0; i < bg.length; i += 4) if (icon.rgba[i] !== bg[i] || icon.rgba[i + 1] !== bg[i + 1] || icon.rgba[i + 2] !== bg[i + 2]) changed++;
      expect(changed, String(t)).toBeGreaterThan(ICON_SIZE * ICON_SIZE * 0.15);
      seen.add(icon.rgba.join(','));
    }
    expect(seen.size).toBe(BUILDING_TYPE_COUNT);
  });
});

describe('vida de los edificios', () => {
  it('el modelo animado deja como emisores el humo, las banderas y las aspas', () => {
    const kinds = (t: BuildingType, era = 2, arch: 'gothic' | 'mudejar' = 'gothic') => buildingModel(t, era, arch, BuildStage.Complete, 0, true).emitters.map((e) => e.kind);
    expect(kinds(BuildingType.Mill)).toContain('sails');
    expect(kinds(BuildingType.Blacksmith)).toContain('smoke');
    expect(kinds(BuildingType.Foundry)).toContain('smoke');
    expect(kinds(BuildingType.TownCenter)).toContain('flag');
    // Sin animar (iconos), las aspas y las banderas van pintadas y no hay emisores de ellas.
    expect(buildingModel(BuildingType.Mill, 2, 'gothic', BuildStage.Complete).emitters).toEqual([]);
    // En obra no hay humo ni banderas.
    expect(buildingModel(BuildingType.Blacksmith, 2, 'gothic', BuildStage.Walls, 0, true).emitters).toEqual([]);
  });

  it('las aspas giran y las banderas ondean (4 fotogramas distintos)', () => {
    const sails = renderSails(TEAM);
    expect(new Set(sails.frames.map((f) => f.join(','))).size).toBe(4);
    const flag = renderFlag(TEAM, 6, 4);
    expect(new Set(flag.frames.map((f) => f.join(','))).size).toBe(4);
  });

  it('los emisores y los puntos de fuego caen dentro del lienzo', () => {
    for (const t of [BuildingType.Mill, BuildingType.Blacksmith, BuildingType.TownCenter, BuildingType.Castle]) {
      const img = renderBuilding(t, 3, 'mudejar', BuildStage.Damaged, TEAM);
      expect(img.firePoints.length).toBe(3);
      for (const [x, y] of [...img.firePoints, ...img.emitters.map((e) => [e.x, e.y] as const)]) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(img.width);
        expect(y).toBeLessThan(img.height);
      }
    }
  });
});
