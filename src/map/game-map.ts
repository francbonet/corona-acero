import { Deposit, Terrain, TreeKind } from './terrain';

/**
 * Descripción inicial del mapa: terreno, árboles y yacimientos, en arrays planos indexados por y * width + x.
 * La simulación lo lee al empezar; a partir de ahí el estado vivo (árboles talados, etc.) está en la simulación.
 */
export class GameMap {
  readonly terrain: Uint8Array;
  readonly trees: Uint8Array;
  readonly deposits: Uint8Array;
  /** Casillas centrales de las posiciones iniciales de los jugadores. */
  readonly starts: { x: number; y: number }[] = [];
  /** Animales salvajes (de la naturaleza): tipo de unidad y casilla. */
  readonly animals: { type: number; x: number; y: number }[] = [];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.terrain = new Uint8Array(width * height).fill(Terrain.Grass);
    this.trees = new Uint8Array(width * height).fill(TreeKind.None);
    this.deposits = new Uint8Array(width * height).fill(Deposit.None);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  terrainAt(x: number, y: number): Terrain {
    return this.terrain[this.index(x, y)] as Terrain;
  }

  treeAt(x: number, y: number): TreeKind {
    return this.trees[this.index(x, y)] as TreeKind;
  }

  depositAt(x: number, y: number): Deposit {
    return this.deposits[this.index(x, y)] as Deposit;
  }
}
