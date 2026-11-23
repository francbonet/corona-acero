import { FP_SHIFT } from '../engine/fixed';

/**
 * Hash espacial de casillas para buscar vecinos cercanos en O(1) por celda.
 * Listas enlazadas en arrays tipados: se reconstruye cada tick sin generar basura.
 */
export class SpatialHash {
  private readonly head: Int32Array;
  private readonly links: Int32Array;

  constructor(
    readonly width: number,
    readonly height: number,
    capacity: number,
  ) {
    this.head = new Int32Array(width * height).fill(-1);
    this.links = new Int32Array(capacity).fill(-1);
  }

  clear(): void {
    this.head.fill(-1);
  }

  /** Inserta una entidad en la celda de su posición (punto fijo). */
  insert(id: number, x: number, y: number): void {
    const cx = Math.min(this.width - 1, Math.max(0, x >> FP_SHIFT));
    const cy = Math.min(this.height - 1, Math.max(0, y >> FP_SHIFT));
    const cell = cy * this.width + cx;
    this.links[id] = this.head[cell];
    this.head[cell] = id;
  }

  /** Primera entidad de la celda (cx, cy), o -1. Recorrer con `for (let id = first(cx, cy); id !== -1; id = next(id))`. */
  first(cx: number, cy: number): number {
    if (cx < 0 || cy < 0 || cx >= this.width || cy >= this.height) return -1;
    return this.head[cy * this.width + cx];
  }

  next(id: number): number {
    return this.links[id];
  }
}
