import { Resource } from './resources';

/** Tipos de fuente de recursos (0 = ninguna). */
export const NodeType = {
  None: 0,
  Tree: 1,
  Berries: 2,
  Gold: 3,
  Stone: 4,
  /** Oveja viva: es una unidad que además es fuente de comida. */
  Sheep: 5,
  /** Oveja sacrificada. */
  Carcass: 6,
  Farm: 7,
  /** Ciervo vivo: hay que cazarlo (y huye). */
  Deer: 8,
  /** Jabalí vivo: hay que cazarlo (y se defiende). */
  Boar: 9,
} as const;
export type NodeType = (typeof NodeType)[keyof typeof NodeType];

export interface NodeDef {
  readonly name: string;
  readonly resource: Resource;
  /** Cantidad inicial (las ovejas y granjas la toman de su unidad o edificio). */
  readonly amount: number;
  /** Ritmo de recolección de un aldeano, en unidades por segundo. */
  readonly gatherRate: number;
}

/** Valores provisionales, a ajustar en el equilibrado. */
export const NODE_DEFS: Readonly<Record<Exclude<NodeType, typeof NodeType.None>, NodeDef>> = {
  [NodeType.Tree]: { name: 'Árbol', resource: Resource.Wood, amount: 110, gatherRate: 0.42 },
  [NodeType.Berries]: { name: 'Arbusto de bayas', resource: Resource.Food, amount: 140, gatherRate: 0.33 },
  [NodeType.Gold]: { name: 'Mina de oro', resource: Resource.Gold, amount: 750, gatherRate: 0.38 },
  [NodeType.Stone]: { name: 'Mina de piedra', resource: Resource.Stone, amount: 400, gatherRate: 0.36 },
  [NodeType.Sheep]: { name: 'Oveja', resource: Resource.Food, amount: 110, gatherRate: 0.4 },
  [NodeType.Carcass]: { name: 'Carne', resource: Resource.Food, amount: 110, gatherRate: 0.42 },
  [NodeType.Farm]: { name: 'Granja', resource: Resource.Food, amount: 250, gatherRate: 0.36 },
  [NodeType.Deer]: { name: 'Ciervo', resource: Resource.Food, amount: 130, gatherRate: 0.42 },
  [NodeType.Boar]: { name: 'Jabalí', resource: Resource.Food, amount: 320, gatherRate: 0.42 },
};
