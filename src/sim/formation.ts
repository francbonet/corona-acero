import { UNIT_DEFS, type UnitType } from '../data/units';
import { FP_ONE, FP_SHIFT, fixedLength, idiv, isqrt, tileCenterFixed } from '../engine/fixed';
import { attackOf } from './combat';
import { Comp } from './entities';
import type { Simulation } from './simulation';
import { nearestPassableTiles } from './slots';

/**
 * Formación de un grupo que marcha (mover o ataque-mover): mira hacia donde va, con el cuerpo a cuerpo delante,
 * los tiradores detrás y el asedio, los monjes y los aldeanos al final. Cada fila se reparte de izquierda a
 * derecha según donde está cada unidad, para que nadie cruce por delante de otra al formar.
 */

/** Separación entre puestos (casi una casilla). */
const SPACING = 230;
/** Unidades por fila: entre 3 y 10, según el tamaño del grupo. */
const MIN_COLS = 3;
const MAX_COLS = 10;
/** Por debajo de esta distancia al destino no se forma (el grupo ya está allí): se reparten como siempre. */
const MIN_MARCH = 3 * FP_ONE;

/** Fila de cada unidad: 0 cuerpo a cuerpo, 1 a distancia, 2 el resto (asedio, monjes, aldeanos, carros). */
export function formationRank(sim: Simulation, id: number): 0 | 1 | 2 {
  const e = sim.entities;
  const def = UNIT_DEFS[e.unitType[id] as UnitType];
  if ((e.mask[id] & Comp.Worker) !== 0 || def.trader || def.monk || def.classes.includes('siege')) return 2;
  const attack = attackOf(sim, id);
  if (!attack) return 2;
  return attack.range > 0 ? 1 : 0;
}

/** El grupo forma si son al menos 4 y la mayoría lleva armas. */
export function wantsFormation(sim: Simulation, ids: readonly number[]): boolean {
  if (ids.length < 4) return false;
  let armed = 0;
  for (const id of ids) if (formationRank(sim, id) < 2) armed++;
  return armed * 2 > ids.length;
}

export interface FormationGoal {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

/**
 * Puestos de la formación con el centro en (x, y), en punto fijo, o null si el grupo ya está casi allí (o es
 * demasiado pequeño): entonces se reparte por las casillas libres de alrededor como siempre.
 */
export function formationGoals(sim: Simulation, ids: readonly number[], x: number, y: number): FormationGoal[] | null {
  if (!wantsFormation(sim, ids)) return null;
  const e = sim.entities;
  const grid = sim.grid;
  let cx = 0;
  let cy = 0;
  for (const id of ids) {
    cx += e.x[id];
    cy += e.y[id];
  }
  cx = idiv(cx, ids.length);
  cy = idiv(cy, ids.length);
  const len = fixedLength(x - cx, y - cy);
  if (len < MIN_MARCH) return null;
  // Dirección de la marcha y su perpendicular (en 1/256).
  const fx = idiv((x - cx) * 256, len);
  const fy = idiv((y - cy) * 256, len);
  const px = -fy;
  const py = fx;

  const cols = Math.max(MIN_COLS, Math.min(MAX_COLS, isqrt(ids.length * 3) - 1));
  const ranks: number[][] = [[], [], []];
  for (const id of ids) ranks[formationRank(sim, id)].push(id);
  const forward = (id: number) => (e.x[id] - cx) * fx + (e.y[id] - cy) * fy;
  const lateral = (id: number) => (e.x[id] - cx) * px + (e.y[id] - cy) * py;

  // Filas: las de cada clase, una tras otra; dentro de cada clase, delante los que ya van más adelantados.
  const rows: number[][] = [];
  for (const rank of ranks) {
    if (rank.length === 0) continue;
    rank.sort((a, b) => forward(b) - forward(a) || a - b);
    for (let i = 0; i < rank.length; i += cols) rows.push(rank.slice(i, i + cols));
  }

  const maxX = grid.width * FP_ONE - 1;
  const maxY = grid.height * FP_ONE - 1;
  const goals: FormationGoal[] = [];
  rows.forEach((row, r) => {
    row.sort((a, b) => lateral(a) - lateral(b) || a - b);
    // Centrada en el destino: la mitad de las filas por delante y la otra mitad por detrás.
    const back = idiv((2 * r - (rows.length - 1)) * SPACING, 2);
    row.forEach((id, c) => {
      const side = idiv((2 * c - (row.length - 1)) * SPACING, 2);
      let gx = Math.max(0, Math.min(maxX, x + idiv(-back * fx + side * px, 256)));
      let gy = Math.max(0, Math.min(maxY, y + idiv(-back * fy + side * py, 256)));
      // Puesto en el agua, en un árbol o en un edificio: la casilla libre más cercana.
      if (!grid.passable(gx >> FP_SHIFT, gy >> FP_SHIFT)) {
        const tile = nearestPassableTiles(grid, gx >> FP_SHIFT, gy >> FP_SHIFT, 1, 6)[0];
        if (tile !== undefined) {
          gx = tileCenterFixed(tile % grid.width);
          gy = tileCenterFixed(Math.floor(tile / grid.width));
        }
      }
      goals.push({ id, x: gx, y: gy });
    });
  });
  return goals;
}
