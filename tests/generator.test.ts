import { describe, expect, it } from 'vitest';
import { START_CLEAR_RADIUS, generateTestMap } from '../src/map/generator';
import { TERRAIN_COUNT, Terrain, TreeKind } from '../src/map/terrain';

describe('generateTestMap', () => {
  it('es determinista: la misma semilla da el mismo mapa', () => {
    const a = generateTestMap({ width: 64, height: 64, seed: 'prueba' });
    const b = generateTestMap({ width: 64, height: 64, seed: 'prueba' });
    expect(a.terrain).toEqual(b.terrain);
    expect(a.trees).toEqual(b.trees);
  });

  it('semillas distintas dan mapas distintos', () => {
    const a = generateTestMap({ width: 64, height: 64, seed: 'uno' });
    const b = generateTestMap({ width: 64, height: 64, seed: 'dos' });
    expect(a.terrain).not.toEqual(b.terrain);
  });

  it('solo contiene terrenos y árboles válidos, y nunca árboles en el agua', () => {
    const map = generateTestMap({ width: 48, height: 40, seed: 7 });
    expect(map.terrain.length).toBe(48 * 40);
    for (let i = 0; i < map.terrain.length; i++) {
      const t = map.terrain[i] ?? -1;
      const tree = map.trees[i] ?? -1;
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(TERRAIN_COUNT);
      expect(tree).toBeGreaterThanOrEqual(TreeKind.None);
      expect(tree).toBeLessThanOrEqual(TreeKind.Olive);
      if (tree !== TreeKind.None) expect([Terrain.Grass, Terrain.Dirt]).toContain(t);
    }
  });

  it('deja despejado el centro (posición inicial)', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const map = generateTestMap({ width: 64, height: 64, seed });
      const c = 32;
      for (let y = c - START_CLEAR_RADIUS; y <= c + START_CLEAR_RADIUS; y++) {
        for (let x = c - START_CLEAR_RADIUS; x <= c + START_CLEAR_RADIUS; x++) {
          if (Math.hypot(x - c, y - c) > START_CLEAR_RADIUS) continue;
          expect(map.terrainAt(x, y)).toBe(Terrain.Grass);
          expect(map.treeAt(x, y)).toBe(TreeKind.None);
        }
      }
    }
  });
});
