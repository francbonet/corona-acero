/** Los cuatro recursos del juego. */
export const Resource = {
  Food: 0,
  Wood: 1,
  Stone: 2,
  Gold: 3,
} as const;
export type Resource = (typeof Resource)[keyof typeof Resource];
export const RESOURCE_COUNT = 4;
export const RESOURCES: readonly Resource[] = [Resource.Food, Resource.Wood, Resource.Stone, Resource.Gold];

export const RESOURCE_NAMES: Readonly<Record<Resource, string>> = {
  [Resource.Food]: 'Comida',
  [Resource.Wood]: 'Madera',
  [Resource.Stone]: 'Piedra',
  [Resource.Gold]: 'Oro',
};

/** Coste en [comida, madera, piedra, oro]. */
export type Cost = readonly [number, number, number, number];

export function cost(c: { food?: number; wood?: number; stone?: number; gold?: number }): Cost {
  return [c.food ?? 0, c.wood ?? 0, c.stone ?? 0, c.gold ?? 0];
}

/** Recursos iniciales de cada jugador (GDD §3). */
export const STARTING_STOCK: Cost = cost({ food: 250, wood: 250, stone: 150, gold: 100 });

/** Tope de población. */
export const POP_LIMIT = 200;
