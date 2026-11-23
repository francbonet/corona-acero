import type { PathGrid } from './path-grid';

/**
 * Las `count` casillas transitables más cercanas a (tx, ty), ordenadas por distancia euclídea
 * (y por índice para desempatar). Sirve para repartir un grupo alrededor del punto de destino
 * y para encontrar dónde colocar unidades nuevas.
 */
export function nearestPassableTiles(grid: PathGrid, tx: number, ty: number, count: number, maxRadius = 32): number[] {
  if (count <= 0) return [];
  let radius = Math.ceil(Math.sqrt(count)) + 1;
  for (;;) {
    const r2 = radius * radius;
    const found: { index: number; d2: number }[] = [];
    for (let y = ty - radius; y <= ty + radius; y++) {
      for (let x = tx - radius; x <= tx + radius; x++) {
        const d2 = (x - tx) * (x - tx) + (y - ty) * (y - ty);
        if (d2 > r2 || !grid.passable(x, y)) continue;
        found.push({ index: y * grid.width + x, d2 });
      }
    }
    // Todas las casillas a distancia ≤ radius están en el cuadrado, así que el orden es exacto.
    if (found.length >= count || radius >= maxRadius) {
      found.sort((a, b) => a.d2 - b.d2 || a.index - b.index);
      return found.slice(0, count).map((f) => f.index);
    }
    radius = Math.min(maxRadius, radius * 2);
  }
}
