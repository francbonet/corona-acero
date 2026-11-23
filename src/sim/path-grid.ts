import type { GameMap } from '../map/game-map';
import { TERRAIN_INFO, type Terrain } from '../map/terrain';

/** Valores de `blocked`: libre, bloqueada, o puerta (solo pasa su dueño). */
export const FREE = 0;
export const BLOCKED = 1;
export const GATE = 2;

/**
 * Rejilla de paso y de ocupación.
 * - `blocked`: lo que usa el A*. Una casilla está bloqueada si el terreno no se puede pisar
 *   o si la ocupa algo que bloquea (árbol, mina, edificio; las granjas no bloquean). Las puertas son
 *   casillas especiales: solo las pisan las unidades de su dueño.
 * - `occupant`: qué entidad ocupa la casilla (0 = libre), para saber dónde se puede construir.
 */
export class PathGrid {
  readonly blocked: Uint8Array;
  readonly occupant: Int32Array;
  /** Dueño de la puerta de cada casilla (solo cuenta si `blocked` es GATE). */
  readonly gateOwner: Uint8Array;
  private readonly terrainBlocked: Uint8Array;
  private readonly terrainBuildable: Uint8Array;
  private readonly occupantBlocks: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    const n = width * height;
    this.blocked = new Uint8Array(n);
    this.occupant = new Int32Array(n);
    this.gateOwner = new Uint8Array(n);
    this.terrainBlocked = new Uint8Array(n);
    this.terrainBuildable = new Uint8Array(n).fill(1);
    this.occupantBlocks = new Uint8Array(n);
  }

  /** Rejilla con el terreno del mapa (los árboles y yacimientos los ocupa la simulación como entidades). */
  static fromMap(map: GameMap): PathGrid {
    const grid = new PathGrid(map.width, map.height);
    for (let i = 0; i < grid.blocked.length; i++) {
      const info = TERRAIN_INFO[map.terrain[i] as Terrain];
      grid.terrainBlocked[i] = info.walkable ? 0 : 1;
      grid.terrainBuildable[i] = info.buildable ? 1 : 0;
      grid.blocked[i] = grid.terrainBlocked[i];
    }
    return grid;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** Transitable para cualquiera (las puertas cuentan como bloqueadas). */
  passable(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.blocked[y * this.width + x] === FREE;
  }

  /** Transitable para las unidades de `owner` (pasan por sus propias puertas). */
  passableFor(x: number, y: number, owner: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = y * this.width + x;
    const b = this.blocked[i];
    return b === FREE || (b === GATE && this.gateOwner[i] === owner);
  }

  /** Se puede construir: terreno edificable y nadie ocupando la casilla. */
  buildable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = y * this.width + x;
    return this.terrainBuildable[i] === 1 && this.occupant[i] === 0;
  }

  occupantAt(x: number, y: number): number {
    return this.inBounds(x, y) ? this.occupant[y * this.width + x] : 0;
  }

  /** Marca un cuadrado de `size` casillas como ocupado por `id`. Con `gateOwner` > 0 es una puerta. */
  occupy(x0: number, y0: number, size: number, id: number, blocks: boolean, gateOwner = 0): void {
    for (let y = y0; y < y0 + size; y++) {
      for (let x = x0; x < x0 + size; x++) {
        if (!this.inBounds(x, y)) continue;
        const i = y * this.width + x;
        this.occupant[i] = id;
        this.occupantBlocks[i] = blocks ? 1 : 0;
        this.gateOwner[i] = gateOwner;
        this.blocked[i] = this.terrainBlocked[i] ? BLOCKED : gateOwner > 0 ? GATE : this.occupantBlocks[i];
      }
    }
  }

  release(x0: number, y0: number, size: number): void {
    for (let y = y0; y < y0 + size; y++) {
      for (let x = x0; x < x0 + size; x++) {
        if (!this.inBounds(x, y)) continue;
        const i = y * this.width + x;
        this.occupant[i] = 0;
        this.occupantBlocks[i] = 0;
        this.gateOwner[i] = 0;
        this.blocked[i] = this.terrainBlocked[i];
      }
    }
  }

  /** Para tests y escenarios: bloquea o libera una casilla directamente. */
  setBlocked(x: number, y: number, blocked: boolean): void {
    if (!this.inBounds(x, y)) return;
    const i = y * this.width + x;
    this.terrainBlocked[i] = blocked ? 1 : 0;
    this.blocked[i] = this.terrainBlocked[i] | this.occupantBlocks[i];
  }
}
