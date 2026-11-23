import type { PathGrid } from './path-grid';

/** Coste de un paso recto y de uno diagonal (≈ 10·√2). */
const STRAIGHT = 10;
const DIAGONAL = 14;

/** Vecinos en orden fijo: primero los rectos, luego los diagonales. [dx, dy, coste] */
const NEIGHBORS: readonly (readonly [number, number, number])[] = [
  [1, 0, STRAIGHT],
  [0, 1, STRAIGHT],
  [-1, 0, STRAIGHT],
  [0, -1, STRAIGHT],
  [1, 1, DIAGONAL],
  [-1, 1, DIAGONAL],
  [-1, -1, DIAGONAL],
  [1, -1, DIAGONAL],
];

export interface PathResult {
  /** Casillas (índices y·ancho + x) desde la siguiente a la de salida hasta el destino, o la más cercana alcanzable. */
  readonly tiles: number[];
  /** `true` si el camino llega exactamente a la casilla destino. */
  readonly reached: boolean;
  /** Nodos expandidos: es lo que se descuenta del presupuesto por tick. */
  readonly expanded: number;
}

/**
 * A* sobre la rejilla, con 8 direcciones y sin cortar esquinas.
 * Si el destino no es alcanzable devuelve el camino a la casilla explorada más cercana a él.
 * Reutiliza sus buffers entre llamadas para no generar basura.
 */
export class Pathfinder {
  private readonly g: Int32Array;
  private readonly parent: Int32Array;
  private readonly seen: Uint32Array;
  private readonly closed: Uint32Array;
  private stamp = 0;
  private goalX = 0;
  private goalY = 0;
  // Montículo binario con desempate determinista: f, luego h, luego índice de casilla.
  private readonly heapNode: number[] = [];
  private readonly heapF: number[] = [];
  private readonly heapH: number[] = [];

  constructor(private readonly grid: PathGrid) {
    const n = grid.width * grid.height;
    this.g = new Int32Array(n);
    this.parent = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.closed = new Uint32Array(n);
  }

  /** `owner` ≥ 0: las unidades de ese jugador pasan por sus puertas. */
  find(sx: number, sy: number, gx: number, gy: number, maxNodes = this.grid.width * this.grid.height, owner = -1): PathResult {
    const grid = this.grid;
    const ok = (x: number, y: number) => (owner >= 0 ? grid.passableFor(x, y, owner) : grid.passable(x, y));
    const w = grid.width;
    if (!grid.inBounds(sx, sy) || !grid.inBounds(gx, gy)) return { tiles: [], reached: false, expanded: 0 };
    const start = sy * w + sx;
    const goal = gy * w + gx;
    if (start === goal) return { tiles: [], reached: true, expanded: 0 };

    this.nextStamp();
    const stamp = this.stamp;
    this.goalX = gx;
    this.goalY = gy;
    this.heapNode.length = this.heapF.length = this.heapH.length = 0;

    const h0 = this.heuristic(sx, sy);
    this.g[start] = 0;
    this.parent[start] = -1;
    this.seen[start] = stamp;
    this.push(start, h0, h0);

    let best = start;
    let bestH = h0;
    let expanded = 0;

    while (this.heapNode.length > 0) {
      const node = this.pop();
      if (this.closed[node] === stamp) continue;
      this.closed[node] = stamp;
      expanded++;
      if (node === goal) return { tiles: this.build(goal), reached: true, expanded };

      const nx = node % w;
      const ny = (node - nx) / w;
      const nh = this.heuristic(nx, ny);
      if (nh < bestH || (nh === bestH && this.g[node] < this.g[best])) {
        best = node;
        bestH = nh;
      }
      if (expanded >= maxNodes) break;

      for (const [dx, dy, cost] of NEIGHBORS) {
        const x = nx + dx;
        const y = ny + dy;
        if (!ok(x, y)) continue;
        // Sin cortar esquinas: una diagonal exige que los dos rectos adyacentes estén libres.
        if (dx !== 0 && dy !== 0 && (!ok(nx + dx, ny) || !ok(nx, ny + dy))) continue;
        const ni = y * w + x;
        if (this.closed[ni] === stamp) continue;
        const ng = this.g[node] + cost;
        if (this.seen[ni] === stamp && ng >= this.g[ni]) continue;
        this.seen[ni] = stamp;
        this.g[ni] = ng;
        this.parent[ni] = node;
        const h = this.heuristic(x, y);
        this.push(ni, ng + h, h);
      }
    }
    return { tiles: best === start ? [] : this.build(best), reached: false, expanded };
  }

  /** Distancia octil entera. */
  private heuristic(x: number, y: number): number {
    const dx = Math.abs(x - this.goalX);
    const dy = Math.abs(y - this.goalY);
    return STRAIGHT * Math.max(dx, dy) + (DIAGONAL - STRAIGHT) * Math.min(dx, dy);
  }

  private build(end: number): number[] {
    const out: number[] = [];
    for (let n = end; this.parent[n] !== -1; n = this.parent[n]) out.push(n);
    return out.reverse();
  }

  private nextStamp(): void {
    this.stamp = (this.stamp + 1) >>> 0;
    if (this.stamp === 0) {
      this.seen.fill(0);
      this.closed.fill(0);
      this.stamp = 1;
    }
  }

  private less(i: number, j: number): boolean {
    const fi = this.heapF[i];
    const fj = this.heapF[j];
    if (fi !== fj) return fi < fj;
    const hi = this.heapH[i];
    const hj = this.heapH[j];
    if (hi !== hj) return hi < hj;
    return this.heapNode[i] < this.heapNode[j];
  }

  private swap(i: number, j: number): void {
    const n = this.heapNode[i];
    const f = this.heapF[i];
    const h = this.heapH[i];
    this.heapNode[i] = this.heapNode[j];
    this.heapF[i] = this.heapF[j];
    this.heapH[i] = this.heapH[j];
    this.heapNode[j] = n;
    this.heapF[j] = f;
    this.heapH[j] = h;
  }

  private push(node: number, f: number, h: number): void {
    let i = this.heapNode.length;
    this.heapNode.push(node);
    this.heapF.push(f);
    this.heapH.push(h);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }

  private pop(): number {
    const top = this.heapNode[0];
    const last = this.heapNode.length - 1;
    this.swap(0, last);
    this.heapNode.pop();
    this.heapF.pop();
    this.heapH.pop();
    let i = 0;
    const n = this.heapNode.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < n && this.less(l, m)) m = l;
      if (r < n && this.less(r, m)) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
    return top;
  }
}

/**
 * ¿Se puede ir en línea recta del centro de una casilla al de otra sin pisar casillas bloqueadas?
 * Recorre todas las casillas que toca la línea; si pasa justo por una esquina, exige libres las dos casillas laterales.
 */
export function lineOfSight(grid: PathGrid, x0: number, y0: number, x1: number, y1: number, owner = -1): boolean {
  const ok = (x: number, y: number) => (owner >= 0 ? grid.passableFor(x, y, owner) : grid.passable(x, y));
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  const sx = x1 > x0 ? 1 : -1;
  const sy = y1 > y0 ? 1 : -1;
  let x = x0;
  let y = y0;
  let n = 1 + dx + dy;
  let error = dx - dy;
  dx *= 2;
  dy *= 2;
  for (; n > 0; n--) {
    if (!ok(x, y)) return false;
    if (error > 0) {
      x += sx;
      error -= dy;
    } else if (error < 0) {
      y += sy;
      error += dx;
    } else {
      if (n > 1 && (!ok(x + sx, y) || !ok(x, y + sy))) return false;
      x += sx;
      y += sy;
      error += dx - dy;
      n--;
    }
  }
  return true;
}

/** Quita los puntos intermedios innecesarios: desde cada punto salta al más lejano visible en línea recta. */
export function smoothPath(grid: PathGrid, startX: number, startY: number, tiles: readonly number[], owner = -1): number[] {
  const w = grid.width;
  const out: number[] = [];
  let ax = startX;
  let ay = startY;
  let i = 0;
  while (i < tiles.length) {
    let j = tiles.length - 1;
    while (j > i && !lineOfSight(grid, ax, ay, tiles[j] % w, Math.floor(tiles[j] / w), owner)) j--;
    out.push(tiles[j]);
    ax = tiles[j] % w;
    ay = Math.floor(tiles[j] / w);
    i = j + 1;
  }
  return out;
}
