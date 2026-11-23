import { Container, Sprite, Texture } from 'pixi.js';
import type { Bounds } from './iso';
import { createCanvas } from './pixel-canvas';
import type { TerrainPainter } from './terrain-art';

/**
 * Agua animada: ondas cortas que aparecen, derivan despacio y se desvanecen, y destellos sueltos.
 * Solo se crean en agua abierta (lejos de la espuma de la orilla) dentro de la vista, así que cuestan poco
 * aunque el mapa tenga mucha agua. No es estado de la partida: usa Math.random.
 */

interface Ripple {
  readonly sprite: Sprite;
  age: number;
  life: number;
  vx: number;
  frames: readonly Texture[] | null;
}

const MAX = 140;
/** Píxeles de agua por onda en pantalla. */
const AREA_PER_RIPPLE = 1400;

function texture(w: number, h: number, pixels: readonly [number, number, string][]): Texture {
  const { canvas, ctx } = createCanvas(w, h);
  for (const [x, y, c] of pixels) {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, 1, 1);
  }
  const tex = Texture.from(canvas);
  tex.source.scaleMode = 'nearest';
  return tex;
}

export class WaterFx {
  readonly layer = new Container();
  private readonly ripples: Ripple[] = [];
  private readonly free: Sprite[] = [];
  private readonly waves: Texture[];
  private readonly glint: Texture[];
  private readonly enabled: boolean;

  constructor(private readonly painter: TerrainPainter) {
    const hi = '#a8cbe8';
    const lo = '#6a9ccc';
    this.waves = [
      texture(6, 2, [[1, 0, hi], [2, 0, hi], [3, 0, hi], [4, 0, hi], [0, 1, lo], [5, 1, lo]]),
      texture(4, 2, [[1, 0, hi], [2, 0, hi], [0, 1, lo], [3, 1, lo]]),
      texture(8, 2, [[2, 0, hi], [3, 0, hi], [4, 0, hi], [5, 0, hi], [0, 1, lo], [1, 1, lo], [6, 1, lo], [7, 1, lo]]),
    ];
    const w = '#f2f8fc';
    this.glint = [texture(3, 3, [[1, 1, hi]]), texture(3, 3, [[1, 0, hi], [0, 1, hi], [1, 1, w], [2, 1, hi], [1, 2, hi]]), texture(3, 3, [[1, 1, w]])];
    this.enabled = painter.hasWater();
  }

  update(view: Bounds, frameMs: number): void {
    if (!this.enabled) return;
    const dt = Math.min(frameMs, 100);
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.age += dt;
      const t = r.age / r.life;
      if (t >= 1 || !inside(r.sprite, view)) {
        r.sprite.visible = false;
        this.free.push(r.sprite);
        this.ripples.splice(i, 1);
        continue;
      }
      if (r.frames) r.sprite.texture = r.frames[Math.min(r.frames.length - 1, Math.floor(t * r.frames.length))];
      else {
        r.sprite.x += r.vx * dt;
        r.sprite.alpha = Math.sin(Math.PI * t) * 0.9;
      }
    }
    // Cuántas ondas tocan con lo que se ve (se reparten con varios intentos por fotograma).
    const area = (view.maxX - view.minX) * (view.maxY - view.minY);
    const target = Math.min(MAX, Math.floor(area / AREA_PER_RIPPLE));
    for (let tries = 0; tries < 24 && this.ripples.length < target; tries++) {
      const x = Math.floor(view.minX + Math.random() * (view.maxX - view.minX));
      const y = Math.floor(view.minY + Math.random() * (view.maxY - view.minY));
      const glint = Math.random() < 0.18;
      const tex = glint ? this.glint[0] : this.waves[Math.floor(Math.random() * this.waves.length)];
      // El sprite entero (y algo de margen hacia donde deriva) tiene que caer en agua.
      if (!this.painter.isOpenWater(x, y) || !this.painter.isOpenWater(x + tex.width + 3, y + tex.height)) continue;
      const sprite = this.free.pop() ?? this.layer.addChild(new Sprite());
      sprite.texture = tex;
      sprite.position.set(x, y);
      sprite.alpha = glint ? 1 : 0;
      sprite.visible = true;
      this.ripples.push(
        glint
          ? { sprite, age: 0, life: 420 + Math.random() * 300, vx: 0, frames: [this.glint[0], this.glint[1], this.glint[2], this.glint[0]] }
          : { sprite, age: 0, life: 1600 + Math.random() * 1600, vx: 0.0015 + Math.random() * 0.002, frames: null },
      );
    }
  }
}

function inside(s: Sprite, v: Bounds): boolean {
  return s.x > v.minX - 16 && s.x < v.maxX + 16 && s.y > v.minY - 16 && s.y < v.maxY + 16;
}
