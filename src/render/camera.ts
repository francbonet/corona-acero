import type { Bounds, Point } from './iso';

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

/** Zoom inicial: el entero que más se acerca a mostrar 640×360 píxeles de mundo, con un mínimo de x2. */
export function defaultZoom(screenW: number, screenH: number): number {
  return clampZoom(Math.max(2, Math.floor(Math.min(screenW / 640, screenH / 360))));
}

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom)));
}

/**
 * Cámara 2D con zoom entero. (x, y) es el punto del mundo en el centro de la pantalla.
 * El desplazamiento se redondea a píxel de pantalla entero: cada píxel del arte sigue ocupando exactamente
 * zoom×zoom píxeles, pero la cámara se desliza de píxel en píxel de pantalla (no a saltos de `zoom`).
 */
export class Camera {
  x = 0;
  y = 0;
  zoom: number;
  private bounds: Bounds | null = null;

  constructor(zoom = 2) {
    this.zoom = clampZoom(zoom);
  }

  setBounds(bounds: Bounds | null): void {
    this.bounds = bounds;
    this.clamp();
  }

  centerOn(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.clamp();
  }

  pan(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
    this.clamp();
  }

  /** Posición en pantalla del origen del mundo (en píxeles enteros). */
  offset(screenW: number, screenH: number): Point {
    return {
      x: Math.round(screenW / 2) - Math.round(this.x * this.zoom),
      y: Math.round(screenH / 2) - Math.round(this.y * this.zoom),
    };
  }

  screenToWorld(sx: number, sy: number, screenW: number, screenH: number): Point {
    const o = this.offset(screenW, screenH);
    return { x: (sx - o.x) / this.zoom, y: (sy - o.y) / this.zoom };
  }

  /** Cambia el zoom manteniendo bajo el cursor el mismo punto del mundo. Devuelve `true` si el zoom cambió. */
  zoomAt(zoom: number, sx: number, sy: number, screenW: number, screenH: number): boolean {
    const z = clampZoom(zoom);
    if (z === this.zoom) return false;
    const anchor = this.screenToWorld(sx, sy, screenW, screenH);
    this.zoom = z;
    this.x = anchor.x - (sx - Math.round(screenW / 2)) / z;
    this.y = anchor.y - (sy - Math.round(screenH / 2)) / z;
    this.clamp();
    return true;
  }

  private clamp(): void {
    const b = this.bounds;
    if (!b) return;
    this.x = Math.min(b.maxX, Math.max(b.minX, this.x));
    this.y = Math.min(b.maxY, Math.max(b.minY, this.y));
  }
}
