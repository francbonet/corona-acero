import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/data/buildings';
import { NodeType } from '../src/data/nodes';
import { GameClient } from '../src/game/client';
import { Selection } from '../src/game/selection';
import { GameMap } from '../src/map/game-map';
import { Terrain } from '../src/map/terrain';
import { TREE_VARIANT_COUNT, renderBush, renderDeposit, renderResourceIcon, renderTree } from '../src/render/nature-art';
import { TerrainPainter } from '../src/render/terrain-art';
import { createBuilding, createNode } from '../src/sim/world';
import { economyWorld, villagerAt } from './helpers/world';

const opaque = (rgba: Uint8ClampedArray) => {
  let n = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] === 255) n++;
  return n;
};

/** Mapa de 12×12: hierba con un lago en medio. */
function lakeMap(): GameMap {
  const m = new GameMap(12, 12);
  for (let y = 3; y < 9; y++) for (let x = 3; x < 9; x++) m.terrain[m.index(x, y)] = x > 4 && x < 7 && y > 4 && y < 7 ? Terrain.Deep : Terrain.Shallow;
  for (let x = 0; x < 12; x++) m.terrain[m.index(x, 11)] = Terrain.Sand;
  return m;
}

describe('terreno', () => {
  it('los trozos encajan: cada píxel del mapa se pinta una vez y solo una', () => {
    const map = lakeMap();
    const p = new TerrainPainter(map);
    // Mitades del mapa por casillas: x < 6 y x ≥ 6, sobre el mismo rectángulo de mundo.
    const box = { x: -12 * 16, y: 0, w: 24 * 16, h: 24 * 8 };
    const a = p.paint(box.x, box.y, box.w, box.h, (x) => x < 6);
    const b = p.paint(box.x, box.y, box.w, box.h, (x) => x >= 6);
    const all = p.paint(box.x, box.y, box.w, box.h, () => true);
    for (let i = 3; i < all.length; i += 4) {
      const na = a[i] === 255 ? 1 : 0;
      const nb = b[i] === 255 ? 1 : 0;
      expect(na + nb).toBe(all[i] === 255 ? 1 : 0);
    }
    // El mapa entero: 12×12 casillas de 32×16 píxeles de media.
    expect(opaque(all)).toBe(12 * 12 * 256);
  });

  it('es determinista y las orillas llevan espuma', () => {
    const map = lakeMap();
    const a = new TerrainPainter(map).paint(-192, 0, 384, 192, () => true);
    const b = new TerrainPainter(map).paint(-192, 0, 384, 192, () => true);
    expect(a).toEqual(b);
    let foam = 0;
    for (let i = 0; i < a.length; i += 4) if (a[i] === 0xd6 && a[i + 1] === 0xe6 && a[i + 2] === 0xf0) foam++;
    expect(foam).toBeGreaterThan(40);
  });

  it('el suelo de bosque es más oscuro que la hierba de alrededor', () => {
    const map = new GameMap(12, 12);
    for (let y = 2; y < 8; y++) for (let x = 2; x < 8; x++) map.trees[map.index(x, y)] = 1;
    const p = new TerrainPainter(map);
    const lum = (tx: number, ty: number) => {
      const px = p.paint((tx - ty) * 16 - 4, (tx + ty) * 8 + 4, 8, 8, () => true);
      let s = 0;
      for (let i = 0; i < px.length; i += 4) s += px[i] + px[i + 1] + px[i + 2];
      return s;
    };
    expect(lum(5, 5)).toBeLessThan(lum(10, 10) * 0.85);
  });

  it('las ondas solo van en agua abierta, no en la orilla ni en tierra', () => {
    const p = new TerrainPainter(lakeMap());
    const px = (tx: number, ty: number) => [(tx - ty) * 16, (tx + ty) * 8] as const;
    expect(p.isOpenWater(...px(6, 6))).toBe(true);
    expect(p.isOpenWater(...px(1, 1))).toBe(false);
    expect(p.isOpenWater(...px(3, 6))).toBe(false); // borde del lago
    expect(p.hasWater()).toBe(true);
    expect(new TerrainPainter(new GameMap(6, 6)).hasWater()).toBe(false);
  });

  it('el agua profunda es más oscura que la somera', () => {
    const map = lakeMap();
    const p = new TerrainPainter(map);
    const lum = (tx: number, ty: number) => {
      // Centro de la casilla en píxeles de mundo.
      const wx = (tx - ty) * 16;
      const wy = (tx + ty) * 8 + 8;
      const px = p.paint(wx - 2, wy - 2, 4, 4, () => true);
      let s = 0;
      for (let i = 0; i < px.length; i += 4) s += px[i] + px[i + 1] + px[i + 2];
      return s;
    };
    expect(lum(5.5, 5.5)).toBeLessThan(lum(3.5, 3.5));
  });
});

describe('recursos', () => {
  it('cada especie de árbol tiene sus variantes distintas y se ve talado y en tocón', () => {
    for (const sp of ['oak', 'pine', 'olive'] as const) {
      const v = Array.from({ length: TREE_VARIANT_COUNT }, (_, i) => renderTree(sp, i, 'standing').rgba.join(','));
      expect(new Set(v).size).toBe(TREE_VARIANT_COUNT);
      const standing = opaque(renderTree(sp, 0, 'standing').rgba);
      const felled = opaque(renderTree(sp, 0, 'felled').rgba);
      const stump = opaque(renderTree(sp, 0, 'stump').rgba);
      expect(felled).toBeLessThan(standing);
      expect(stump).toBeLessThan(felled);
    }
  });

  it('las minas y las bayas menguan al agotarse', () => {
    for (const kind of ['gold', 'stone'] as const) {
      expect(opaque(renderDeposit(kind, 0.2).rgba)).toBeLessThan(opaque(renderDeposit(kind, 0.5).rgba));
      expect(opaque(renderDeposit(kind, 0.5).rgba)).toBeLessThan(opaque(renderDeposit(kind, 1).rgba));
    }
    const red = (rgba: Uint8ClampedArray) => {
      let n = 0;
      for (let i = 0; i < rgba.length; i += 4) if (rgba[i + 3] === 255 && rgba[i] > 150 && rgba[i + 1] < 110) n++;
      return n;
    };
    expect(red(renderBush(0.1).rgba)).toBeLessThan(red(renderBush(1).rgba));
  });
});

describe('iconos de recursos', () => {
  it('cinco iconos de 16×16 distintos; el de población lleva el color del equipo', () => {
    const kinds = ['food', 'wood', 'stone', 'gold', 'pop'] as const;
    const imgs = kinds.map((k) => renderResourceIcon(k));
    for (const img of imgs) {
      expect(img.width).toBe(16);
      expect(img.height).toBe(16);
      expect(opaque(img.rgba)).toBeGreaterThan(60);
    }
    expect(new Set(imgs.map((i) => i.rgba.join(','))).size).toBe(5);
    expect(renderResourceIcon('pop', ['#7a1f1f', '#c0392b', '#e8735f']).rgba).not.toEqual(renderResourceIcon('pop').rgba);
  });
});

describe('cursor según lo que hay debajo', () => {
  it('hacha, pico, hoz, martillo y espada para los aldeanos; mano sin selección', () => {
    const { sim } = economyWorld({ trees: [[12, 12]], gold: [[14, 14]], berries: [[16, 16]] });
    const selection = new Selection();
    const client = new GameClient(sim, selection, 1, (c) => sim.schedule(c));
    const v = villagerAt(sim, 10, 10);
    const enemy = villagerAt(sim, 18, 18, 2);
    const tree = sim.grid.occupantAt(12, 12);
    const gold = sim.grid.occupantAt(14, 14);
    const berries = sim.grid.occupantAt(16, 16);
    const site = createBuilding(sim, BuildingType.House, 1, 6, 14, false);
    const t = (id: number, kind: 'unit' | 'node' | 'building') => ({ id, kind, x: 0, y: 0, halfW: 1, height: 1 }) as const;
    expect(client.cursorFor(t(tree, 'node'))).toBe('hand');
    selection.add([v]);
    expect(client.cursorFor(t(tree, 'node'))).toBe('axe');
    expect(client.cursorFor(t(gold, 'node'))).toBe('pick');
    expect(client.cursorFor(t(berries, 'node'))).toBe('sickle');
    expect(client.cursorFor(t(site, 'building'))).toBe('hammer');
    expect(client.cursorFor(t(enemy, 'unit'))).toBe('sword');
    expect(client.cursorFor(null)).toBe('hand');
    // Un ciervo se caza: hoz, no espada.
    const deer = createNode(sim, NodeType.Carcass, 20, 20);
    expect(client.cursorFor(t(deer, 'node'))).toBe('sickle');
  });
});
