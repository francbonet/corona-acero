import { type Container, Sprite, Texture } from 'pixi.js';
import { createCanvas } from './pixel-canvas';

/**
 * Partículas en pixel art para los efectos (docs/arte.md §8): polvo, humo de chimenea y de pólvora,
 * cascotes, chispas, brasas y fogonazos. Las nubes crecen cambiando de textura (no escalando, para no
 * deformar los píxeles) y se desvanecen. No son estado de la partida: usan Math.random.
 */

type RGB = readonly [number, number, number];
const hex = (h: string): RGB => {
  const n = Number.parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Bayer 4×4 para el borde tramado de las nubes. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

function make(w: number, h: number, paint: (set: (x: number, y: number, c: RGB, a?: number) => void) => void): Texture {
  const { canvas, ctx } = createCanvas(w, h);
  const img = ctx.createImageData(w, h);
  paint((x, y, c, a = 255) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const k = (y * w + x) * 4;
    img.data[k] = c[0];
    img.data[k + 1] = c[1];
    img.data[k + 2] = c[2];
    img.data[k + 3] = a;
  });
  ctx.putImageData(img, 0, 0);
  const tex = Texture.from(canvas);
  tex.source.scaleMode = 'nearest';
  return tex;
}

/** Nube redonda de diámetro d: clara arriba a la izquierda, oscura abajo a la derecha y el borde tramado. */
function puff(d: number, ramp: readonly RGB[]): Texture {
  const r = d / 2;
  return make(d, d, (set) => {
    for (let y = 0; y < d; y++) {
      for (let x = 0; x < d; x++) {
        const dx = (x + 0.5 - r) / r;
        const dy = (y + 0.5 - r) / r;
        const dist = Math.hypot(dx, dy);
        if (dist > 1) continue;
        // Borde tramado en el último cuarto.
        if (dist > 0.72 && (dist - 0.72) / 0.28 > BAYER[(y & 3) * 4 + (x & 3)]) continue;
        const light = -dx * 0.6 - dy * 0.7;
        const i = light > 0.35 ? 2 : light > -0.3 ? 1 : 0;
        set(x, y, ramp[i]);
      }
    }
  });
}

const RAMPS = {
  dust: ['#8a7454', '#b8a07a', '#dccaa4'].map(hex),
  smoke: ['#4a4744', '#6e6a66', '#94908a'].map(hex),
  darkSmoke: ['#24201e', '#3a3532', '#55504a'].map(hex),
  gunSmoke: ['#a8a49c', '#cfcbc2', '#eeeae2'].map(hex),
  splash: ['#5089bd', '#8fb8dc', '#d6e6f0'].map(hex),
} as const;
export type PuffKind = keyof typeof RAMPS;

/** Tamaños de cada nube al crecer (diámetros). */
const SIZES = [3, 4, 6, 8, 10, 12];

export interface ParticleTextures {
  /** puffs[tipo] = la nube a cada tamaño, de pequeña a grande. */
  readonly puffs: Readonly<Record<PuffKind, readonly Texture[]>>;
  /** Cascotes: piedra, madera, ladrillo, tierra. */
  readonly debris: readonly Texture[];
  /** Chispa de un golpe (3 fotogramas). */
  readonly spark: readonly Texture[];
  /** Fogonazo de pólvora. */
  readonly flash: Texture;
  /** Brasa (fuego) y chispita suelta. */
  readonly ember: Texture;
  readonly fleck: Texture;
  /** Llamas (4 fotogramas). */
  readonly flame: readonly Texture[];
}

function createTextures(): ParticleTextures {
  const puffs = Object.fromEntries(Object.entries(RAMPS).map(([k, ramp]) => [k, SIZES.map((d) => puff(d, ramp))])) as Record<PuffKind, Texture[]>;
  const debris = (['#8a8478', '#7a5232', '#ad5d40', '#6a4a2c'] as const).map((c, i) =>
    make(3, 2, (set) => {
      const col = hex(c);
      const dark = col.map((v) => v * 0.6) as unknown as RGB;
      set(0, 0, col);
      set(1, 0, col);
      if (i !== 3) set(2, 0, dark);
      set(0, 1, dark);
      set(1, 1, dark);
    }),
  );
  const W = hex('#fff6d0');
  const Y = hex('#f2dc6a');
  const O = hex('#e3a03c');
  const spark = [
    make(7, 7, (set) => {
      set(3, 3, W);
      set(2, 3, Y);
      set(4, 3, Y);
      set(3, 2, Y);
      set(3, 4, Y);
    }),
    make(7, 7, (set) => {
      set(3, 3, W);
      for (const [x, y] of [
        [1, 1],
        [5, 1],
        [1, 5],
        [5, 5],
        [3, 0],
        [3, 6],
        [0, 3],
        [6, 3],
      ])
        set(x, y, O);
      for (const [x, y] of [
        [2, 2],
        [4, 2],
        [2, 4],
        [4, 4],
        [3, 1],
        [3, 5],
        [1, 3],
        [5, 3],
      ])
        set(x, y, Y);
    }),
    make(7, 7, (set) => {
      for (const [x, y] of [
        [0, 0],
        [6, 0],
        [0, 6],
        [6, 6],
        [3, 0],
        [0, 3],
      ])
        set(x, y, O);
    }),
  ];
  const flash = make(5, 5, (set) => {
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) if (Math.abs(x - 2) + Math.abs(y - 2) <= 2) set(x, y, Math.abs(x - 2) + Math.abs(y - 2) === 0 ? W : Math.abs(x - 2) + Math.abs(y - 2) === 1 ? Y : O);
  });
  const ember = make(1, 1, (set) => set(0, 0, O));
  const fleck = make(1, 1, (set) => set(0, 0, Y));
  // Llamas: lengua de fuego de 7×10 que ondea.
  const R = hex('#c8402a');
  const flame = [0, 1, 2, 3].map((f) =>
    make(7, 10, (set) => {
      for (let y = 0; y < 10; y++) {
        const t = y / 9; // 0 arriba, 1 abajo
        const sway = Math.round(Math.sin(f * 1.57 + y * 0.8) * (1 - t) * 1.2);
        const half = Math.max(0, Math.round(0.5 + t * 2.6 - (y < 2 ? 0.5 : 0)));
        for (let x = 3 - half; x <= 3 + half; x++) {
          const edge = Math.abs(x - 3) === half;
          const core = Math.abs(x - 3) <= half - 2 && t > 0.45;
          set(x + sway, y, core ? W : edge ? R : t > 0.3 ? Y : O);
        }
      }
    }),
  );
  return { puffs, debris, spark, flash, ember, fleck, flame };
}

interface Particle {
  sprite: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  /** Altura a la que se para un cascote (y de la pantalla). */
  floor: number;
  age: number;
  life: number;
  fadeFrom: number;
  frames: readonly Texture[] | null;
  /** Las nubes cambian de tamaño a lo largo de la vida; las animaciones, de fotograma. */
  loop: boolean;
  /** Las nubes crecen deprisa al principio y luego se quedan flotando. */
  ease: boolean;
  frameMs: number;
  alpha: number;
  pool: Sprite[];
}

export interface SpawnOptions {
  readonly x: number;
  readonly y: number;
  readonly vx?: number;
  readonly vy?: number;
  /** Aceleración hacia abajo, en píxeles por ms². */
  readonly gravity?: number;
  /** Y a la que caen los cascotes (se quedan ahí hasta desvanecerse). */
  readonly floor?: number;
  readonly life: number;
  /** Desde qué fracción de la vida se desvanece. */
  readonly fadeFrom?: number;
  readonly alpha?: number;
  /** Fotogramas: se reparten a lo largo de la vida, o en bucle cada `frameMs` si se da. */
  readonly frames: readonly Texture[];
  readonly frameMs?: number;
  /** Capa del suelo (por debajo de las unidades) en lugar de la de efectos. */
  readonly ground?: boolean;
  /** Recorre los fotogramas deprisa al principio (nubes que crecen). */
  readonly ease?: boolean;
}

const MAX_PARTICLES = 600;

export class Particles {
  readonly tex = createTextures();
  private readonly live: Particle[] = [];
  private readonly poolOver: Sprite[] = [];
  private readonly poolGround: Sprite[] = [];

  constructor(
    private readonly over: Container,
    private readonly ground: Container,
  ) {}

  get count(): number {
    return this.live.length;
  }

  spawn(o: SpawnOptions): void {
    if (this.live.length >= MAX_PARTICLES) return;
    const pool = o.ground ? this.poolGround : this.poolOver;
    const layer = o.ground ? this.ground : this.over;
    const sprite = pool.pop() ?? layer.addChild(new Sprite());
    sprite.anchor.set(0.5);
    sprite.texture = o.frames[0];
    sprite.alpha = o.alpha ?? 1;
    sprite.visible = true;
    sprite.scale.x = Math.random() < 0.5 ? -1 : 1;
    sprite.position.set(Math.round(o.x), Math.round(o.y));
    this.live.push({
      sprite,
      x: o.x,
      y: o.y,
      vx: o.vx ?? 0,
      vy: o.vy ?? 0,
      gravity: o.gravity ?? 0,
      floor: o.floor ?? Infinity,
      age: 0,
      life: o.life,
      fadeFrom: o.fadeFrom ?? 0.6,
      frames: o.frames.length > 1 ? o.frames : null,
      loop: o.frameMs !== undefined,
      ease: o.ease ?? false,
      frameMs: o.frameMs ?? 0,
      alpha: o.alpha ?? 1,
      pool,
    });
  }

  /** Nube que crece de `from` a `to` (índices de tamaño) mientras sube y se desvanece. */
  puff(kind: PuffKind, x: number, y: number, o: { from?: number; to?: number; vx?: number; vy?: number; life?: number; alpha?: number; ground?: boolean } = {}): void {
    const sizes = this.tex.puffs[kind];
    const from = o.from ?? 0;
    const to = Math.min(sizes.length - 1, o.to ?? 3);
    this.spawn({ x, y, vx: o.vx ?? 0, vy: o.vy ?? -0.01, life: o.life ?? 900, fadeFrom: 0.45, alpha: o.alpha ?? 0.85, frames: sizes.slice(from, to + 1), ground: o.ground, ease: true });
  }

  update(frameMs: number): void {
    const dt = Math.min(frameMs, 100);
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.age += dt;
      if (p.age >= p.life) {
        p.sprite.visible = false;
        p.pool.push(p.sprite);
        this.live.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y > p.floor) {
        p.y = p.floor;
        p.vx = 0;
        p.vy = 0;
        p.gravity = 0;
      }
      p.sprite.position.set(Math.round(p.x), Math.round(p.y));
      const t = p.age / p.life;
      if (p.frames) {
        const k = p.ease ? Math.sqrt(t) : t;
        const f = p.loop ? Math.floor(p.age / p.frameMs) % p.frames.length : Math.min(p.frames.length - 1, Math.floor(k * p.frames.length));
        p.sprite.texture = p.frames[f];
      }
      p.sprite.alpha = t > p.fadeFrom ? p.alpha * Math.max(0, 1 - (t - p.fadeFrom) / (1 - p.fadeFrom)) : p.alpha;
    }
  }
}
