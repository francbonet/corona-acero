import type { BuildingType } from './buildings';
import type { UnitClass } from './combat';
import type { NodeType } from './nodes';
import type { UnitType } from './units';

/** A qué unidades afecta un modificador: por tipo concreto o por clase. Vacío = a ninguna. */
export interface UnitSelector {
  readonly units?: readonly UnitType[];
  readonly classes?: readonly UnitClass[];
}

/**
 * Cambios de estadísticas que aplican las tecnologías y los bonus de facción.
 * La simulación los combina por jugador (src/sim/stats.ts); los porcentajes son enteros (+15 = +15 %).
 */
export type Modifier =
  | {
      readonly kind: 'unit';
      readonly stat: 'hp' | 'melee' | 'pierce' | 'meleeArmor' | 'pierceArmor' | 'range' | 'los' | 'speedPct';
      readonly amount: number;
      readonly select: UnitSelector;
    }
  /** Daño adicional contra una clase (p. ej. estacas contra caballería). */
  | { readonly kind: 'bonus'; readonly vs: UnitClass; readonly amount: number; readonly select: UnitSelector }
  | { readonly kind: 'gather'; readonly nodes: readonly NodeType[]; readonly pct: number }
  | { readonly kind: 'carry'; readonly amount: number }
  | { readonly kind: 'farmFood'; readonly amount: number }
  | { readonly kind: 'building'; readonly stat: 'hpPct' | 'meleeArmor' | 'pierceArmor' | 'range'; readonly amount: number; readonly buildings?: readonly BuildingType[] }
  /** Coste de unidades o edificios (negativo = más barato). */
  | { readonly kind: 'cost'; readonly pct: number; readonly units?: UnitSelector; readonly buildings?: readonly BuildingType[] }
  | { readonly kind: 'buildSpeedPct'; readonly pct: number }
  | { readonly kind: 'tradePct'; readonly pct: number }
  /** Mejor precio de venta en el mercado (puntos de porcentaje de lo que se cobra). */
  | { readonly kind: 'marketSell'; readonly pct: number }
  | { readonly kind: 'monk'; readonly stat: 'convertRange' | 'healPct'; readonly amount: number }
  /** Sustituye un tipo de unidad por su versión mejorada (las existentes y las futuras). */
  | { readonly kind: 'upgrade'; readonly from: UnitType; readonly to: UnitType };

/** Un modificador que solo cuenta a partir de una era (bonus de facción). */
export interface EraModifier {
  readonly fromEra?: number;
  readonly modifier: Modifier;
}
