import type { Bounds } from '../render/iso';

export type PickKind = 'unit' | 'building' | 'node';

/** Algo clicable tal como se ve en pantalla, en píxeles de mundo. */
export interface PickTarget {
  readonly id: number;
  readonly kind: PickKind;
  /** Pies (unidades, fuentes) o centro de la base (edificios). */
  readonly x: number;
  readonly y: number;
  /** Caja del sprite sobre los pies. */
  readonly halfW: number;
  readonly height: number;
  /** Polígono convexo [x0, y0, x1, y1, …] (edificios): si existe, sustituye a la caja. */
  readonly poly?: readonly number[];
}

/** Margen bajo los pies que también cuenta como clic sobre la unidad. */
const FOOT_MARGIN = 3;
const PRIORITY: Readonly<Record<PickKind, number>> = { unit: 0, building: 1, node: 2 };

export function hits(t: PickTarget, wx: number, wy: number): boolean {
  if (t.poly) return insideConvex(t.poly, wx, wy);
  return Math.abs(wx - t.x) <= t.halfW && wy <= t.y + FOOT_MARGIN && wy >= t.y - t.height;
}

/**
 * Lo que hay bajo el punto (wx, wy). Las unidades tienen prioridad sobre edificios y estos sobre las fuentes
 * (como en los RTS clásicos: se puede seleccionar un aldeano aunque esté detrás de un árbol).
 * Entre dos del mismo tipo gana el de delante (pies más abajo).
 */
export function pickAt(targets: readonly PickTarget[], wx: number, wy: number): PickTarget | null {
  let best: PickTarget | null = null;
  for (const t of targets) {
    if (!hits(t, wx, wy)) continue;
    if (
      !best ||
      PRIORITY[t.kind] < PRIORITY[best.kind] ||
      (PRIORITY[t.kind] === PRIORITY[best.kind] && (t.y > best.y || (t.y === best.y && t.id > best.id)))
    ) {
      best = t;
    }
  }
  return best;
}

/** Unidades cuyo cuerpo (el centro del sprite) cae dentro del rectángulo, en orden de id. */
export function pickInRect(targets: readonly PickTarget[], rect: Bounds): number[] {
  return targets
    .filter((t) => {
      if (t.kind !== 'unit') return false;
      const cy = t.y - t.height / 2;
      return t.x >= rect.minX && t.x <= rect.maxX && cy >= rect.minY && cy <= rect.maxY;
    })
    .map((t) => t.id)
    .sort((a, b) => a - b);
}

/** Punto dentro de un polígono convexo (vértices en cualquier sentido). */
export function insideConvex(poly: readonly number[], x: number, y: number): boolean {
  let sign = 0;
  const n = poly.length / 2;
  for (let i = 0; i < n; i++) {
    const x1 = poly[i * 2];
    const y1 = poly[i * 2 + 1];
    const x2 = poly[((i + 1) % n) * 2];
    const y2 = poly[((i + 1) % n) * 2 + 1];
    const cross = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1);
    if (cross === 0) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}
