import { BuildingType } from '../data/buildings';
import { UnitType } from '../data/units';
import { GameMap } from '../map/game-map';
import { Terrain } from '../map/terrain';
import { BuildStage } from '../render/arch/models';
import { renderBuilding } from '../render/building-art';
import { renderTree } from '../render/nature-art';
import { TEAM_COLORS } from '../render/palette';
import { unitModel } from '../render/rig/catalog';
import { mirror } from '../render/rig/raster';
import { drawUnitFrame } from '../render/unit-art';
import { TerrainPainter } from '../render/terrain-art';

/**
 * Ilustración de la pantalla de título, pintada con el arte del propio juego: una villa a orillas de un lago
 * con su castillo, la catedral en obras de piedra ya terminada, casas, un molino con sus campos, bosque y
 * algunos vecinos. Se pinta a la medida de la ventana (en unos 100–200 ms) y el menú la escala a un múltiplo
 * entero. Las orillas se oscurecen con un tramado, como la niebla de la partida.
 */

/** Tamaño de referencia de la ilustración (16:9); se pinta a la medida de la ventana. */
export const TITLE_W = 320;
export const TITLE_H = 180;

/** Mapa de la escena: 44×44 casillas centradas en la (22, 22). */
const SIZE = 44;
const C = SIZE / 2;
/** La villa va a la derecha del centro: a la izquierda queda el prado con el bosque, detrás del título. */
const VX = 10;
const VY = 6;

interface Sprite {
  readonly depth: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly rgba: Uint8ClampedArray;
}

/** Ruido fijo de 0 a 1 por casilla. */
function noise(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function sceneMap(trees: readonly [number, number][]): GameMap {
  const map = new GameMap(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      // Lago a la derecha de la villa, con su orilla de arena.
      const d = Math.hypot((x - (19.5 + VX)) / 3.6, (y - (7.5 + VY)) / 3);
      if (d < 0.7) map.terrain[map.index(x, y)] = Terrain.Deep;
      else if (d < 1.15) map.terrain[map.index(x, y)] = Terrain.Shallow;
      else if (d < 1.45) map.terrain[map.index(x, y)] = Terrain.Sand;
    }
  }
  // Tierra pisada alrededor del castillo y camino hasta las casas.
  for (let y = 11; y < 18; y++) for (let x = 7; x < 13; x++) if (Math.hypot(x - 9.5, y - 13.5) < 3.2) map.terrain[map.index(x + VX, y + VY)] = Terrain.Dirt;
  for (let i = 0; i < 6; i++) map.terrain[map.index(12 + i + VX, 15 + (i >> 1) + VY)] = Terrain.Dirt;
  for (const [x, y] of trees) map.trees[map.index(x, y)] = 1;
  return map;
}

/** Árboles: el bosque de la izquierda y arriba, y algunos sueltos junto a la villa. */
function forest(): [number, number][] {
  const out: [number, number][] = [];
  const village = (x: number, y: number) => Math.hypot(x - (13 + VX), y - (13 + VY)) < 9.5;
  const lake = (x: number, y: number) => Math.hypot((x - (19.5 + VX)) / 3.6, (y - (7.5 + VY)) / 3) < 1.6;
  for (let y = 1; y < SIZE - 1; y++) {
    for (let x = 1; x < SIZE - 1; x++) {
      if (village(x, y) || lake(x, y)) continue;
      // Más espeso cuanto más a la izquierda (x − y bajo) y en los bordes de arriba y abajo.
      const left = (y - x - 2) / 10;
      const edge = Math.abs(x + y - 2 * C) / 18 - 0.55;
      const p = Math.max(left, edge) + (noise(x, y) - 0.5) * 0.5;
      if (p > 0.15 && noise(y, x) < 0.72) out.push([x, y]);
    }
  }
  return out;
}

/**
 * Pinta la escena a `w`×`h` píxeles de arte (en el navegador: usa lienzos). Una ventana más ancha o más alta
 * muestra más alrededor; si es estrecha, la imagen se centra en la villa.
 */
export function renderTitleArt(w = TITLE_W, h = TITLE_H): HTMLCanvasElement {
  const trees = forest();
  const map = sceneMap(trees);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Mundo → lienzo. En pantallas anchas, la casilla (C, C) en el centro (algo más abajo, para dejar aire al
  // título, que va a la izquierda sobre el prado). En las estrechas o verticales el título va abajo: la villa
  // se pone en el tercio de arriba.
  const narrow = w / h < 1.25;
  const villageX = (VX - VY) * 16 + 16;
  const villageY = (26 + VX + VY) * 8;
  const ox = Math.round(narrow ? w / 2 - villageX : w / 2);
  const oy = Math.round(narrow ? h * 0.34 - villageY : h / 2 - SIZE * 8 - 10);
  const ground = new TerrainPainter(map).paint(-ox, -oy, w, h, () => true);
  ctx.fillStyle = '#0c0806';
  ctx.fillRect(0, 0, w, h);
  const g = document.createElement('canvas');
  g.width = w;
  g.height = h;
  g.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(ground), w, h), 0, 0);
  ctx.drawImage(g, 0, 0);

  const sprites: Sprite[] = [];
  const team = TEAM_COLORS[1];
  const at = (tx: number, ty: number) => ({ x: (tx - ty) * 16 + ox, y: (tx + ty) * 8 + oy });
  const building = (type: BuildingType, tx: number, ty: number, n: number, era = 3) => {
    const img = renderBuilding(type, era, 'gothic', BuildStage.Complete, team);
    const p = at(tx + VX, ty + VY);
    sprites.push({ depth: tx + ty + VX + VY + n, x: p.x - img.originX, y: p.y - img.originY, w: img.width, h: img.height, rgba: img.rgba });
  };
  const tree = (tx: number, ty: number, i: number) => {
    const img = renderTree(i % 3 === 0 ? 'pine' : 'oak', i % 4, 'standing');
    const p = at(tx, ty);
    sprites.push({ depth: tx + ty + 1, x: p.x - img.anchorX, y: p.y + 8 - img.anchorY, w: img.width, h: img.height, rgba: img.rgba });
  };
  const unit = (type: UnitType, tx: number, ty: number, dir: 'S' | 'SW' | 'W' | 'SE' | 'E', anim: 'idle' | 'walk' | 'farm' = 'idle', f = 0, look = 0, player = 1) => {
    const m = unitModel(type);
    const flip = dir === 'SE' || dir === 'E';
    const drawn = dir === 'SE' ? 'SW' : dir === 'E' ? 'W' : dir;
    let r = drawUnitFrame(m, TEAM_COLORS[player], anim, drawn, f, look);
    if (flip) r = mirror(r);
    const p = at(tx + VX, ty + VY);
    sprites.push({ depth: tx + ty + VX + VY + 0.5, x: Math.round(p.x - m.originX), y: Math.round(p.y - m.originY), w: r.width, h: r.height, rgba: r.rgba });
  };

  building(BuildingType.Cathedral, 12, 7, 5);
  building(BuildingType.Castle, 7, 11, 4);
  building(BuildingType.House, 12, 15, 2, 2);
  building(BuildingType.House, 15, 16, 2, 2);
  building(BuildingType.House, 10, 17, 2, 2);
  building(BuildingType.Mill, 18, 12, 2, 2);
  building(BuildingType.Farm, 18, 15, 3, 2);
  building(BuildingType.Farm, 21, 13, 3, 2);
  building(BuildingType.Market, 14, 11, 4, 2);
  trees.forEach(([x, y], i) => tree(x, y, i));
  unit(UnitType.Knight, 12.2, 13.6, 'SW', 'idle');
  unit(UnitType.Villager, 19.2, 16.3, 'SW', 'farm', 1, 1);
  unit(UnitType.Villager, 20, 15.6, 'SE', 'farm', 2, 0);
  unit(UnitType.Villager, 14.6, 15, 'SE', 'walk', 1, 3);
  unit(UnitType.Villager, 11.8, 16.6, 'SW', 'walk', 4, 2);
  unit(UnitType.Spearman, 10.5, 15.2, 'S');
  unit(UnitType.Spearman, 11.2, 14.9, 'S');
  for (const [x, y, d] of [
    [8.6, 18.3, 'W'],
    [9.3, 18.7, 'SW'],
    [8.2, 19.1, 'SE'],
  ] as const)
    unit(UnitType.Sheep, x, y, d, 'idle', 0, 0, 0);

  sprites.sort((a, b) => a.depth - b.depth);
  const tmp = document.createElement('canvas');
  const tctx = tmp.getContext('2d');
  if (!tctx) return canvas;
  for (const s of sprites) {
    if (s.x > w || s.y > h || s.x + s.w < 0 || s.y + s.h < 0) continue;
    tmp.width = s.w;
    tmp.height = s.h;
    tctx.putImageData(new ImageData(new Uint8ClampedArray(s.rgba), s.w, s.h), 0, 0);
    ctx.drawImage(tmp, Math.round(s.x), Math.round(s.y));
  }

  vignette(ctx, w, h);
  return canvas;
}

/** Oscurece las orillas con un tramado de Bayer, como la niebla de guerra. */
function vignette(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x + 0.5 - w / 2) / (w / 2);
      const ny = (y + 0.5 - h / 2) / (h / 2);
      const r = Math.hypot(nx * 0.9, ny);
      const t = Math.max(0, Math.min(1, (r - 0.62) / 0.5));
      const level = t * 3 + (bayer[(y & 3) * 4 + (x & 3)] / 16 - 0.5);
      const k = level >= 2.5 ? 0.25 : level >= 1.5 ? 0.5 : level >= 0.5 ? 0.75 : 1;
      if (k === 1) continue;
      const i = (y * w + x) * 4;
      d[i] = 12 + (d[i] - 12) * k;
      d[i + 1] = 8 + (d[i + 1] - 8) * k;
      d[i + 2] = 6 + (d[i + 2] - 6) * k;
    }
  }
  ctx.putImageData(img, 0, 0);
}
