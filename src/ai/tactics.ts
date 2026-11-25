import { BUILDING_DEFS, type BuildingType } from '../data/buildings';
import { TERRAIN_INFO, type Terrain } from '../map/terrain';
import { FP_ONE, FP_SHIFT, tileCenterFixed } from '../engine/fixed';
import { attackOf } from '../sim/combat';
import { Comp } from '../sim/entities';
import { PathGrid } from '../sim/path-grid';
import { Pathfinder } from '../sim/pathfinding';
import { nearestPassableTiles } from '../sim/slots';
import type { AiPlayer } from './ai-player';
import type { AiContext } from './context';

export interface TacticalPoint { x: number; y: number }
export interface FailedAttack {
  x: number;
  y: number;
  tick: number;
  side: number;
}
export interface Approach {
  side: number;
  points: TacticalPoint[];
  index: number;
  defenses: number[];
}

/** El planificador ve terreno explorado, edificios recordados y enemigos visibles. Lo demás es incierto. */
function knownGrid(ai: AiPlayer, ctx: AiContext): PathGrid {
  const sim = ctx.sim;
  const grid = new PathGrid(sim.grid.width, sim.grid.height);
  const { visible, explored } = sim.visibility.layers(ctx.player);
  for (let i = 0; i < explored.length; i++) {
    const x = i % grid.width;
    const y = Math.floor(i / grid.width);
    if ((visible[i] && !sim.grid.passableFor(x, y, ctx.player)) ||
      (explored[i] && !TERRAIN_INFO[sim.map.terrain[i] as Terrain].walkable)) grid.setBlocked(x, y, true);
  }
  for (const b of ai.memory.enemyBuildings.values()) {
    const def = BUILDING_DEFS[b.type as BuildingType];
    if (!def.blocks) continue;
    for (let y = b.y - (def.size >> 1); y < b.y - (def.size >> 1) + def.size; y++) {
      for (let x = b.x - (def.size >> 1); x < b.x - (def.size >> 1) + def.size; x++) grid.setBlocked(x, y, true);
    }
  }
  return grid;
}

/** Compara la exposición real de los caminos, no solo la seguridad de sus puntos de paso. */
export function planApproach(
  ai: AiPlayer, ctx: AiContext, from: TacticalPoint, goal: TacticalPoint, siege: boolean, failed?: FailedAttack,
): Approach {
  const grid = knownGrid(ai, ctx);
  const pathfinder = new Pathfinder(grid);
  const risk = new Float32Array(grid.width * grid.height);
  const defenses: number[] = [];
  const addDanger = (cx: number, cy: number, radius: number, weight: number) => {
    for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(grid.height - 1, cy + radius); y++) {
      for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(grid.width - 1, cx + radius); x++) {
        if (Math.hypot(x - cx, y - cy) <= radius) risk[y * grid.width + x] += weight;
      }
    }
  };
  for (const [id, b] of ai.memory.enemyBuildings) {
    const def = BUILDING_DEFS[b.type as BuildingType];
    if (!def.attack) continue;
    defenses.push(id);
    addDanger(b.x, b.y, def.attack.range + def.size / 2 + 3, siege ? 2 : 7);
  }
  const e = ctx.sim.entities;
  for (const id of ctx.enemies) {
    const attack = attackOf(ctx.sim, id);
    if (!attack || (e.mask[id] & Comp.Worker)) continue;
    addDanger(e.x[id] >> FP_SHIFT, e.y[id] >> FP_SHIFT, Math.max(4, attack.range / FP_ONE + 2), 1.5);
  }
  const point = (x: number, y: number): TacticalPoint => {
    const tx = Math.max(1, Math.min(grid.width - 2, Math.round(x)));
    const ty = Math.max(1, Math.min(grid.height - 2, Math.round(y)));
    const tile = nearestPassableTiles(grid, tx, ty, 1, 6)[0];
    return tile === undefined ? { x: tileCenterFixed(tx), y: tileCenterFixed(ty) }
      : { x: tileCenterFixed(tile % grid.width), y: tileCenterFixed(Math.floor(tile / grid.width)) };
  };
  const sx = from.x / FP_ONE;
  const sy = from.y / FP_ONE;
  const gx = goal.x / FP_ONE;
  const gy = goal.y / FP_ONE;
  const length = Math.hypot(gx - sx, gy - sy);
  const offset = Math.max(12, Math.min(22, length * 0.4));
  const px = -(gy - sy) / Math.max(1, length);
  const py = (gx - sx) / Math.max(1, length);
  const { explored } = ctx.sim.visibility.layers(ctx.player);
  const evaluate = (points: TacticalPoint[]) => {
    let x = from.x >> FP_SHIFT;
    let y = from.y >> FP_SHIFT;
    let cost = 0;
    let steps = 0;
    for (const p of points) {
      const result = pathfinder.find(x, y, p.x >> FP_SHIFT, p.y >> FP_SHIFT, grid.width * grid.height);
      if (!result.reached) return { cost: Infinity, steps: Infinity };
      for (const tile of result.tiles) {
        const nx = tile % grid.width;
        const ny = Math.floor(tile / grid.width);
        const step = nx !== x && ny !== y ? 1.414 : 1;
        steps += step;
        cost += step + risk[tile] + (explored[tile] ? 0 : 0.2);
        x = nx;
        y = ny;
      }
    }
    return { cost, steps };
  };
  const destination = point(gx, gy);
  const direct = evaluate([destination]);
  let best: Approach = { side: 0, points: [goal], index: 0, defenses };
  const recentFailure = failed && ctx.sim.tick - failed.tick < 180 * ctx.sim.tickRate;
  let bestCost = direct.cost + (recentFailure && failed.side === 0 ? 35 : 0);
  if (length < 16) return best;
  for (const side of [-1, 1]) {
    const points = [
      point(sx + (gx - sx) * 0.4 + px * offset * side, sy + (gy - sy) * 0.4 + py * offset * side),
      point(sx + (gx - sx) * 0.75 + px * offset * side, sy + (gy - sy) * 0.75 + py * offset * side),
      destination,
    ];
    const route = evaluate(points);
    const score = route.cost + (recentFailure && failed.side === side ? 35 : 0);
    if (route.steps > direct.steps * 1.9 + 8 || score >= bestCost * 0.9) continue;
    bestCost = score;
    // El último destino sigue siendo el objetivo militar; los puntos intermedios describen el flanco.
    best = { side, points: [points[0], points[1], goal], index: 0, defenses };
  }
  return best;
}

export function recentFailure(ai: AiPlayer, ctx: AiContext, target: number): FailedAttack | undefined {
  const failure = ai.failedAttacks?.get(target);
  const b = ai.memory.enemyBuildings.get(target);
  return failure && b && b.x === failure.x && b.y === failure.y &&
    ctx.sim.tick - failure.tick < 180 * ctx.sim.tickRate ? failure : undefined;
}
