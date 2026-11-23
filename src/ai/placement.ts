import { BUILDING_DEFS, type BuildingType } from '../data/buildings';
import { Comp } from '../sim/entities';
import type { Simulation } from '../sim/simulation';
import { canPlaceBuilding } from '../sim/world';

export interface SpotOptions {
  /** Casillas libres alrededor de la huella (para no tapar caminos). */
  readonly margin: number;
  readonly maxRadius?: number;
  readonly minRadius?: number;
  /** Evitar pegarse a árboles, minas y bayas (para no estorbar a los recolectores). */
  readonly avoidResources?: boolean;
}

/**
 * Primer hueco válido en espiral alrededor de (x, y) para un edificio centrado ahí.
 * Determinista: recorre siempre en el mismo orden.
 */
export function findSpot(sim: Simulation, type: BuildingType, x: number, y: number, o: SpotOptions): [number, number] | null {
  const size = BUILDING_DEFS[type].size;
  const grid = sim.grid;
  const e = sim.entities;
  const half = size >> 1;
  for (let r = o.minRadius ?? 0; r <= (o.maxRadius ?? 20); r++) {
    for (let cy = y - r; cy <= y + r; cy++) {
      for (let cx = x - r; cx <= x + r; cx++) {
        if (Math.max(Math.abs(cx - x), Math.abs(cy - y)) !== r) continue;
        const ox = cx - half;
        const oy = cy - half;
        if (!canPlaceBuilding(sim, type, ox, oy)) continue;
        let ok = true;
        const m = o.margin;
        for (let ty = oy - m; ty < oy + size + m && ok; ty++) {
          for (let tx = ox - m; tx < ox + size + m && ok; tx++) {
            if (tx >= ox && tx < ox + size && ty >= oy && ty < oy + size) continue;
            if (!grid.buildable(tx, ty)) ok = false;
          }
        }
        if (ok && o.avoidResources) {
          for (let ty = oy - 1; ty <= oy + size && ok; ty++) {
            for (let tx = ox - 1; tx <= ox + size && ok; tx++) {
              const occ = grid.occupantAt(tx, ty);
              if (occ && e.has(occ, Comp.Resource) && !e.has(occ, Comp.Building)) ok = false;
            }
          }
        }
        if (ok) return [ox, oy];
      }
    }
  }
  return null;
}
