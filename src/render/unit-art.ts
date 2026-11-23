import { Rectangle, Texture } from 'pixi.js';
import type { UnitType } from '../data/units';
import { type FrameRect, recolorTeam } from './assets/aseprite';
import type { UnitOverride } from './assets/overrides';
import { TEAM_COLORS } from './palette';
import { UNIT_DEFS } from '../data/units';
import { type CardImage, ICON_SIZE, backdrop, stamp } from './icon-card';
import { type AnimName, type AnimSpec, Job, type UnitModel, unitModel } from './rig/catalog';
import { HEAD_TOP } from './rig/models';
import { rampsFor, teamRamp } from './rig/materials';
import { DIRECTIONS, type Direction, type RasterResult, opaqueBounds, rasterize, transformPrims, yaw } from './rig/raster';

/** Las 8 direcciones de la pantalla; SE, E y NE se dibujan reflejando SO, O y NO. */
export const DIR8 = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'] as const;
export type Dir8 = (typeof DIR8)[number];

const DRAWN: Readonly<Record<Dir8, { dir: Direction; flip: boolean }>> = {
  S: { dir: 'S', flip: false },
  SW: { dir: 'SW', flip: false },
  W: { dir: 'W', flip: false },
  NW: { dir: 'NW', flip: false },
  N: { dir: 'N', flip: false },
  NE: { dir: 'NW', flip: true },
  E: { dir: 'W', flip: true },
  SE: { dir: 'SW', flip: true },
};

/** Qué dirección dibujada se usa para cada una de las 8 y si va reflejada. */
export function drawnDir(dir: Dir8): { readonly dir: Direction; readonly flip: boolean } {
  return DRAWN[dir];
}

/** Dirección de un vector en pantalla (x a la derecha, y hacia abajo). */
export function dirFromScreen(dx: number, dy: number): Dir8 {
  // 0 = este; el ángulo crece en sentido horario porque la y de la pantalla va hacia abajo.
  const sector = Math.round((Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8;
  return (['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'] as const)[sector];
}

/** Hacia qué lado de la pantalla mira (−1 izquierda, 1 derecha, 0 de frente o de espaldas). */
export function facingSign(dir: Dir8): -1 | 0 | 1 {
  return dir === 'SW' || dir === 'W' || dir === 'NW' ? -1 : dir === 'S' || dir === 'N' ? 0 : 1;
}

const RING_SMALL = { w: 16, h: 8 };
const RING_BIG = { w: 24, h: 12 };
const SHADOW_SMALL = { w: 12, h: 5 };
const SHADOW_BIG = { w: 22, h: 9 };

export interface UnitFrame {
  readonly texture: Texture;
  readonly flip: boolean;
}

export interface UnitArt {
  model(type: UnitType): UnitModel;
  /**
   * Fotograma de una animación en una dirección (con `f` dentro de los de la animación). `look` elige el aspecto
   * (aldeano o aldeana) y `job` la herramienta que lleva al andar y en reposo.
   */
  frame(type: UnitType, player: number, anim: AnimName, dir: Dir8, f: number, look?: number, job?: Job): UnitFrame;
  /** Fotogramas de una animación (para efectos como la muerte). */
  frames(type: UnitType, player: number, anim: AnimName, dir: Dir8, look?: number): readonly UnitFrame[];
  /** Sombra en el suelo, bajo los pies. */
  shadow(type: UnitType): Texture;
  /** Píxeles de textura por píxel del mundo: los sprites de las unidades se dibujan a 1/detail. */
  readonly detail: number;
  /** Pinta fotogramas pendientes durante como mucho `budgetMs` (llamarlo una vez por fotograma de pantalla). */
  pump(budgetMs: number): void;
  hasAnim(type: UnitType, anim: AnimName): boolean;
  /** Caja de clic: medio ancho y altura sobre los pies. */
  hitbox(type: UnitType): { readonly halfW: number; readonly height: number };
  readonly ringSmall: Texture;
  readonly ringBig: Texture;
  /** Retrato (de tres cuartos, en reposo) como data URL, para el HUD. */
  icon(type: UnitType, player: number): string;
  /** El mismo retrato como lienzo (para componer iconos de tecnologías). */
  iconCanvas(type: UnitType, player: number): HTMLCanvasElement;
}


/** Aspecto válido de un modelo (0 si no tiene variantes). */
export function lookOf(m: UnitModel, look: number): number {
  const n = m.looks?.length ?? 0;
  return n ? ((look % n) + n) % n : 0;
}

/**
 * Píxeles de un fotograma de una figura generada: la pose, el giro de las vistas de frente y de espaldas de
 * los cuadrúpedos y el rasterizado. `k` pinta la figura a más resolución (retratos). La galería lo usa tal cual.
 */
export function drawUnitFrame(m: UnitModel, team: readonly [string, string, string], anim: AnimName, dir: Direction, f: number, look = 0, job: Job = Job.None, k = 1): RasterResult {
  let prims = m.pose(anim, f, look, job);
  if (k !== 1) prims = prims.map((q) => ({ ...q, center: [q.center[0] * k, q.center[1] * k, q.center[2] * k] as const, half: [q.half[0] * k, q.half[1] * k, q.half[2] * k] as const }));
  if (m.turn && (dir === 'S' || dir === 'N')) {
    const deg = dir === 'S' ? m.turn : -m.turn;
    prims = transformPrims(prims, (p) => yaw(p, deg), (v) => yaw(v, deg));
  }
  const cell = Math.ceil(m.cell * k);
  return rasterize(prims, dir, { width: cell, height: cell, originX: m.originX * k, originY: m.originY * k, ramps: rampsFor(team), scale: k });
}

/** Escala de los retratos en plano medio (de la cabeza a la cadera) y la máxima de los de cuerpo entero. */
const BUST_SCALE = 3.2;
const FULL_SCALE = 2.2;

/** Encaja una figura entera en la tarjeta: centrada y con los pies cerca del borde de abajo. */
function fitOnCard(card: CardImage, render: (k: number) => RasterResult): void {
  const probe = render(1);
  const b0 = opaqueBounds(probe);
  if (!b0) return;
  const k = Math.min(FULL_SCALE, (ICON_SIZE - 4) / (b0.x1 - b0.x0 + 1), (ICON_SIZE - 6) / (b0.y1 - b0.y0 + 1));
  const r = render(k);
  const b = opaqueBounds(r);
  if (!b) return;
  stamp(card, r, Math.round(ICON_SIZE / 2 - (b.x0 + b.x1 + 1) / 2), ICON_SIZE - 3 - b.y1);
}

/**
 * Retrato de una unidad generada en su tarjeta (44×44, con el paisaje detrás): la gente a pie en plano medio,
 * con la cara centrada y el casco o el sombrero a la vista; caballería, asedio y animales, enteros.
 */
export function unitCard(type: UnitType, m: UnitModel, team: readonly [string, string, string]): CardImage {
  const card = backdrop('field');
  const def = UNIT_DEFS[type];
  const bust = !m.bigRing && def.pop > 0;
  if (!bust) {
    fitOnCard(card, (k) => drawUnitFrame(m, team, 'idle', 'SW', 0, 0, Job.None, k));
    return card;
  }
  const k = BUST_SCALE;
  // Los tiradores, apuntando: en reposo el cuerpo tapa el arco o la ballesta.
  const aiming = def.classes.includes('archer') && m.anims.some((a) => a.name === 'attack');
  const r = drawUnitFrame(m, team, aiming ? 'attack' : 'idle', 'SW', aiming ? 1 : 0, 0, Job.None, k);
  const headTop = Math.round(m.originY * k - HEAD_TOP * k);
  // Centro de la cabeza: los píxeles de la figura en la franja de la cara.
  let x0 = Infinity;
  let x1 = -Infinity;
  for (let y = Math.max(0, headTop); y < Math.min(r.height, headTop + 4 * k); y++) {
    for (let x = 0; x < r.width; x++) {
      if (r.rgba[(y * r.width + x) * 4 + 3] === 0) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
    }
  }
  const cx = x1 >= x0 ? (x0 + x1 + 1) / 2 : r.width / 2;
  stamp(card, r, Math.round(ICON_SIZE / 2 - cx), 8 - headTop);
  return card;
}

/** Animaciones que cambian con el oficio (las demás llevan su propia herramienta o ninguna). */
const JOB_ANIMS: readonly AnimName[] = ['idle', 'walk'];

interface Sheet {
  readonly canvas: HTMLCanvasElement;
  /** textures[dirección dibujada][animación][fotograma] */
  readonly textures: Map<AnimName, Texture[]>[];
  /**
   * Fotograma que se puede mostrar ya para el `f` de una animación en una dirección. Si `f` no está pintado pero
   * sí otro de la misma animación, devuelve el más cercano y pone `f` el primero de la cola; si no hay ninguno,
   * pinta `f` en el momento. El resto de la animación queda en cola. Sin `f`, la pinta entera ya.
   */
  ensure(dir: number, anim: AnimName, f?: number): number;
}

/**
 * Densidad de las unidades: sus texturas tienen el doble de píxeles por lado que el mundo y se dibujan a la
 * mitad, así que en pantalla miden lo mismo pero con cuatro veces más detalle (caras, manos, malla). En una
 * pantalla retina cada píxel de la unidad cae siempre en píxeles enteros del monitor.
 */
export const UNIT_DETAIL = 2;

/** Amplía un fotograma por vecino más cercano (las hojas de Aseprite van a la densidad del mundo). */
function upscale(r: RasterResult, k: number): RasterResult {
  if (k === 1) return r;
  const w = r.width * k;
  const h = r.height * k;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (Math.floor(y / k) * r.width + Math.floor(x / k)) * 4;
      const d = (y * w + x) * 4;
      rgba[d] = r.rgba[s];
      rgba[d + 1] = r.rgba[s + 1];
      rgba[d + 2] = r.rgba[s + 2];
      rgba[d + 3] = r.rgba[s + 3];
    }
  }
  return { width: w, height: h, rgba };
}

/**
 * Texturas de las unidades, generadas con el modelador de figuras (`rig/`). Cada pareja (tipo, jugador)
 * tiene una hoja con todas sus animaciones en las 5 direcciones dibujadas, creada la primera vez que hace falta.
 */
export function createUnitArt(overrides: ReadonlyMap<UnitType, UnitOverride> = new Map()): UnitArt {
  const sheets = new Map<string, Sheet>();
  const hitboxes = new Map<UnitType, { halfW: number; height: number }>();
  const icons = new Map<string, string>();
  const iconCanvases = new Map<string, HTMLCanvasElement>();
  const models = new Map<UnitType, UnitModel>();
  const clampPlayer = (p: number) => (p >= 0 && p < TEAM_COLORS.length ? p : 0);

  /** Modelo de la unidad: el generado, o uno que describe la hoja de Aseprite si la hay. */
  const modelOf = (type: UnitType): UnitModel => {
    let m = models.get(type);
    if (m) return m;
    const o = overrides.get(type);
    if (!o) m = unitModel(type);
    else {
      const cell = Math.max(o.sheet.frameW, o.sheet.frameH);
      const anims: AnimSpec[] = [];
      for (const [name, byDir] of o.sheet.anims) {
        const frames = byDir.get('S') ?? [...byDir.values()][0];
        anims.push({ name, frames: frames.length, frameMs: Math.round(frames.reduce((t, f) => t + f.duration, 0) / frames.length) });
      }
      if (!anims.some((a) => a.name === 'idle')) throw new Error(`La hoja de la unidad ${type} no tiene "reposo"`);
      // El fotograma se coloca abajo y centrado en la celda cuadrada: el pivote se desplaza igual.
      const ox = Math.floor((cell - o.sheet.frameW) / 2);
      const oy = cell - o.sheet.frameH;
      m = { cell, originX: ox + o.sheet.pivot.x, originY: oy + o.sheet.pivot.y, anims, bigRing: unitModel(type).bigRing, pose: () => [] };
    }
    models.set(type, m);
    return m;
  };

  /** Píxeles de un fotograma: pintado con el modelador, o recortado (y recoloreado) de la hoja de Aseprite. */
  const renderFrame = (type: UnitType, player: number, anim: AnimName, dir: Direction, f: number, look = 0, job: Job = Job.None): RasterResult => {
    const m = modelOf(type);
    const o = overrides.get(type);
    if (!o) return drawUnitFrame(m, TEAM_COLORS[player], anim, dir, f, look, job, UNIT_DETAIL);
    const byDir = o.sheet.anims.get(anim) ?? o.sheet.anims.get('idle')!;
    const frames = byDir.get(dir) ?? byDir.get('S') ?? [...byDir.values()][0];
    return upscale(cut(o.pixels, frames[f % frames.length], m.cell, teamRamp(TEAM_COLORS[player])), UNIT_DETAIL);
  };

  /**
   * Hoja de un tipo, jugador y aspecto: todas sus animaciones en las 5 direcciones. Con un oficio, solo las de
   * andar y reposo (las demás no cambian).
   */
  /** Fotogramas en cola para pintarlos poco a poco (cada uno, una función que lo pinta). */
  const pending: (() => void)[] = [];
  const dirtySheets = new Set<Texture>();
  /** Tiempo gastado en este fotograma de pantalla pintando al momento (se reinicia en `pump`). */
  let syncSpent = 0;
  const SYNC_BUDGET_MS = 8;

  const sheetOf = (type: UnitType, player: number, look: number, job: Job): Sheet => {
    const key = `${type}:${player}:${look}:${job}`;
    let sheet = sheets.get(key);
    if (sheet) return sheet;
    const m = modelOf(type);
    const cell = m.cell * UNIT_DETAIL;
    const anims = job === Job.None ? m.anims : m.anims.filter((a) => JOB_ANIMS.includes(a.name));
    const total = anims.reduce((n, a) => n + a.frames, 0);
    const canvas = document.createElement('canvas');
    canvas.width = cell * total;
    canvas.height = cell * DIRECTIONS.length;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo crear el contexto 2D para las unidades');
    const base = Texture.from(canvas);
    base.source.scaleMode = 'nearest';
    // Las subtexturas se crean ya (apuntan a su hueco de la hoja); los píxeles se pintan al pedirlos.
    const textures: Map<AnimName, Texture[]>[] = [];
    const column = new Map<AnimName, number>();
    let col = 0;
    for (const spec of anims) {
      column.set(spec.name, col);
      col += spec.frames;
    }
    DIRECTIONS.forEach((_dir, d) => {
      const byAnim = new Map<AnimName, Texture[]>();
      for (const spec of anims) {
        const c0 = column.get(spec.name)!;
        byAnim.set(
          spec.name,
          Array.from({ length: spec.frames }, (_, f) => new Texture({ source: base.source, frame: new Rectangle((c0 + f) * cell, d * cell, cell, cell) })),
        );
      }
      textures.push(byAnim);
    });
    const drawn = new Set<string>();
    const queued = new Set<string>();
    const draw = (d: number, anim: AnimName, f: number): boolean => {
      const k = `${d}:${anim}:${f}`;
      if (drawn.has(k)) return false;
      drawn.add(k);
      const r = renderFrame(type, player, anim, DIRECTIONS[d], f, look, job);
      ctx.putImageData(new ImageData(new Uint8ClampedArray(r.rgba), cell, cell), (column.get(anim)! + f) * cell, d * cell);
      return true;
    };
    const later = (d: number, anim: AnimName, f: number, urgent: boolean) => {
      const job = () => {
        if (draw(d, anim, f)) dirtySheets.add(base);
      };
      if (urgent) pending.unshift(job);
      else pending.push(job);
    };
    sheet = {
      canvas,
      textures,
      ensure(d, anim, f) {
        const spec = anims.find((a) => a.name === anim);
        if (!spec) return 0;
        if (f === undefined) {
          // La animación entera (la de morir, que se reproduce sola): el primer fotograma ya y los demás delante
          // de la cola, en orden. Pintarlos todos de golpe (unos 15 ms) daba un tirón en cada primera muerte.
          const qk = `${d}:${anim}`;
          if (!queued.has(qk)) {
            queued.add(qk);
            for (let i = spec.frames - 1; i >= 1; i--) later(d, anim, i, true);
          }
          if (draw(d, anim, 0)) dirtySheets.add(base);
          return 0;
        }
        const i = f % spec.frames;
        const qk = `${d}:${anim}`;
        if (!queued.has(qk)) {
          // Primera vez: este fotograma, ya (si queda tiempo en este fotograma de pantalla; si no, en el
          // siguiente: la unidad tarda un instante en aparecer, pero el juego no se para); el resto, en cola.
          queued.add(qk);
          // Los demás de esta animación, delante de la cola y en el orden en que se van a ver: la unidad los
          // necesita enseguida, y si no se mostraría el mismo fotograma una y otra vez (anda a saltos).
          for (let step = spec.frames - 1; step >= 1; step--) later(d, anim, (i + step) % spec.frames, true);
          if (syncSpent < SYNC_BUDGET_MS) {
            const t0 = performance.now();
            // La hoja se sube a la GPU una sola vez por fotograma de pantalla, en `pump`.
            if (draw(d, anim, i)) dirtySheets.add(base);
            syncSpent += performance.now() - t0;
          } else {
            later(d, anim, i, true);
          }
          return i;
        }
        if (drawn.has(`${d}:${anim}:${i}`)) return i;
        // Aún en cola: se adelanta y, mientras, se muestra el pintado más cercano.
        later(d, anim, i, true);
        for (let step = 1; step < spec.frames; step++) {
          const j = (i - step + spec.frames) % spec.frames;
          if (drawn.has(`${d}:${anim}:${j}`)) return j;
        }
        return i;
      },
    };
    sheets.set(key, sheet);
    return sheet;
  };

  /** Aspecto y oficio que de verdad cambian el dibujo (los que no, comparten hoja). */
  const variantOf = (type: UnitType, anim: AnimName, look: number, job: Job): [number, Job] => {
    if (overrides.has(type)) return [0, Job.None];
    const m = modelOf(type);
    return [lookOf(m, look), m.jobs && JOB_ANIMS.includes(anim) ? job : Job.None];
  };

  const ringCanvas = document.createElement('canvas');
  ringCanvas.width = RING_SMALL.w + RING_BIG.w + 2;
  ringCanvas.height = RING_BIG.h;
  const rctx = ringCanvas.getContext('2d');
  if (!rctx) throw new Error('No se pudo crear el contexto 2D para los anillos');
  const px = (x: number, y: number, c: string) => {
    rctx.fillStyle = c;
    rctx.fillRect(x, y, 1, 1);
  };
  drawRing(px, 0, 0, RING_SMALL.w, RING_SMALL.h);
  drawRing(px, RING_SMALL.w + 2, 0, RING_BIG.w, RING_BIG.h);
  const rings = Texture.from(ringCanvas);
  rings.source.scaleMode = 'nearest';
  const shadows = { small: shadowTexture(SHADOW_SMALL.w, SHADOW_SMALL.h), big: shadowTexture(SHADOW_BIG.w, SHADOW_BIG.h) };

  const art: UnitArt = {
    model: modelOf,
    frame(type, player, anim, dir, f, look = 0, job = Job.None) {
      const drawn = DRAWN[dir];
      const [lk, jb] = variantOf(type, anim, look, job);
      const sheet = sheetOf(type, clampPlayer(player), lk, jb);
      const d = DIRECTIONS.indexOf(drawn.dir);
      const shown: AnimName = sheet.textures[d].has(anim) ? anim : 'idle';
      const list = sheet.textures[d].get(shown)!;
      const i = sheet.ensure(d, shown, ((f % list.length) + list.length) % list.length);
      return { texture: list[i], flip: drawn.flip };
    },
    frames(type, player, anim, dir, look = 0) {
      const drawn = DRAWN[dir];
      const [lk] = variantOf(type, anim, look, Job.None);
      const sheet = sheetOf(type, clampPlayer(player), lk, Job.None);
      const d = DIRECTIONS.indexOf(drawn.dir);
      sheet.ensure(d, anim);
      const list = sheet.textures[d].get(anim) ?? [];
      return list.map((texture) => ({ texture, flip: drawn.flip }));
    },
    shadow(type) {
      return modelOf(type).bigRing ? shadows.big : shadows.small;
    },
    detail: UNIT_DETAIL,
    pump(budgetMs) {
      syncSpent = 0;
      const t0 = performance.now();
      while (pending.length > 0 && performance.now() - t0 < budgetMs) pending.shift()?.();
      for (const t of dirtySheets) t.source.update();
      dirtySheets.clear();
    },
    hasAnim(type, anim) {
      return modelOf(type).anims.some((a) => a.name === anim);
    },
    hitbox(type) {
      let hb = hitboxes.get(type);
      if (!hb) {
        const m = modelOf(type);
        const b = opaqueBounds(renderFrame(type, 0, 'idle', 'S', 0));
        const k = UNIT_DETAIL;
        hb = b ? { halfW: Math.max(3, Math.ceil((b.x1 - b.x0 + 1) / (2 * k)) - 1), height: Math.round(m.originY - b.y0 / k) } : { halfW: 6, height: 16 };
        hitboxes.set(type, hb);
      }
      return hb;
    },
    ringSmall: new Texture({ source: rings.source, frame: new Rectangle(0, 0, RING_SMALL.w, RING_SMALL.h) }),
    ringBig: new Texture({ source: rings.source, frame: new Rectangle(RING_SMALL.w + 2, 0, RING_BIG.w, RING_BIG.h) }),
    iconCanvas(type, player) {
      const key = `${type}:${player}`;
      let canvas = iconCanvases.get(key);
      if (!canvas) {
        const m = modelOf(type);
        const p = clampPlayer(player);
        // Retrato en su tarjeta: la figura generada en plano medio o entera; la de Aseprite, entera.
        let card: CardImage;
        if (overrides.has(type)) {
          card = backdrop('field');
          fitOnCard(card, () => renderFrame(type, p, 'idle', 'SW', 0));
        } else {
          card = unitCard(type, m, TEAM_COLORS[p]);
        }
        canvas = document.createElement('canvas');
        canvas.width = card.width;
        canvas.height = card.height;
        canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(card.rgba), card.width, card.height), 0, 0);
        iconCanvases.set(key, canvas);
      }
      return canvas;
    },
    icon(type, player) {
      const key = `${type}:${player}`;
      let url = icons.get(key);
      if (!url) {
        url = art.iconCanvas(type, player).toDataURL();
        icons.set(key, url);
      }
      return url;
    },
  };
  return art;
}

/** Recorta un fotograma de la hoja, centrado abajo en una celda cuadrada, y pone el color del equipo. */
function cut(pixels: ImageData, r: FrameRect, cell: number, ramp: readonly [string, string, string, string]): RasterResult {
  const rgba = new Uint8ClampedArray(cell * cell * 4);
  const ox = Math.floor((cell - r.w) / 2);
  const oy = cell - r.h;
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const s = ((r.y + y) * pixels.width + r.x + x) * 4;
      const d = ((oy + y) * cell + ox + x) * 4;
      rgba[d] = pixels.data[s];
      rgba[d + 1] = pixels.data[s + 1];
      rgba[d + 2] = pixels.data[s + 2];
      rgba[d + 3] = pixels.data[s + 3];
    }
  }
  return { width: cell, height: cell, rgba: recolorTeam(rgba, ramp) };
}

/** Elipse 2:1 de 1 píxel de grosor, en blanco para teñirla. */
function drawRing(px: (x: number, y: number, c: string) => void, ox: number, oy: number, w: number, h: number): void {
  const rx = w / 2;
  const ry = h / 2;
  const inside = (x: number, y: number, ax: number, ay: number) => {
    const nx = (x + 0.5 - rx) / ax;
    const ny = (y + 0.5 - ry) / ay;
    return nx * nx + ny * ny <= 1;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (inside(x, y, rx, ry) && !inside(x, y, rx - 1.5, ry - 1)) px(ox + x, oy + y, '#ffffff');
    }
  }
}

/** Sombra en el suelo: elipse 2:1 oscura y translúcida, más densa en el centro. */
function shadowTexture(w: number, h: number): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear el contexto 2D para las sombras');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x + 0.5 - w / 2) / (w / 2);
      const ny = (y + 0.5 - h / 2) / (h / 2);
      const d = nx * nx + ny * ny;
      if (d > 1) continue;
      ctx.fillStyle = d < 0.45 ? 'rgba(20,13,8,0.34)' : 'rgba(20,13,8,0.2)';
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const tex = Texture.from(canvas);
  tex.source.scaleMode = 'nearest';
  return tex;
}
