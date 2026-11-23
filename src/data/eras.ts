import { type Cost, cost } from './resources';

/** Las cuatro eras (GDD §5). El índice es el número de era (0 = Señorío). */
export interface EraDef {
  readonly name: string;
  /** "Era del Señorío", "Era de los Burgos"… */
  readonly title: string;
  readonly description: string;
  /** Coste y segundos para avanzar a esta era (la era 0 no tiene). */
  readonly cost: Cost;
  readonly time: number;
}

export const ERA_DEFS: readonly EraDef[] = [
  { name: 'Señorío', title: 'Era del Señorío', description: 'Una aldea bajo la protección de su señor.', cost: cost({}), time: 0 },
  {
    name: 'Burgos',
    title: 'Era de los Burgos',
    description: 'Crecen las villas y el comercio: mercado, herrería, arqueros y caballería.',
    cost: cost({ food: 400, wood: 100 }),
    time: 110,
  },
  {
    name: 'Coronas',
    title: 'Era de las Coronas',
    description: 'Monarquías fuertes: castillos, universidades, monasterios, asedio y caballeros.',
    cost: cost({ food: 700, gold: 250 }),
    time: 140,
  },
  {
    name: 'Pólvora',
    title: 'Era de la Pólvora',
    description: 'Llegan las armas de fuego, las bombardas y las catedrales.',
    cost: cost({ food: 900, stone: 200, gold: 700 }),
    time: 170,
  },
];
export const ERA_COUNT = ERA_DEFS.length;

/** Edificios distintos de la era actual que hacen falta para avanzar (GDD §5). */
export const BUILDINGS_TO_ADVANCE = 2;
