/** Tipos de terreno. Se guardan como enteros en un Uint8Array. */
export const Terrain = {
  Grass: 0,
  Dirt: 1,
  Sand: 2,
  /** Agua junto a la orilla: se ve más clara, pero no se pisa. */
  Shallow: 3,
  Deep: 4,
  /** Vado: agua muy baja, con arena y piedras, por donde sí se cruza a pie. */
  Ford: 5,
} as const;
export type Terrain = (typeof Terrain)[keyof typeof Terrain];
export const TERRAIN_COUNT = 6;

export interface TerrainInfo {
  readonly name: string;
  readonly walkable: boolean;
  readonly buildable: boolean;
}

export const TERRAIN_INFO: Readonly<Record<Terrain, TerrainInfo>> = {
  [Terrain.Grass]: { name: 'Hierba', walkable: true, buildable: true },
  [Terrain.Dirt]: { name: 'Tierra', walkable: true, buildable: true },
  [Terrain.Sand]: { name: 'Arena', walkable: true, buildable: true },
  [Terrain.Shallow]: { name: 'Agua somera', walkable: false, buildable: false },
  [Terrain.Deep]: { name: 'Agua profunda', walkable: false, buildable: false },
  [Terrain.Ford]: { name: 'Vado', walkable: true, buildable: false },
};

/** Especies de árbol (0 = sin árbol). */
export const TreeKind = {
  None: 0,
  Oak: 1,
  Pine: 2,
  Olive: 3,
} as const;
export type TreeKind = (typeof TreeKind)[keyof typeof TreeKind];

export const TREE_NAMES: Readonly<Record<TreeKind, string>> = {
  [TreeKind.None]: '',
  [TreeKind.Oak]: 'Roble',
  [TreeKind.Pine]: 'Pino',
  [TreeKind.Olive]: 'Olivo',
};

/** Yacimientos fijos del mapa (0 = ninguno). Los árboles van aparte, en `GameMap.trees`. */
export const Deposit = {
  None: 0,
  Berries: 1,
  Gold: 2,
  Stone: 3,
} as const;
export type Deposit = (typeof Deposit)[keyof typeof Deposit];
