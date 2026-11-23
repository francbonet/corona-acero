import { BUILDING_DEFS, type BuildingType } from '../data/buildings';
import { NodeType } from '../data/nodes';
import { FP_ONE } from '../engine/fixed';
import { Terrain } from '../map/terrain';
import type { Camera } from '../render/camera';
import { TEAM_COLORS } from '../render/palette';
import { worldToTileFloor } from '../render/iso';
import { Comp } from '../sim/entities';
import type { Simulation } from '../sim/simulation';

const TERRAIN_RGB: Readonly<Record<number, [number, number, number]>> = {
  [Terrain.Grass]: [62, 122, 53],
  [Terrain.Dirt]: [122, 82, 50],
  [Terrain.Sand]: [212, 188, 132],
  [Terrain.Shallow]: [63, 116, 168],
  [Terrain.Deep]: [34, 57, 107],
  [Terrain.Ford]: [132, 168, 170],
};
const TREE_RGB: [number, number, number] = [31, 61, 29];
const GOLD_RGB: [number, number, number] = [227, 178, 60];
const STONE_RGB: [number, number, number] = [176, 168, 152];
const BERRY_RGB: [number, number, number] = [200, 74, 90];

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export interface MinimapOptions {
  sim: Simulation;
  player: number;
  camera: Camera;
  viewport: () => { width: number; height: number };
  /** Clic derecho en el minimapa: orden de mover a ese punto (punto fijo). */
  onRightClick: (x: number, y: number) => void;
}

/**
 * Minimapa isométrico: la misma proyección que el mundo, a 1/16 de escala (cada casilla son 2×1 píxeles).
 * Se pinta en un <canvas> del HUD unas pocas veces por segundo.
 */
export class Minimap {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private image: ImageData | null = null;
  /** Casilla que cae en cada píxel del minimapa (-1 = fuera del mapa). */
  private readonly pixelTile: Int32Array;
  readonly width: number;
  readonly height: number;
  private readonly offsetX: number;

  constructor(private readonly o: MinimapOptions) {
    const g = o.sim.grid;
    this.width = g.width + g.height;
    this.height = Math.ceil((g.width + g.height) / 2);
    this.offsetX = g.height;
    this.pixelTile = new Int32Array(this.width * this.height);
    for (let v = 0; v < this.height; v++) {
      for (let u = 0; u < this.width; u++) {
        const t = worldToTileFloor((u + 0.5 - this.offsetX) * 16, (v + 0.5) * 16);
        this.pixelTile[v * this.width + u] = g.inBounds(t.x, t.y) ? t.y * g.width + t.x : -1;
      }
    }
  }

  /** Engancha el <canvas> (lo busca de nuevo si el HUD lo ha recreado). */
  private attach(): boolean {
    const el = document.getElementById('minimap');
    if (!(el instanceof HTMLCanvasElement)) return false;
    if (el === this.canvas) return true;
    this.canvas = el;
    el.width = this.width;
    el.height = this.height;
    this.ctx = el.getContext('2d');
    this.image = this.ctx?.createImageData(this.width, this.height) ?? null;
    const toFixed = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const u = ((ev.clientX - r.left) / r.width) * this.width;
      const v = ((ev.clientY - r.top) / r.height) * this.height;
      return { wx: (u - this.offsetX) * 16, wy: v * 16 };
    };
    const centerOn = (ev: PointerEvent) => {
      const { wx, wy } = toFixed(ev);
      this.o.camera.centerOn(wx, wy);
    };
    el.addEventListener('pointerdown', (ev) => {
      if (ev.button === 0) {
        centerOn(ev);
        el.setPointerCapture(ev.pointerId);
      } else if (ev.button === 2) {
        const { wx, wy } = toFixed(ev);
        const t = { x: wy / 16 + wx / 32, y: wy / 16 - wx / 32 };
        this.o.onRightClick(Math.floor(t.x * FP_ONE), Math.floor(t.y * FP_ONE));
      }
    });
    el.addEventListener('pointermove', (ev) => {
      if (el.hasPointerCapture(ev.pointerId)) centerOn(ev);
    });
    el.addEventListener('contextmenu', (ev) => ev.preventDefault());
    return true;
  }

  /** `revealAll` ignora la niebla (depuración). */
  draw(revealAll: boolean): void {
    if (!this.attach() || !this.ctx || !this.image) return;
    const sim = this.o.sim;
    const g = sim.grid;
    const e = sim.entities;
    const P = this.o.player;
    const { visible, explored } = sim.visibility.layers(P);
    const data = this.image.data;

    // Terreno con árboles y yacimientos, oscurecido por la niebla.
    for (let i = 0; i < this.pixelTile.length; i++) {
      const tile = this.pixelTile[i];
      const o = i * 4;
      if (tile < 0) {
        data[o + 3] = 0;
        continue;
      }
      if (!revealAll && !explored[tile]) {
        data[o] = 12;
        data[o + 1] = 8;
        data[o + 2] = 6;
        data[o + 3] = 255;
        continue;
      }
      let rgb = TERRAIN_RGB[sim.map.terrain[tile]] ?? TERRAIN_RGB[Terrain.Grass];
      const occ = g.occupant[tile];
      if (occ && e.has(occ, Comp.Resource) && !e.has(occ, Comp.Building)) {
        const nt = e.nodeType[occ];
        rgb = nt === NodeType.Tree ? TREE_RGB : nt === NodeType.Gold ? GOLD_RGB : nt === NodeType.Stone ? STONE_RGB : nt === NodeType.Berries ? BERRY_RGB : rgb;
      }
      const dim = revealAll || visible[tile] ? 1 : 0.55;
      data[o] = rgb[0] * dim;
      data[o + 1] = rgb[1] * dim;
      data[o + 2] = rgb[2] * dim;
      data[o + 3] = 255;
    }

    // Edificios (si se han explorado) y unidades (si se ven), con el color de su jugador.
    const put = (u: number, v: number, rgb: [number, number, number]) => {
      if (u < 0 || v < 0 || u >= this.width || v >= this.height) return;
      const o = (v * this.width + u) * 4;
      data[o] = rgb[0];
      data[o + 1] = rgb[1];
      data[o + 2] = rgb[2];
      data[o + 3] = 255;
    };
    for (const b of sim.buildingIds) {
      if (!e.isAlive(b)) continue;
      const s = e.size[b];
      const cx = e.tileX[b] + (s >> 1);
      const cy = e.tileY[b] + (s >> 1);
      if (!revealAll && e.owner[b] !== P && !explored[cy * g.width + cx]) continue;
      const rgb = hexToRgb(TEAM_COLORS[Math.min(e.owner[b], TEAM_COLORS.length - 1)][1]);
      const n = BUILDING_DEFS[e.buildingType[b] as BuildingType].size;
      for (let ty = e.tileY[b]; ty < e.tileY[b] + n; ty++) {
        for (let tx = e.tileX[b]; tx < e.tileX[b] + n; tx++) {
          const u = tx - ty + this.offsetX;
          const v = (tx + ty) >> 1;
          put(u, v, rgb);
          put(u + 1, v, rgb);
        }
      }
    }
    for (const id of sim.unitIds) {
      if (!e.has(id, Comp.Position)) continue;
      const tx = e.x[id] / FP_ONE;
      const ty = e.y[id] / FP_ONE;
      const tile = Math.floor(ty) * g.width + Math.floor(tx);
      if (!revealAll && e.owner[id] !== P && !visible[tile]) continue;
      const rgb = e.owner[id] === 0 ? ([220, 220, 210] as [number, number, number]) : hexToRgb(TEAM_COLORS[Math.min(e.owner[id], TEAM_COLORS.length - 1)][2]);
      const u = Math.floor(tx - ty + this.offsetX);
      const v = Math.floor((tx + ty) / 2);
      put(u, v, rgb);
      put(u + 1, v, rgb);
    }
    this.ctx.putImageData(this.image, 0, 0);

    // Recuadro de lo que se ve en pantalla.
    const { width, height } = this.o.viewport();
    const a = this.o.camera.screenToWorld(0, 0, width, height);
    const b = this.o.camera.screenToWorld(width, height, width, height);
    this.ctx.strokeStyle = '#ece6d6';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(Math.round(a.x / 16 + this.offsetX) + 0.5, Math.round(a.y / 16) + 0.5, Math.round((b.x - a.x) / 16), Math.round((b.y - a.y) / 16));
  }
}
