import { FP_SHIFT } from '../engine/fixed';
import { Comp } from './entities';
import { MAX_PLAYERS } from './players';
import type { Simulation } from './simulation';

/** Cada cuántos ticks se recalcula lo que ve cada jugador. */
export const VISION_EVERY = 4;

/**
 * Niebla de guerra por jugador, en tres estados por casilla: sin explorar, explorada (se vio alguna vez)
 * y visible ahora. Vive en la simulación para que la IA también la respete; es determinista
 * porque solo depende de las posiciones.
 */
export class Visibility {
  private readonly visible: (Uint8Array | null)[] = new Array(MAX_PLAYERS).fill(null);
  private readonly explored: (Uint8Array | null)[] = new Array(MAX_PLAYERS).fill(null);
  private readonly discs = new Map<number, readonly number[]>();

  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  isVisible(player: number, x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    return (this.visible[player]?.[y * this.width + x] ?? 0) === 1;
  }

  isExplored(player: number, x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    return (this.explored[player]?.[y * this.width + x] ?? 0) === 1;
  }

  /** Arrays crudos del jugador (para el render y el minimapa). */
  layers(player: number): { visible: Uint8Array; explored: Uint8Array } {
    return { visible: this.layer(this.visible, player), explored: this.layer(this.explored, player) };
  }

  /** Revela todo el mapa a un jugador (escenarios, pruebas). */
  revealAll(player: number): void {
    this.layer(this.explored, player).fill(1);
  }

  update(sim: Simulation): void {
    const e = sim.entities;
    for (const v of this.visible) v?.fill(0);
    for (let id = 1; id < e.highWater; id++) {
      const m = e.mask[id];
      if ((m & Comp.Position) === 0 || (m & (Comp.Unit | Comp.Building)) === 0) continue;
      const owner = e.owner[id];
      if (owner === 0 || e.los[id] === 0) continue;
      const size = e.size[id];
      const cx = size > 0 ? e.tileX[id] + (size >> 1) : e.x[id] >> FP_SHIFT;
      const cy = size > 0 ? e.tileY[id] + (size >> 1) : e.y[id] >> FP_SHIFT;
      this.stamp(owner, cx, cy, e.los[id] + (size >> 1));
    }
  }

  private layer(list: (Uint8Array | null)[], player: number): Uint8Array {
    let a = list[player];
    if (!a) {
      a = new Uint8Array(this.width * this.height);
      list[player] = a;
    }
    return a;
  }

  /** Marca como visible (y explorado) un círculo de radio r casillas. */
  private stamp(player: number, cx: number, cy: number, r: number): void {
    const visible = this.layer(this.visible, player);
    const explored = this.layer(this.explored, player);
    for (const offset of this.disc(r)) {
      const x = cx + (offset >> 16) - 128;
      const y = cy + (offset & 0xffff) - 128;
      if (x < 0 || y < 0 || x >= this.width || y >= this.height) continue;
      const i = y * this.width + x;
      visible[i] = 1;
      explored[i] = 1;
    }
  }

  /** Desplazamientos de un círculo de radio r, empaquetados como ((dx+128) << 16) | (dy+128). */
  private disc(r: number): readonly number[] {
    let d = this.discs.get(r);
    if (!d) {
      const out: number[] = [];
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + r) out.push(((dx + 128) << 16) | (dy + 128));
      }
      d = out;
      this.discs.set(r, d);
    }
    return d;
  }
}
