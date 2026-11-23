import { FP_ONE, FP_SHIFT, fixedLength, idiv } from '../../engine/fixed';
import { Comp, type Entities, MoveState } from '../entities';
import type { Simulation } from '../simulation';

/** Ticks seguidos casi sin avanzar para considerar atascada una unidad. */
const STUCK_TICKS = 15;
/** Recálculos de camino antes de rendirse y quedarse quieta. */
const MAX_REPATHS = 3;
/** Empuje máximo por tick al separar unidades (1/6 de casilla). */
const MAX_PUSH = 42;
/** Solape que se tolera entre dos unidades sin separarlas (≈ medio píxel). */
const ROZE = 6;
/** Distancia a la que se da por alcanzado un punto intermedio del camino (≈ 0,4 casillas). */
const WAYPOINT_SLACK = 100;

const MOVER = Comp.Position | Comp.Mover;
const UNIT = Comp.Position | Comp.Unit;

export function stopUnit(e: Entities, id: number): void {
  e.moveState[id] = MoveState.Idle;
  e.path[id] = null;
  e.pathIndex[id] = 0;
  e.stuckTicks[id] = 0;
  e.speedCap[id] = 0;
}

/**
 * Avanza cada unidad por sus puntos de paso. Lo que sobra del paso al llegar a un punto se gasta en el siguiente.
 * El camino se calcula entre centros de casilla, pero la unidad puede ir desplazada dentro de la suya y rozar
 * la esquina de un obstáculo: en ese caso se desliza por el eje libre en vez de entrar en la casilla bloqueada.
 */
export function moveUnits(sim: Simulation): void {
  const e = sim.entities;
  const grid = sim.grid;
  for (let id = 1; id < e.highWater; id++) {
    if ((e.mask[id] & MOVER) !== MOVER || e.moveState[id] !== MoveState.Moving) continue;
    const path = e.path[id];
    if (!path) {
      stopUnit(e, id);
      continue;
    }
    // Asedio montado: primero hay que desmontarlo (se queda quieto mientras tanto).
    if (e.deployState[id] !== 0) {
      if (e.deployState[id] === 2 || e.deployState[id] === 1) {
        e.deployState[id] = 3;
        e.deployTicks[id] = sim.deployTicks(e.unitType[id]);
      }
      continue;
    }
    const owner = e.owner[id];
    let x = e.x[id];
    let y = e.y[id];
    let wi = e.pathIndex[id];
    // En formación, al paso del más lento del grupo.
    let remaining = e.speedCap[id] > 0 ? Math.min(e.speed[id], e.speedCap[id]) : e.speed[id];
    while (remaining > 0 && wi * 2 < path.length) {
      const dx = path[wi * 2] - x;
      const dy = path[wi * 2 + 1] - y;
      const dist = fixedLength(dx, dy);
      // Un punto intermedio basta con rozarlo: si todas las unidades de un grupo tuvieran que pisar su centro
      // exacto, se agolparían en cada recodo. El destino final sí es exacto.
      if (dist <= WAYPOINT_SLACK && wi * 2 < path.length - 2) {
        wi++;
        continue;
      }
      const reach = dist <= remaining;
      const nx = reach ? x + dx : x + idiv(dx * remaining, dist);
      const ny = reach ? y + dy : y + idiv(dy * remaining, dist);
      // Si ya está en una casilla bloqueada (caso raro), se le deja salir hacia donde sea.
      const free = !grid.passableFor(x >> FP_SHIFT, y >> FP_SHIFT, owner) || grid.passableFor(nx >> FP_SHIFT, ny >> FP_SHIFT, owner);
      if (free) {
        x = nx;
        y = ny;
        if (reach) {
          remaining -= dist;
          wi++;
        } else {
          remaining = 0;
        }
      } else {
        if (grid.passableFor(nx >> FP_SHIFT, y >> FP_SHIFT, owner)) x = nx;
        else if (grid.passableFor(x >> FP_SHIFT, ny >> FP_SHIFT, owner)) y = ny;
        remaining = 0;
      }
    }
    e.x[id] = x;
    e.y[id] = y;
    e.pathIndex[id] = wi;
    if (wi * 2 >= path.length) stopUnit(e, id);
  }
}

/**
 * Separa las unidades que se solapan. Las que se mueven empujan más a las quietas, como en los RTS clásicos.
 * Los empujes se acumulan y luego se aplican eje por eje, sin meter a nadie en una casilla bloqueada.
 */
export function separateUnits(sim: Simulation): void {
  const e = sim.entities;
  const hash = sim.spatial;
  const pushX = sim.scratchA;
  const pushY = sim.scratchB;

  hash.clear();
  for (let id = 1; id < e.highWater; id++) {
    if ((e.mask[id] & UNIT) !== UNIT) continue;
    hash.insert(id, e.x[id], e.y[id]);
    pushX[id] = 0;
    pushY[id] = 0;
  }

  for (let i = 1; i < e.highWater; i++) {
    if ((e.mask[i] & UNIT) !== UNIT) continue;
    const xi = e.x[i];
    const yi = e.y[i];
    const ri = e.radius[i];
    const cx = xi >> FP_SHIFT;
    const cy = yi >> FP_SHIFT;
    const movingI = e.moveState[i] === MoveState.Moving;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        for (let j = hash.first(cx + ox, cy + oy); j !== -1; j = hash.next(j)) {
          if (j <= i) continue; // cada pareja una sola vez
          let dx = e.x[j] - xi;
          let dy = e.y[j] - yi;
          const minDist = ri + e.radius[j];
          const d2 = dx * dx + dy * dy;
          if (d2 >= minDist * minDist) continue;
          let d = fixedLength(dx, dy);
          if (d === 0) {
            // Misma posición exacta: dirección determinista según los ids.
            dx = (i + j) & 1 ? 1 : 0;
            dy = (i + j) & 1 ? 0 : 1;
            d = 1;
          }
          // Roces mínimos no se corrigen (zona muerta): así no tiemblan las que están juntas. Dos que trabajan
          // codo con codo pueden solaparse un poco más.
          const tolerance = e.working[i] === 1 && e.working[j] === 1 ? minDist >> 2 : ROZE;
          const overlap = minDist - d - tolerance;
          if (overlap <= 0) continue;
          const movingJ = e.moveState[j] === MoveState.Moving;
          let wi = 1;
          let wj = 1;
          if (movingI && !movingJ) wj = 3;
          else if (!movingI && movingJ) wi = 3;
          // Quien está trabajando (talando, construyendo…) aguanta su sitio: el otro se aparta.
          const workingI = e.working[i] === 1;
          const workingJ = e.working[j] === 1;
          if (workingI && !workingJ) {
            wi = 1;
            wj = 3;
          } else if (workingJ && !workingI) {
            wj = 1;
            wi = 3;
          }
          const total = (wi + wj) * d;
          pushX[i] -= idiv(dx * overlap * wi, total);
          pushY[i] -= idiv(dy * overlap * wi, total);
          pushX[j] += idiv(dx * overlap * wj, total);
          pushY[j] += idiv(dy * overlap * wj, total);
        }
      }
    }
  }

  const grid = sim.grid;
  const maxX = grid.width * FP_ONE - 1;
  const maxY = grid.height * FP_ONE - 1;
  for (let id = 1; id < e.highWater; id++) {
    if ((e.mask[id] & UNIT) !== UNIT) continue;
    const px = Math.max(-MAX_PUSH, Math.min(MAX_PUSH, pushX[id]));
    const py = Math.max(-MAX_PUSH, Math.min(MAX_PUSH, pushY[id]));
    const owner = e.owner[id];
    if (px !== 0) {
      const nx = Math.max(0, Math.min(maxX, e.x[id] + px));
      if (grid.passableFor(nx >> FP_SHIFT, e.y[id] >> FP_SHIFT, owner)) e.x[id] = nx;
    }
    if (py !== 0) {
      const ny = Math.max(0, Math.min(maxY, e.y[id] + py));
      if (grid.passableFor(e.x[id] >> FP_SHIFT, ny >> FP_SHIFT, owner)) e.y[id] = ny;
    }
  }
}

/**
 * Detecta unidades que no avanzan (atrapadas en un atasco). Si están cerca del destino dan la orden por cumplida;
 * si no, recalculan el camino unas pocas veces antes de rendirse.
 */
export function resolveStuck(sim: Simulation): void {
  const e = sim.entities;
  for (let id = 1; id < e.highWater; id++) {
    if ((e.mask[id] & MOVER) !== MOVER || e.moveState[id] !== MoveState.Moving || e.deployState[id] !== 0) continue;
    const moved = fixedLength(e.x[id] - e.prevX[id], e.y[id] - e.prevY[id]);
    if (moved * 3 >= e.speed[id]) {
      e.stuckTicks[id] = 0;
      continue;
    }
    if (++e.stuckTicks[id] < STUCK_TICKS) continue;
    const toGoal = fixedLength(e.goalX[id] - e.x[id], e.goalY[id] - e.y[id]);
    if (toGoal <= FP_ONE + e.radius[id] * 2 || e.repaths[id] >= MAX_REPATHS) {
      stopUnit(e, id);
    } else {
      e.repaths[id]++;
      sim.pathing.request(id);
    }
  }
}
