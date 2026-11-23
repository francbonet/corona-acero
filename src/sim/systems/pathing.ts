import { fixedToTile, tileCenterFixed } from '../../engine/fixed';
import { MoveState } from '../entities';
import { Pathfinder, smoothPath } from '../pathfinding';
import type { Simulation } from '../simulation';

interface PathRequest {
  readonly entity: number;
  readonly requestId: number;
}

/**
 * Peticiones de camino con presupuesto por tick: se atienden en orden de llegada hasta gastar
 * `nodeBudget` nodos de A*, y el resto espera al tick siguiente. Así un grupo grande no congela el juego.
 */
export class PathingSystem {
  nodeBudget = 12000;
  private readonly queue: PathRequest[] = [];
  private head = 0;
  private nextRequestId = 1;
  private readonly finder: Pathfinder;

  constructor(private readonly sim: Simulation) {
    this.finder = new Pathfinder(sim.grid);
  }

  /** Peticiones aún sin atender. */
  get pending(): number {
    return this.queue.length - this.head;
  }

  /** Para el hash de estado. */
  get requestCounter(): number {
    return this.nextRequestId;
  }

  /** Pide un camino hasta el destino guardado en goalX/goalY de la entidad. Invalida cualquier petición anterior. */
  request(id: number): void {
    const e = this.sim.entities;
    const requestId = this.nextRequestId++;
    e.pathRequest[id] = requestId;
    e.moveState[id] = MoveState.WaitingPath;
    e.stuckTicks[id] = 0;
    this.queue.push({ entity: id, requestId });
  }

  process(): void {
    const e = this.sim.entities;
    const grid = this.sim.grid;
    let used = 0;
    let solved = 0;
    while (this.head < this.queue.length && (solved === 0 || used < this.nodeBudget)) {
      const { entity: id, requestId } = this.queue[this.head++];
      if (!e.isAlive(id) || e.pathRequest[id] !== requestId) continue; // obsoleta: no gasta presupuesto

      const sx = fixedToTile(e.x[id]);
      const sy = fixedToTile(e.y[id]);
      const gx = fixedToTile(e.goalX[id]);
      const gy = fixedToTile(e.goalY[id]);
      const owner = e.owner[id];
      const result = this.finder.find(sx, sy, gx, gy, grid.width * grid.height, owner);
      used += result.expanded;
      solved++;

      const tiles = smoothPath(grid, sx, sy, result.tiles, owner);
      const waypoints = new Int32Array((tiles.length + (result.reached ? 1 : 0)) * 2);
      let k = 0;
      // Si se llega, el último punto intermedio es el destino exacto en vez del centro de su casilla.
      const keep = result.reached && tiles.length > 0 ? tiles.length - 1 : tiles.length;
      for (let i = 0; i < keep; i++) {
        waypoints[k++] = tileCenterFixed(tiles[i] % grid.width);
        waypoints[k++] = tileCenterFixed(Math.floor(tiles[i] / grid.width));
      }
      if (result.reached) {
        waypoints[k++] = e.goalX[id];
        waypoints[k++] = e.goalY[id];
      }

      const path = waypoints.subarray(0, k);
      if (path.length === 0) {
        e.moveState[id] = MoveState.Idle;
        e.path[id] = null;
        continue;
      }
      e.path[id] = path;
      e.pathIndex[id] = 0;
      e.moveState[id] = MoveState.Moving;
    }
    if (this.head > 256 && this.head * 2 > this.queue.length) {
      this.queue.splice(0, this.head);
      this.head = 0;
    }
  }
}
