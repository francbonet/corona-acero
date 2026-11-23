import { Container, Sprite, Texture } from 'pixi.js';
import type { GameMap } from '../map/game-map';
import { type Bounds, type Point, tileToWorld } from './iso';
import { PALETTE } from './palette';
import type { TileShapes } from './tile-shapes';
import { createCanvas } from './pixel-canvas';
import { TerrainPainter } from './terrain-art';
import { WaterFx } from './water-fx';

/** Lado (en casillas) de los trozos en que se pinta el terreno. */
const CHUNK = 16;

interface Chunk {
  readonly tx: number;
  readonly ty: number;
  readonly bounds: Bounds;
  sprite: Sprite | null;
}

/**
 * Dibuja el mapa por capas: terreno, rejilla opcional, marcas en el suelo (cursor, selección), objetos
 * (los pinta EntityRenderer, ordenados por profundidad) y una capa superior para el fantasma de colocación.
 */
export class WorldRenderer {
  readonly root = new Container({ isRenderGroup: true });
  /** Marcas sobre el suelo: anillos de selección, marcadores de orden. */
  readonly decals = new Container();
  /** Árboles, unidades y (más adelante) edificios. `zIndex` = y de los pies en píxeles de mundo. */
  readonly objects = new Container({ sortableChildren: true });
  /** Efectos por encima de los objetos y por debajo de la niebla: humo, polvo, cascotes, chispas. */
  readonly fx = new Container();
  /** Niebla de guerra: tapa lo de debajo según lo que vea el jugador. */
  readonly fogLayer = new Container();
  /** Encima de todo: fantasma de colocación, bandera de reunión, barras de vida, flechas. */
  readonly overlay = new Container();
  private readonly grid = new Container();
  private readonly hover: Sprite;
  private readonly terrain = new Container();
  private readonly painter: TerrainPainter;
  private readonly water: WaterFx;
  private readonly chunks: Chunk[] = [];
  private pending: number;

  constructor(map: GameMap, art: TileShapes) {
    // La entrada se gestiona con eventos del DOM: evitamos que Pixi haga hit-testing sobre miles de sprites.
    this.root.eventMode = 'none';
    this.painter = new TerrainPainter(map);
    this.water = new WaterFx(this.painter);
    for (let ty = 0; ty < map.height; ty += CHUNK) {
      for (let tx = 0; tx < map.width; tx += CHUNK) {
        this.chunks.push({
          tx,
          ty,
          bounds: { minX: (tx - ty - CHUNK) * 16, maxX: (tx - ty + CHUNK) * 16, minY: (tx + ty) * 8, maxY: (tx + ty + 2 * CHUNK) * 8 },
          sprite: null,
        });
      }
    }
    this.pending = this.chunks.length;

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const p = tileToWorld(x, y);
        const line = new Sprite(art.tileGrid);
        line.anchor.set(0.5, 0);
        line.position.set(p.x, p.y);
        line.tint = PALETTE.ink;
        line.alpha = 0.25;
        this.grid.addChild(line);
      }
    }
    this.grid.visible = false;

    this.hover = new Sprite(art.tileOutline);
    this.hover.anchor.set(0.5, 0);
    this.hover.tint = PALETTE.gold;
    this.hover.visible = false;

    this.root.addChild(this.terrain, this.water.layer, this.grid, this.hover, this.decals, this.objects, this.fx, this.fogLayer, this.overlay);
  }

  /**
   * Anima el agua y pinta los trozos de terreno que se ven (unos 10–20 ms cada uno) y, si no falta ninguno
   * a la vista, uno más de los que quedan, para tener el mapa entero listo en unos segundos sin tirones.
   */
  update(view: Bounds, frameMs = 16): void {
    this.water.update(view, frameMs);
    if (this.pending === 0) return;
    let baked = 0;
    for (const c of this.chunks) {
      if (c.sprite || baked >= 6) continue;
      const b = c.bounds;
      if (b.maxX < view.minX - 32 || b.minX > view.maxX + 32 || b.maxY < view.minY - 32 || b.minY > view.maxY + 32) continue;
      this.bake(c);
      baked++;
    }
    if (baked === 0) {
      const next = this.chunks.find((c) => !c.sprite);
      if (next) this.bake(next);
    }
  }

  private bake(c: Chunk): void {
    const { minX, minY, maxX, maxY } = c.bounds;
    const w = maxX - minX;
    const h = maxY - minY;
    const rgba = this.painter.paint(minX, minY, w, h, (x, y) => x >= c.tx && x < c.tx + CHUNK && y >= c.ty && y < c.ty + CHUNK);
    const { canvas, ctx } = createCanvas(w, h);
    ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
    const texture = Texture.from(canvas);
    texture.source.scaleMode = 'nearest';
    const sprite = new Sprite(texture);
    sprite.position.set(minX, minY);
    this.terrain.addChild(sprite);
    c.sprite = sprite;
    this.pending--;
  }

  get gridVisible(): boolean {
    return this.grid.visible;
  }

  toggleGrid(): void {
    this.grid.visible = !this.grid.visible;
  }

  setHoverTile(tile: Point | null): void {
    if (!tile) {
      this.hover.visible = false;
      return;
    }
    const p = tileToWorld(tile.x, tile.y);
    this.hover.position.set(p.x, p.y);
    this.hover.visible = true;
  }
}
