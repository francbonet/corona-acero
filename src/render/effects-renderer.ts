import { type Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { FP_ONE, FP_SHIFT, fixedLength } from '../engine/fixed';
import type { Projectile, SimEvent } from '../sim/combat';
import { UNIT_DEFS, type UnitType } from '../data/units';
import type { BuildingType } from '../data/buildings';
import { BuildStage } from './building-art';
import type { Particles } from './particles';
import { HALF_H, HALF_W, tileToWorld } from './iso';
import { TEAM_COLORS } from './palette';
import type { EntityArt } from './entity-renderer';
import type { Dir8 } from './unit-art';

interface Effect {
  readonly sprite: Sprite;
  age: number;
  readonly life: number;
  /** A partir de qué edad empieza a desvanecerse. */
  readonly fadeFrom: number;
  /** Animación (la muerte): fotogramas y duración de cada uno; se queda en el último. */
  readonly frames?: readonly Texture[];
  readonly frameMs?: number;
}

const CORPSE_MS = 14000;
const RUBBLE_MS = 25000;
const SPARK_MS = 160;
/** Altura (píxeles) desde la que sale y a la que llega una flecha: la mano y el pecho. */
const ARROW_HEIGHT = 10;

/** Convierte una posición en punto fijo a píxeles de mundo. */
function toWorld(x: number, y: number): { x: number; y: number } {
  return { x: ((x - y) * HALF_W) / FP_ONE, y: ((x + y) * HALF_H) / FP_ONE };
}

/**
 * Efectos visuales que no son estado de la partida: flechas en vuelo (dibujadas como trazos en arco),
 * chispas de los golpes, cadáveres y escombros que se desvanecen.
 */
export class EffectsRenderer {
  private readonly arrows = new Graphics();
  private readonly effects: Effect[] = [];
  /** Proyectiles redondos del fotograma: [x, y, lado, color]… */
  private readonly balls: number[] = [];

  constructor(
    private readonly art: EntityArt,
    private readonly decals: Container,
    private readonly overlay: Container,
    /** Hacia dónde miraba una unidad (para que caiga hacia su lado). */
    private readonly dirOf: (id: number) => Dir8 = () => 'S',
    /** Era de un jugador (las ruinas son las de su arquitectura en esa era). */
    private readonly eraOf: (player: number) => number = () => 0,
    /** Partículas: polvo, humo, cascotes y chispas. */
    private readonly particles: Particles | null = null,
  ) {
    overlay.addChild(this.arrows);
  }

  /** Crea los efectos de los sucesos del tick. `seen(x, y)` dice si el jugador ve esa casilla. */
  handle(events: readonly SimEvent[], seen: (tx: number, ty: number) => boolean): void {
    for (const ev of events) {
      if (ev.kind === 'convert' || ev.kind === 'heal') {
        if (!seen(ev.x >> FP_SHIFT, ev.y >> FP_SHIFT)) continue;
        const p = toWorld(ev.x, ev.y);
        const s = this.add(this.art.nodes.spark, Math.round(p.x), Math.round(p.y - 14), this.overlay, ev.kind === 'convert' ? 600 : 300, 200, 0.5);
        s.tint = ev.kind === 'convert' ? 0xf2dc6a : 0x7fd08a;
        continue;
      }
      if (ev.kind === 'shoot' || ev.kind === 'impact') {
        if (this.particles && seen(ev.x >> FP_SHIFT, ev.y >> FP_SHIFT)) this.projectileFx(ev.kind, ev.projectile, toWorld(ev.x, ev.y));
        continue;
      }
      if (ev.kind !== 'hit' && ev.kind !== 'death') continue;
      const tx = ev.x >> FP_SHIFT;
      const ty = ev.y >> FP_SHIFT;
      if (!seen(tx, ty)) continue;
      const p = toWorld(ev.x, ev.y);
      if (ev.kind === 'hit') {
        if (this.particles) this.sparks(p.x, p.y - 9);
        else this.add(this.art.nodes.spark, Math.round(p.x), Math.round(p.y - 9), this.overlay, SPARK_MS, SPARK_MS, 0.5);
      } else if (ev.building) {
        this.collapse(p.x, p.y, ev.size);
        // Escombros sobre la huella del edificio (la posición del suceso es el centro de la huella).
        const ox = (ev.x - ev.size * (FP_ONE >> 1)) >> FP_SHIFT;
        const oy = (ev.y - ev.size * (FP_ONE >> 1)) >> FP_SHIFT;
        const top = tileToWorld(ox, oy);
        const owner = Math.min(ev.owner, TEAM_COLORS.length - 1);
        const ruins = this.art.buildings.sprite(ev.unitType as BuildingType, owner, this.eraOf(ev.owner), BuildStage.Ruins);
        this.add(ruins.texture, top.x - ruins.originX, top.y - ruins.originY, this.decals, RUBBLE_MS, RUBBLE_MS * 0.7, 0);
      } else if (!this.isAnimal(ev.unitType)) {
        // Animación de muerte y, al terminar, el cuerpo se queda en el suelo un rato.
        const type = ev.unitType as UnitType;
        const model = this.art.units.model(type);
        const frames = this.art.units.frames(type, Math.min(ev.owner, TEAM_COLORS.length - 1), 'die', this.dirOf(ev.id), ev.id);
        if (frames.length === 0) continue;
        const spec = model.anims.find((a) => a.name === 'die');
        const s = this.add(frames[0].texture, Math.round(p.x), Math.round(p.y), this.decals, CORPSE_MS, CORPSE_MS * 0.6, model.originX / model.cell, model.originY / model.cell, frames.map((f) => f.texture), spec?.frameMs ?? 100);
        // Texturas de unidad a doble densidad: el sprite, a la mitad.
        const k = 1 / this.art.units.detail;
        s.scale.set((frames[0].flip ? -1 : 1) * k, k);
      }
    }
  }

  update(frameMs: number, projectiles: readonly Projectile[], alpha: number, seen: (tx: number, ty: number) => boolean): void {
    this.arrows.clear();
    let any = false;
    for (const p of projectiles) {
      const t = Math.min(1, (p.ticks + alpha) / p.total);
      const x = p.x0 + (p.tx - p.x0) * t;
      const y = p.y0 + (p.ty - p.y0) * t;
      if (!seen(x >> FP_SHIFT, y >> FP_SHIFT)) continue;
      const a = toWorld(p.x0, p.y0);
      const b = toWorld(p.tx, p.ty);
      // Arco: más alto cuanto más lejos va.
      const dist = fixedLength(p.tx - p.x0, p.ty - p.y0) / FP_ONE;
      const arc = Math.min(16, 3 + dist * 2) * 4 * t * (1 - t);
      const cx = a.x + (b.x - a.x) * t;
      const cy = a.y + (b.y - a.y) * t - ARROW_HEIGHT - arc;
      // Dirección en pantalla (incluye la subida o bajada del arco).
      const t2 = Math.max(0, t - 0.05);
      const arc2 = Math.min(16, 3 + dist * 2) * 4 * t2 * (1 - t2);
      const px = a.x + (b.x - a.x) * t2;
      const py = a.y + (b.y - a.y) * t2 - ARROW_HEIGHT - arc2;
      if (p.kind !== 0) {
        // Piedra de trabuquete (gorda) o bala de bombarda (pequeña y negra).
        const size = p.kind === 1 ? 3 : 2;
        this.balls.push(Math.round(cx) - 1, Math.round(cy) - 1, size, p.kind === 1 ? 0x5e584e : 0x120d0a);
        continue;
      }
      const len = Math.hypot(cx - px, cy - py) || 1;
      const dx = ((cx - px) / len) * 4;
      const dy = ((cy - py) / len) * 4;
      this.arrows.moveTo(Math.round(cx - dx), Math.round(cy - dy)).lineTo(Math.round(cx), Math.round(cy));
      any = true;
    }
    if (any) this.arrows.stroke({ width: 1, color: 0x2b1d14 });
    for (let i = 0; i < this.balls.length; i += 4) {
      this.arrows.rect(this.balls[i], this.balls[i + 1], this.balls[i + 2], this.balls[i + 2]).fill(this.balls[i + 3]);
    }
    this.balls.length = 0;

    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i];
      fx.age += frameMs;
      if (fx.frames && fx.frameMs) fx.sprite.texture = fx.frames[Math.min(fx.frames.length - 1, Math.floor(fx.age / fx.frameMs))];
      if (fx.age >= fx.life) {
        fx.sprite.destroy();
        this.effects.splice(i, 1);
      } else if (fx.age > fx.fadeFrom) {
        fx.sprite.alpha = 1 - (fx.age - fx.fadeFrom) / (fx.life - fx.fadeFrom);
      }
    }
  }

  private add(texture: Texture, x: number, y: number, layer: Container, life: number, fadeFrom: number, ax: number, ay = 0, frames?: readonly Texture[], frameMs?: number): Sprite {
    const sprite = new Sprite(texture);
    sprite.anchor.set(ax, ay);
    sprite.position.set(x, y);
    layer.addChild(sprite);
    this.effects.push({ sprite, age: 0, life, fadeFrom, frames, frameMs });
    return sprite;
  }

  /** Chispa de un golpe con unas esquirlas que saltan. */
  private sparks(x: number, y: number): void {
    const P = this.particles;
    if (!P) return;
    P.spawn({ x: x + (Math.random() - 0.5) * 4, y: y + (Math.random() - 0.5) * 3, life: SPARK_MS + 60, fadeFrom: 0.8, frames: P.tex.spark });
    for (let i = 0; i < 3; i++) {
      P.spawn({ x, y, vx: (Math.random() - 0.5) * 0.12, vy: -0.05 - Math.random() * 0.06, gravity: 0.0004, life: 260, fadeFrom: 0.5, frames: [P.tex.fleck] });
    }
  }

  /** Derrumbe: nube de polvo que se extiende por la huella y cascotes que saltan y caen. */
  private collapse(x: number, y: number, size: number): void {
    const P = this.particles;
    if (!P) return;
    const spread = 12 * size;
    for (let i = 0; i < 8 + size * 6; i++) {
      const dx = (Math.random() - 0.5) * spread * 1.6;
      const dy = (Math.random() - 0.5) * spread * 0.6 - Math.random() * 6 * size;
      P.puff(Math.random() < 0.35 ? 'smoke' : 'dust', x + dx, y + dy - 4, { from: 2, to: 5, vx: dx * 0.0005, vy: -0.006 - Math.random() * 0.012, life: 1800 + Math.random() * 1200, alpha: 0.95 });
    }
    for (let i = 0; i < 8 + size * 6; i++) {
      const floor = y + (Math.random() - 0.3) * 8 * size;
      P.spawn({
        x: x + (Math.random() - 0.5) * spread,
        y: y - 6 - Math.random() * 10 * size,
        vx: (Math.random() - 0.5) * 0.12,
        vy: -0.08 - Math.random() * 0.12,
        gravity: 0.0005,
        floor,
        life: 1600 + Math.random() * 800,
        fadeFrom: 0.7,
        frames: [P.tex.debris[Math.floor(Math.random() * P.tex.debris.length)]],
      });
    }
  }

  /** Pólvora al disparar (fogonazo y humo blanco) e impactos de piedra o bala (polvo y cascotes). */
  private projectileFx(kind: 'shoot' | 'impact', projectile: number, p: { x: number; y: number }): void {
    const P = this.particles;
    if (!P) return;
    const BALL = 2;
    const STONE = 1;
    if (kind === 'shoot' && projectile === BALL) {
      P.spawn({ x: p.x + (Math.random() < 0.5 ? -5 : 5), y: p.y - 9, life: 90, fadeFrom: 0.5, frames: [P.tex.flash] });
      for (let i = 0; i < 3; i++) P.puff('gunSmoke', p.x + (Math.random() - 0.5) * 8, p.y - 9 - i * 2, { from: 0, to: 4, vx: 0.004 + Math.random() * 0.006, vy: -0.008, life: 1300 + i * 300, alpha: 0.8 });
    } else if (kind === 'impact' && (projectile === STONE || projectile === BALL)) {
      const big = projectile === STONE;
      for (let i = 0; i < (big ? 6 : 3); i++) P.puff('dust', p.x + (Math.random() - 0.5) * 12, p.y - 2, { from: 0, to: big ? 4 : 3, vy: -0.01 - Math.random() * 0.01, life: 900 + Math.random() * 400 });
      for (let i = 0; i < (big ? 8 : 4); i++) {
        P.spawn({ x: p.x, y: p.y - 4, vx: (Math.random() - 0.5) * 0.14, vy: -0.08 - Math.random() * 0.1, gravity: 0.0006, floor: p.y + (Math.random() - 0.5) * 6, life: 1100, fadeFrom: 0.6, frames: [P.tex.debris[i % P.tex.debris.length]] });
      }
    }
  }

  /** Los animales no dejan cadáver de soldado (dejan carne, que es una fuente). */
  private isAnimal(unitType: number): boolean {
    return UNIT_DEFS[unitType as UnitType]?.classes.includes('animal') ?? false;
  }
}
