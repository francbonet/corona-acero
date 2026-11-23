import { type Face, type MatToken, NONE, type P3, type Paint } from './iso-raster';
import { noise as noise01 } from './patterns';

/**
 * Piezas para modelar edificios: cajas, tejados a dos y cuatro aguas, pirámides, torres poligonales,
 * conos, almenas, estandartes… Cada pieza es un sólido convexo (no se hace sombra a sí mismo).
 *
 * Coordenadas: x e y por los ejes de la rejilla (16 unidades = 1 casilla), z hacia arriba en píxeles.
 * Las caras que se ven son las de arriba, la izquierda (+y) y la derecha (+x).
 *
 * `limit` corta lo que esté por encima de una altura (edificios a medio levantar): las cajas se recortan
 * y se tapan con su sección, y los tejados y adornos que no quepan enteros no se ponen.
 */

/**
 * Lo que se anima aparte del edificio: humo de chimenea, banderas que ondean y aspas de molino.
 * `p` es el punto en el modelo (la boca de la chimenea, lo alto del mástil, el eje de las aspas).
 */
export interface Emitter {
  readonly kind: 'smoke' | 'flag' | 'sails';
  readonly p: P3;
  /** Tamaño de la tela (banderas). */
  readonly w?: number;
  readonly h?: number;
}

/** Material de una superficie: un material liso o uno con dibujo. */
export type Surface = MatToken | { readonly mat: MatToken; readonly paint?: Paint };

/** Paredes de una caja: la misma para todas o distinta a la izquierda (+y) y a la derecha (+x). */
export type Walls = Surface | { readonly left: Surface; readonly right: Surface };

/** Superficies de la pared izquierda y la derecha. */
function sides(w: Walls): [Surface, Surface] {
  if (typeof w === 'object' && 'left' in w) return [w.left, w.right];
  return [w as Surface, w as Surface];
}
const matOf = (s: Surface): MatToken => (typeof s === 'string' ? s : s.mat);
const paintOf = (s: Surface): Paint | undefined => (typeof s === 'string' ? undefined : s.paint);

export interface PieceOptions {
  /** No arroja sombra (piezas muy finas). */
  readonly noShadow?: boolean;
  /** Se pinta por delante de lo que esté en el mismo plano. */
  readonly bias?: number;
  /** Ignora el corte de obra (andamios, suelo). */
  readonly always?: boolean;
  /** Adorno (mástiles, andamios): no cuenta para la altura del edificio. */
  readonly decor?: boolean;
}

export class Builder {
  readonly faces: Face[] = [];
  private solids = 0;
  /** Altura de la parte principal (para las obras y la barra de vida). */
  eave = 0;
  /** Punto más alto de la parte principal, sin mástiles. */
  top = 0;

  /** Emisores de lo que se anima aparte (solo en el edificio terminado). */
  readonly emitters: Emitter[] = [];
  /**
   * Edificio animado: las banderas y las aspas no se pintan, se dejan como emisores para dibujarlas
   * encima con sus fotogramas. Sin animar (iconos), se pintan quietas.
   */
  animated = false;

  /** Rectángulo de la parte principal (andamios, cimientos y escombros se ponen alrededor). */
  mainRect: readonly [number, number, number, number] = [0, 0, 0, 0];

  /**
   * @param limit altura de corte de las obras.
   * @param ruin si es una ruina: los muros cortados quedan con el borde irregular.
   */
  constructor(
    readonly limit = Infinity,
    readonly ruin = false,
  ) {}

  /** Declara la parte principal del edificio y la altura de sus muros. */
  main(x0: number, y0: number, x1: number, y1: number, eave: number): void {
    this.mainRect = [x0, y0, x1, y1];
    this.eave = eave;
  }

  private solid(): number {
    return this.solids++;
  }

  private push(f: Omit<Face, 'solid'>, solid: number, o?: PieceOptions): void {
    this.faces.push({ ...f, solid, noShadow: o?.noShadow ?? f.noShadow, bias: o?.bias ?? f.bias });
  }

  /** Lleva la cuenta de la altura de la masa principal. */
  mass(z: number): void {
    this.top = Math.max(this.top, z);
  }

  /** Suelo plano (explanada, surcos): sin contorno ni sombra propia. */
  ground(pts: readonly P3[], s: Surface, bias = 0): void {
    this.faces.push({ pts, mat: matOf(s), paint: paintOf(s), solid: -1, ground: true, bias, frame: groundFrame(pts) });
  }

  /** Rectángulo de suelo. */
  groundRect(x0: number, y0: number, x1: number, y1: number, s: Surface, z = 0, bias = 0): void {
    this.ground(
      [
        [x0, y0, z],
        [x1, y0, z],
        [x1, y1, z],
        [x0, y1, z],
      ],
      s,
      bias,
    );
  }

  /** Caja alineada con la rejilla. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, walls: Walls, top?: Surface, o?: PieceOptions): void {
    const limit = o?.always ? Infinity : this.limit;
    if (z0 >= limit || x1 <= x0 || y1 <= y0) return;
    // En obra, lo que llega justo a la altura de corte también queda abierto (muros sin tejado).
    const cut = z1 > limit || (limit !== Infinity && z1 >= limit - 0.01);
    const zt = Math.min(z1, limit);
    const [left, right] = sides(walls);
    if (!o?.decor) this.mass(zt);
    // Las cajas grandes a medio levantar (o en ruinas) se ven huecas: muros con su grosor y el suelo dentro.
    if (cut && x1 - x0 >= 8 && y1 - y0 >= 8 && z0 <= 0.01) {
      this.shell(x0, y0, z0, x1, y1, zt, z1 - z0, left, right, o);
      return;
    }
    const topS: Surface = cut ? { mat: `${matOf(left)}-` } : (top ?? left);
    const id = this.solid();
    const h = zt - z0;
    // Arriba.
    this.push(
      {
        pts: [
          [x0, y0, zt],
          [x1, y0, zt],
          [x1, y1, zt],
          [x0, y1, zt],
        ],
        mat: matOf(topS),
        paint: paintOf(topS),
        frame: { o: [x0, y1, zt], du: [1, 0, 0], dv: [0, -1, 0], w: x1 - x0, h: y1 - y0 },
      },
      id,
      o,
    );
    if (h <= 0) return;
    this.walls(x0, y0, z0, x1, y1, zt, z1 - z0, left, right, id, o);
  }

  /** Paredes de delante (izquierda y derecha) y la de detrás que solo da sombra. */
  private walls(x0: number, y0: number, z0: number, x1: number, y1: number, zt: number, fullH: number, left: Surface, right: Surface, id: number, o?: PieceOptions, jag?: (u: number, side: number) => number): void {
    const cutPaint = (s: Surface, side: number): Paint | undefined => {
      const base = paintOf(s);
      if (!jag) return base;
      return (at) => (at.v > jag(at.u, side) ? NONE : base?.(at));
    };
    // Izquierda (+y): u crece hacia la esquina de delante.
    this.push(
      {
        pts: [
          [x0, y1, z0],
          [x1, y1, z0],
          [x1, y1, zt],
          [x0, y1, zt],
        ],
        mat: matOf(left),
        paint: cutPaint(left, 1),
        frame: { o: [x0, y1, z0], du: [1, 0, 0], dv: [0, 0, 1], w: x1 - x0, h: fullH },
      },
      id,
      o,
    );
    // Derecha (+x): u crece desde la esquina de delante hacia la del fondo.
    this.push(
      {
        pts: [
          [x1, y1, z0],
          [x1, y0, z0],
          [x1, y0, zt],
          [x1, y1, zt],
        ],
        mat: matOf(right),
        paint: cutPaint(right, 2),
        frame: { o: [x1, y1, z0], du: [0, -1, 0], dv: [0, 0, 1], w: y1 - y0, h: fullH },
      },
      id,
      o,
    );
    // Detrás (solo sombra).
    this.push(
      {
        pts: [
          [x0, y0, z0],
          [x0, y1, z0],
          [x0, y1, zt],
          [x0, y0, zt],
        ],
        mat: matOf(left),
        shadowOnly: true,
      },
      id,
      o,
    );
  }

  /** Caja hueca: muros de 2 de grosor cortados a `zt` (irregulares si es una ruina) y el suelo de dentro. */
  private shell(x0: number, y0: number, z0: number, x1: number, y1: number, zt: number, fullH: number, left: Surface, right: Surface, o?: PieceOptions): void {
    const t = 2;
    const h = zt - z0;
    const seed = Math.round(x0 * 7 + y0 * 13 + x1 * 3);
    const jag = this.ruin ? (u: number, side: number) => h * (0.25 + 0.75 * noise01(u / 2.5, side, seed)) : undefined;
    // Suelo de tierra con las viguetas.
    this.ground(
      [
        [x0 + t, y0 + t, z0 + 0.05],
        [x1 - t, y0 + t, z0 + 0.05],
        [x1 - t, y1 - t, z0 + 0.05],
        [x0 + t, y1 - t, z0 + 0.05],
      ],
      { mat: 'soil', paint: this.ruin ? ({ u, v }) => (noise01(u / 2, v / 2, seed) < 0.3 ? 'soil-' : undefined) : ({ u }) => (u % 6 < 1.2 ? 'plank' : undefined) },
      0.1,
    );
    // Caras de dentro de los muros del fondo (miran hacia delante).
    const innerL = { mat: `${matOf(left)}-`, paint: paintOf(left) } as const;
    const innerR = { mat: `${matOf(right)}-`, paint: paintOf(right) } as const;
    const back = this.solid();
    this.push(
      {
        pts: [
          [x0 + t, y0 + t, z0],
          [x1, y0 + t, z0],
          [x1, y0 + t, zt],
          [x0 + t, y0 + t, zt],
        ],
        mat: innerL.mat,
        paint: jag ? (at) => (at.v > jag(at.u + 50, 3) ? NONE : innerL.paint?.(at)) : innerL.paint,
        frame: { o: [x0 + t, y0 + t, z0], du: [1, 0, 0], dv: [0, 0, 1], w: x1 - x0 - t, h: fullH },
      },
      back,
      o,
    );
    const back2 = this.solid();
    this.push(
      {
        pts: [
          [x0 + t, y1, z0],
          [x0 + t, y0 + t, z0],
          [x0 + t, y0 + t, zt],
          [x0 + t, y1, zt],
        ],
        mat: innerR.mat,
        paint: jag ? (at) => (at.v > jag(at.u + 90, 4) ? NONE : innerR.paint?.(at)) : innerR.paint,
        frame: { o: [x0 + t, y1, z0], du: [0, -1, 0], dv: [0, 0, 1], w: y1 - y0 - t, h: fullH },
      },
      back2,
      o,
    );
    // Remate de los muros (solo en las obras: en las ruinas el borde es irregular).
    if (!jag) {
      const rim = this.solid();
      const top: Paint = ({ u, v, w, h: d }) => (u < t || v < t || u > w - t || v > d - t ? undefined : NONE);
      this.push(
        {
          pts: [
            [x0, y0, zt],
            [x1, y0, zt],
            [x1, y1, zt],
            [x0, y1, zt],
          ],
          mat: matOf(left),
          paint: top,
          frame: { o: [x0, y1, zt], du: [1, 0, 0], dv: [0, -1, 0], w: x1 - x0, h: y1 - y0 },
        },
        rim,
        { ...o, noShadow: true },
      );
    }
    this.walls(x0, y0, z0, x1, y1, zt, fullH, left, right, this.solid(), o, jag);
  }

  /**
   * Tejado a dos aguas sobre el rectángulo, con la cumbrera a lo largo de `axis` y alero `oh`.
   * `ends` pinta los hastiales (los triángulos de las puntas).
   */
  gable(x0: number, y0: number, x1: number, y1: number, z: number, h: number, axis: 'x' | 'y', roof: Surface, ends: Surface, oh = 1.5, o?: PieceOptions): void {
    if (z + h > this.limit && !o?.always) return;
    this.mass(z + h);
    const id = this.solid();
    const rm = matOf(roof);
    const rp = paintOf(roof);
    if (axis === 'x') {
      const ym = (y0 + y1) / 2;
      const half = (y1 - y0) / 2;
      const dz = (oh * h) / half;
      const a0 = x0 - oh;
      const a1 = x1 + oh;
      // Faldón de delante (+y) y de detrás (−y).
      const front: P3[] = [
        [a0, y1 + oh, z - dz],
        [a1, y1 + oh, z - dz],
        [a1, ym, z + h],
        [a0, ym, z + h],
      ];
      const back: P3[] = [
        [a0, y0 - oh, z - dz],
        [a1, y0 - oh, z - dz],
        [a1, ym, z + h],
        [a0, ym, z + h],
      ];
      const slope = Math.hypot(half + oh, h + dz);
      this.push({ pts: front, mat: rm, paint: rp, frame: { o: front[0], du: [1, 0, 0], dv: unit(sub3(front[3], front[0])), w: a1 - a0, h: slope } }, id, o);
      this.push({ pts: back, mat: rm, paint: rp, frame: { o: back[0], du: [1, 0, 0], dv: unit(sub3(back[3], back[0])), w: a1 - a0, h: slope } }, id, o);
      // Hastial de la derecha (+x) y el de detrás (solo sombra).
      const end: P3[] = [
        [x1, y1, z],
        [x1, y0, z],
        [x1, ym, z + h],
      ];
      this.push({ pts: end, mat: matOf(ends), paint: paintOf(ends), frame: { o: [x1, y1, z], du: [0, -1, 0], dv: [0, 0, 1], w: y1 - y0, h } }, id, o);
      this.push({ pts: end.map((p) => [x0, p[1], p[2]] as P3), mat: matOf(ends), shadowOnly: true }, id, o);
    } else {
      const xm = (x0 + x1) / 2;
      const half = (x1 - x0) / 2;
      const dz = (oh * h) / half;
      const a0 = y0 - oh;
      const a1 = y1 + oh;
      // Faldón de la derecha (+x) y el de detrás a la izquierda (−x).
      const front: P3[] = [
        [x1 + oh, a1, z - dz],
        [x1 + oh, a0, z - dz],
        [xm, a0, z + h],
        [xm, a1, z + h],
      ];
      const back: P3[] = [
        [x0 - oh, a1, z - dz],
        [x0 - oh, a0, z - dz],
        [xm, a0, z + h],
        [xm, a1, z + h],
      ];
      const slope = Math.hypot(half + oh, h + dz);
      this.push({ pts: front, mat: rm, paint: rp, frame: { o: front[0], du: [0, -1, 0], dv: unit(sub3(front[3], front[0])), w: a1 - a0, h: slope } }, id, o);
      this.push({ pts: back, mat: rm, paint: rp, frame: { o: back[0], du: [0, -1, 0], dv: unit(sub3(back[3], back[0])), w: a1 - a0, h: slope } }, id, o);
      // Hastial de la izquierda (+y).
      const end: P3[] = [
        [x0, y1, z],
        [x1, y1, z],
        [xm, y1, z + h],
      ];
      this.push({ pts: end, mat: matOf(ends), paint: paintOf(ends), frame: { o: [x0, y1, z], du: [1, 0, 0], dv: [0, 0, 1], w: x1 - x0, h } }, id, o);
      this.push({ pts: end.map((p) => [p[0], y0, p[2]] as P3), mat: matOf(ends), shadowOnly: true }, id, o);
    }
  }

  /** Tejado a cuatro aguas (o pirámide si es cuadrado), con alero `oh`. */
  hip(x0: number, y0: number, x1: number, y1: number, z: number, h: number, roof: Surface, oh = 1.5, o?: PieceOptions): void {
    if (z + h > this.limit && !o?.always) return;
    this.mass(z + h);
    const id = this.solid();
    const rm = matOf(roof);
    const rp = paintOf(roof);
    const w = x1 - x0;
    const d = y1 - y0;
    const half = Math.min(w, d) / 2;
    const dz = (oh * h) / half;
    const e0: P3 = [x0 - oh, y0 - oh, z - dz];
    const e1: P3 = [x1 + oh, y0 - oh, z - dz];
    const e2: P3 = [x1 + oh, y1 + oh, z - dz];
    const e3: P3 = [x0 - oh, y1 + oh, z - dz];
    let r0: P3;
    let r1: P3;
    if (w >= d) {
      const ym = (y0 + y1) / 2;
      r0 = [x0 + half, ym, z + h];
      r1 = [x1 - half, ym, z + h];
    } else {
      const xm = (x0 + x1) / 2;
      r0 = [xm, y0 + half, z + h];
      r1 = [xm, y1 - half, z + h];
    }
    const slope = Math.hypot(half + oh, h + dz);
    const roofFace = (pts: P3[], origin: P3, du: P3, width: number, toward: P3) => {
      const along = sub3(toward, origin);
      const t = along[0] * du[0] + along[1] * du[1] + along[2] * du[2];
      const perp: P3 = [along[0] - du[0] * t, along[1] - du[1] * t, along[2] - du[2] * t];
      this.push({ pts, mat: rm, paint: rp, frame: { o: origin, du, dv: unit(perp), w: width, h: slope } }, id, o);
    };
    if (w >= d) {
      roofFace([e3, e2, r1, r0], e3, [1, 0, 0], w + 2 * oh, r0); // delante (+y)
      roofFace([e0, e1, r1, r0], e1, [-1, 0, 0], w + 2 * oh, r1); // detrás
      roofFace([e2, e1, r1], e2, [0, -1, 0], d + 2 * oh, r1); // derecha (+x)
      roofFace([e3, e0, r0], e0, [0, 1, 0], d + 2 * oh, r0); // izquierda detrás
    } else {
      roofFace([e2, e1, r0, r1], e2, [0, -1, 0], d + 2 * oh, r1); // derecha (+x)
      roofFace([e3, e0, r0, r1], e0, [0, 1, 0], d + 2 * oh, r0); // izquierda detrás
      roofFace([e3, e2, r1], e3, [1, 0, 0], w + 2 * oh, r1); // delante (+y)
      roofFace([e0, e1, r0], e1, [-1, 0, 0], w + 2 * oh, r0); // detrás
    }
  }

  /** Prisma de `sides` lados (torres redondas o poligonales) con su tapa arriba. */
  prism(cx: number, cy: number, r: number, sides: number, z0: number, z1: number, walls: Surface, top?: Surface, o?: PieceOptions): void {
    const limit = o?.always ? Infinity : this.limit;
    if (z0 >= limit) return;
    const cut = z1 > limit;
    const zt = cut ? limit : z1;
    const id = this.solid();
    const ring = polygon(cx, cy, r, sides);
    const side = 2 * r * Math.sin(Math.PI / sides);
    // Las caras se numeran de izquierda a derecha en pantalla para que el dibujo continúe de una a otra.
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % sides];
      const du = unit([b[0] - a[0], b[1] - a[1], 0]);
      // Posición en pantalla del borde izquierdo de la cara, para que el dibujo siga de una cara a otra.
      const left = Math.min(a[0] - a[1], b[0] - b[1]) - (cx - cy) + 2 * r;
      const flip = du[0] - du[1] < 0;
      const o0: P3 = flip ? [b[0], b[1], z0] : [a[0], a[1], z0];
      this.push(
        {
          pts: [
            [a[0], a[1], z0],
            [b[0], b[1], z0],
            [b[0], b[1], zt],
            [a[0], a[1], zt],
          ],
          mat: matOf(walls),
          paint: shiftPaint(paintOf(walls), left),
          frame: { o: o0, du: flip ? [-du[0], -du[1], 0] : du, dv: [0, 0, 1], w: side, h: z1 - z0 },
        },
        id,
        o,
      );
    });
    const topS: Surface = cut ? { mat: `${matOf(walls)}-` } : (top ?? walls);
    this.push({ pts: ring.map((p) => [p[0], p[1], zt] as P3), mat: matOf(topS), paint: paintOf(topS) }, id, o);
  }

  /** Cono o chapitel poligonal de `sides` lados (con alero `oh`). */
  cone(cx: number, cy: number, r: number, sides: number, z: number, h: number, roof: Surface, oh = 1, o?: PieceOptions): void {
    if (z + h > this.limit && !o?.always) return;
    this.mass(z + h);
    const id = this.solid();
    const ring = polygon(cx, cy, r + oh, sides);
    const apex: P3 = [cx, cy, z + h];
    const dz = (oh * h) / r;
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % sides];
      const pa: P3 = [a[0], a[1], z - dz];
      const pb: P3 = [b[0], b[1], z - dz];
      const du = unit([b[0] - a[0], b[1] - a[1], 0]);
      const flip = du[0] - du[1] < 0;
      const o0 = flip ? pb : pa;
      const mid: P3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z - dz];
      this.push(
        {
          pts: [pa, pb, apex],
          mat: matOf(roof),
          paint: paintOf(roof),
          frame: { o: o0, du: flip ? [-du[0], -du[1], 0] : du, dv: unit(sub3(apex, mid)), w: Math.hypot(b[0] - a[0], b[1] - a[1]), h: Math.hypot(r + oh, h + dz) },
        },
        id,
        o,
      );
    });
  }

  /** Pirámide de base rectangular (chapiteles cuadrados, tejadillos). */
  pyramid(x0: number, y0: number, x1: number, y1: number, z: number, h: number, roof: Surface, oh = 1, o?: PieceOptions): void {
    this.hip(x0, y0, x1, y1, z, h, roof, oh, o);
  }

  /**
   * Almenas a lo largo de un tramo recto a la altura z: merlones de `w` de ancho cada `step`, de `d` de
   * grosor y `h` de alto. `stepped` (mudéjar) les pone un remate escalonado.
   */
  merlons(ax: number, ay: number, bx: number, by: number, z: number, s: Surface, w = 3, step = 5, d = 2, h = 3, stepped = false): void {
    if (z + h > this.limit) return;
    const len = Math.hypot(bx - ax, by - ay);
    const count = Math.max(1, Math.floor((len + step - w) / step));
    const used = (count - 1) * step + w;
    const start = (len - used) / 2;
    const dx = (bx - ax) / len;
    const dy = (by - ay) / len;
    for (let i = 0; i < count; i++) {
      const t = start + i * step;
      const cx = ax + dx * (t + w / 2);
      const cy = ay + dy * (t + w / 2);
      const hx = Math.abs(dx) * w + Math.abs(dy) * d;
      const hy = Math.abs(dy) * w + Math.abs(dx) * d;
      this.box(cx - hx / 2, cy - hy / 2, z, cx + hx / 2, cy + hy / 2, z + h, s);
      if (stepped) this.box(cx - hx / 4, cy - hy / 4, z + h, cx + hx / 4, cy + hy / 4, z + h + 1.5, s);
    }
    this.mass(z + h + (stepped ? 1.5 : 0));
  }

  /** Almenas alrededor de un rectángulo (la cara de fuera queda a ras de los bordes). */
  merlonRing(x0: number, y0: number, x1: number, y1: number, z: number, s: Surface, w = 3, step = 5, d = 2, h = 3, stepped = false): void {
    const m = d / 2;
    this.merlons(x0, y1 - m, x1, y1 - m, z, s, w, step, d, h, stepped); // delante izquierda
    this.merlons(x1 - m, y1, x1 - m, y0, z, s, w, step, d, h, stepped); // delante derecha
    this.merlons(x0, y0 + m, x1, y0 + m, z, s, w, step, d, h, stepped);
    this.merlons(x0 + m, y1, x0 + m, y0, z, s, w, step, d, h, stepped);
  }

  /** Mástil con bandera del equipo, orientada hacia la izquierda de la pantalla (plano x-z). */
  flag(x: number, y: number, z: number, pole = 9, w = 5, h = 4): void {
    if (this.limit !== Infinity) return;
    this.box(x - 0.5, y - 0.5, z, x + 0.5, y + 0.5, z + pole, 'timber', undefined, { decor: true });
    const top = z + pole - 0.5;
    if (this.animated) {
      this.emitters.push({ kind: 'flag', p: [x + 0.5, y, top], w, h });
      return;
    }
    const cloth: P3[] = [
      [x + 0.5, y, top],
      [x + 0.5 + w, y, top - 0.5],
      [x + 0.5 + w, y, top - h - 0.5],
      [x + 0.5, y, top - h],
    ];
    this.push(
      {
        pts: cloth,
        mat: 'team',
        paint: ({ u, v, h: fh }) => (v > fh - 1 ? 'teamDark' : u < 1 ? 'team-' : undefined),
        frame: { o: cloth[3], du: [1, 0, 0], dv: [0, 0, 1], w, h },
      },
      this.solid(),
      { noShadow: true },
    );
  }

  /** Banderola colgada de una pared (plano de la pared izquierda, +y), con una franja. */
  banner(x: number, y: number, z: number, w = 4, h = 7): void {
    if (this.limit !== Infinity) return;
    const pts: P3[] = [
      [x, y, z],
      [x + w, y, z],
      [x + w, y, z + h],
      [x, y, z + h],
    ];
    this.push(
      {
        pts,
        mat: 'team',
        paint: ({ u, v, w: fw }) => (v < 1.5 && Math.abs(u - fw / 2) > (1.5 - v) * 1.2 ? 'void' : v > h - 1 ? 'gold' : Math.abs(u - fw / 2) < 0.6 ? 'teamDark' : undefined),
        frame: { o: pts[0], du: [1, 0, 0], dv: [0, 0, 1], w, h },
        bias: 0.3,
      },
      this.solid(),
      { noShadow: true },
    );
  }

  /** Cara suelta (toldos, aspas, tablones): polígono convexo cualquiera. */
  quad(pts: readonly P3[], s: Surface, o?: PieceOptions & { frame?: Face['frame'] }): void {
    if (!o?.always && pts.some((p) => p[2] > this.limit)) return;
    this.push({ pts, mat: matOf(s), paint: paintOf(s), frame: o?.frame }, this.solid(), o);
  }

  /** Viga o palo entre dos puntos, de sección `t` (caja orientada aproximada por sus 3 caras visibles). */
  beam(a: P3, b: P3, t: number, s: Surface, o?: PieceOptions & { readonly ends?: MatToken }): void {
    if (!o?.always && Math.max(a[2], b[2]) > this.limit) return;
    const d = sub3(b, a);
    const len = Math.hypot(d[0], d[1], d[2]);
    if (len < 1e-6) return;
    const dir = unit(d);
    // Dos ejes perpendiculares al palo.
    const ref: P3 = Math.abs(dir[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const p1 = unit(cross3(dir, ref));
    const p2 = unit(cross3(dir, p1));
    const id = this.solid();
    const hw = t / 2;
    const corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    const at = (base: P3, i: number): P3 => {
      const [s1, s2] = corners[i];
      return [base[0] + (p1[0] * s1 + p2[0] * s2) * hw, base[1] + (p1[1] * s1 + p2[1] * s2) * hw, base[2] + (p1[2] * s1 + p2[2] * s2) * hw];
    };
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      this.push({ pts: [at(a, i), at(a, j), at(b, j), at(b, i)], mat: matOf(s), paint: paintOf(s) }, id, o);
    }
    this.push({ pts: [0, 1, 2, 3].map((i) => at(b, i)), mat: o?.ends ?? matOf(s) }, id, o);
    this.push({ pts: [0, 1, 2, 3].map((i) => at(a, i)), mat: o?.ends ?? matOf(s) }, id, o);
  }
}

// ── Utilidades ─────────────────────────────────────────────────────────

function sub3(a: P3, b: P3): P3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross3(a: P3, b: P3): P3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function unit(a: P3): P3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

/** Vértices de un polígono regular alrededor de (cx, cy), girado medio lado para que ninguna cara quede de canto. */
function polygon(cx: number, cy: number, r: number, sides: number): [number, number][] {
  const out: [number, number][] = [];
  const offset = Math.PI / sides + Math.PI / 4;
  for (let i = 0; i < sides; i++) {
    const a = offset + (i * 2 * Math.PI) / sides;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

/** Desplaza el dibujo de una cara de torre para que las hiladas no empiecen todas igual. */
function shiftPaint(paint: Paint | undefined, offset: number): Paint | undefined {
  if (!paint) return undefined;
  return (at) => paint({ ...at, u: at.u + offset });
}

/** Marco de pintado del suelo: u por x, v por y (para baldosas y surcos alineados con la rejilla). */
function groundFrame(pts: readonly P3[]): Face['frame'] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p[0]);
    y0 = Math.min(y0, p[1]);
    x1 = Math.max(x1, p[0]);
    y1 = Math.max(y1, p[1]);
  }
  return { o: [x0, y0, pts[0][2]], du: [1, 0, 0], dv: [0, 1, 0], w: x1 - x0, h: y1 - y0 };
}
