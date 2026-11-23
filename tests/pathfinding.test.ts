import { describe, expect, it } from 'vitest';
import { PathGrid } from '../src/sim/path-grid';
import { Pathfinder, lineOfSight, smoothPath } from '../src/sim/pathfinding';
import { nearestPassableTiles } from '../src/sim/slots';

/** Rejilla a partir de un dibujo: '#' bloqueado, '.' libre. */
function gridFrom(rows: string[]): PathGrid {
  const grid = new PathGrid(rows[0].length, rows.length);
  rows.forEach((row, y) => [...row].forEach((c, x) => grid.setBlocked(x, y, c === '#')));
  return grid;
}

const xy = (grid: PathGrid, i: number) => [i % grid.width, Math.floor(i / grid.width)];

describe('Pathfinder', () => {
  it('encuentra un camino recto en campo abierto', () => {
    const grid = gridFrom(['.....', '.....', '.....']);
    const r = new Pathfinder(grid).find(0, 1, 4, 1);
    expect(r.reached).toBe(true);
    expect(r.tiles.map((i) => xy(grid, i))).toEqual([[1, 1], [2, 1], [3, 1], [4, 1]]);
  });

  it('rodea un muro', () => {
    const grid = gridFrom([
      '.......',
      '...#...',
      '...#...',
      '...#...',
      '.......',
    ]);
    const r = new Pathfinder(grid).find(1, 2, 5, 2);
    expect(r.reached).toBe(true);
    for (const i of r.tiles) expect(grid.blocked[i]).toBe(0);
    expect(xy(grid, r.tiles[r.tiles.length - 1])).toEqual([5, 2]);
  });

  it('no corta esquinas entre dos bloques en diagonal', () => {
    const grid = gridFrom([
      '.#.',
      '#..',
      '...',
    ]);
    // De (0,0) no se puede salir: los dos rectos están bloqueados y la diagonal cortaría la esquina.
    const r = new Pathfinder(grid).find(0, 0, 2, 2);
    expect(r.reached).toBe(false);
    expect(r.tiles).toEqual([]);
  });

  it('si el destino es inalcanzable, llega a la casilla más cercana', () => {
    const grid = gridFrom([
      '......',
      '....##',
      '....#.',
      '....##',
    ]);
    const r = new Pathfinder(grid).find(0, 0, 5, 2);
    expect(r.reached).toBe(false);
    const [x, y] = xy(grid, r.tiles[r.tiles.length - 1]);
    // Lo más cerca de (5,2) que se puede pisar: (3,2) o (5,0), ambos a la misma distancia octil.
    expect([[3, 2], [5, 0]]).toContainEqual([x, y]);
  });

  it('es determinista y reutiliza sus buffers', () => {
    const grid = gridFrom(['..........', '..####....', '.....#....', '..#..#.##.', '..........']);
    const finder = new Pathfinder(grid);
    const a = finder.find(0, 0, 9, 4);
    finder.find(9, 0, 0, 4);
    const b = finder.find(0, 0, 9, 4);
    expect(b).toEqual(a);
  });
});

describe('línea de visión y suavizado', () => {
  it('detecta obstáculos en la línea', () => {
    const grid = gridFrom(['.....', '..#..', '.....']);
    expect(lineOfSight(grid, 0, 1, 4, 1)).toBe(false);
    expect(lineOfSight(grid, 0, 0, 4, 0)).toBe(true);
  });

  it('una diagonal exacta no pasa por una esquina bloqueada', () => {
    const grid = gridFrom(['.#', '..']);
    expect(lineOfSight(grid, 0, 0, 1, 1)).toBe(false);
  });

  it('en campo abierto el camino suavizado es un solo punto', () => {
    const grid = gridFrom(['........', '........', '........', '........']);
    const r = new Pathfinder(grid).find(0, 0, 7, 3);
    expect(smoothPath(grid, 0, 0, r.tiles)).toEqual([3 * 8 + 7]);
  });
});

describe('nearestPassableTiles', () => {
  it('devuelve casillas libres ordenadas por distancia', () => {
    const grid = gridFrom(['.....', '.....', '..#..', '.....', '.....']);
    const tiles = nearestPassableTiles(grid, 2, 2, 5);
    expect(tiles).toHaveLength(5);
    expect(tiles).not.toContain(2 * 5 + 2);
    // Las 4 primeras son las vecinas rectas (distancia 1).
    expect(tiles.slice(0, 4).sort((a, b) => a - b)).toEqual([7, 11, 13, 17]);
  });
});
