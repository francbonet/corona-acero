/** Clases de objetivo: sirven para los bonus de daño (contraataques) y para decidir a quién se ataca. */
export type UnitClass =
  | 'villager'
  | 'infantry'
  | 'spear'
  | 'archer'
  | 'cavalry'
  | 'animal'
  | 'herdable'
  | 'building'
  | 'siege'
  | 'monk'
  | 'gunpowder'
  | 'trader';

/** Qué se ve volar: flecha, piedra de trabuquete o bala de bombarda. */
export const ProjectileKind = { Arrow: 0, Stone: 1, Ball: 2 } as const;
export type ProjectileKind = (typeof ProjectileKind)[keyof typeof ProjectileKind];
/** Velocidad de cada proyectil, en casillas por segundo. */
export const PROJECTILE_SPEED: Readonly<Record<ProjectileKind, number>> = { 0: 7, 1: 4, 2: 9 };

/** Daño por tipo. El daño final es la suma de max(0, ataque − armadura) de cada tipo, más los bonus, y nunca menos de 1. */
export interface DamagePair {
  readonly melee: number;
  readonly pierce: number;
}

export interface AttackDef {
  readonly damage: DamagePair;
  /** Alcance en casillas (0 = cuerpo a cuerpo). */
  readonly range: number;
  /** Segundos entre ataques. */
  readonly reload: number;
  /** Bonus contra clases concretas: la base del triángulo de contraataques. */
  readonly bonus?: readonly { readonly vs: UnitClass; readonly damage: number }[];
  /** Alcance mínimo en casillas (trabuquete, bombarda). */
  readonly minRange?: number;
  readonly projectile?: ProjectileKind;
}

/** Comportamiento por defecto (las unidades del jugador lo pueden cambiar con las posturas). */
export const Stance = {
  /** Busca enemigos a la vista y los persigue. */
  Aggressive: 0,
  /** Busca enemigos a la vista, pero no se aleja mucho de donde estaba. */
  Defensive: 1,
  /** Solo ataca lo que tenga al alcance; no se mueve. */
  StandGround: 2,
  /** No ataca por su cuenta (aldeanos). */
  NoAttack: 3,
} as const;
export type Stance = (typeof Stance)[keyof typeof Stance];

export const STANCE_NAMES: Readonly<Record<Stance, string>> = {
  [Stance.Aggressive]: 'Agresiva',
  [Stance.Defensive]: 'Defensiva',
  [Stance.StandGround]: 'Mantener posición',
  [Stance.NoAttack]: 'No atacar',
};

