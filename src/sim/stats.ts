import { BUILDING_DEFS, BuildingType } from '../data/buildings';
import { type DamagePair, ProjectileKind, type UnitClass } from '../data/combat';
import { FACTION_DEFS, type Faction } from '../data/factions';
import type { Modifier, UnitSelector } from '../data/modifiers';
import { NODE_DEFS } from '../data/nodes';
import { type Cost, RESOURCE_COUNT } from '../data/resources';
import { TECH_COUNT, TECH_DEFS, type TechType } from '../data/techs';
import { UNIT_DEFS, type UnitType } from '../data/units';
import { FP_ONE } from '../engine/fixed';
import { MAX_PLAYERS } from './players';
import type { Simulation } from './simulation';

/** Ataque ya convertido a unidades de la simulación. */
export interface AttackStats {
  readonly melee: number;
  readonly pierce: number;
  /** Alcance en punto fijo (0 = cuerpo a cuerpo). */
  readonly range: number;
  readonly minRange: number;
  readonly reloadTicks: number;
  readonly bonus: readonly { readonly vs: UnitClass; readonly damage: number }[];
  readonly projectile: ProjectileKind;
}

/** Estadísticas efectivas de un tipo de unidad para un jugador (datos + facción + tecnologías). */
export interface UnitStats {
  readonly hp: number;
  /** Punto fijo por tick. */
  readonly speed: number;
  readonly attack: AttackStats | null;
  readonly armor: DamagePair;
  readonly los: number;
  readonly classes: ReadonlySet<UnitClass>;
}

export interface BuildingStats {
  readonly hp: number;
  readonly armor: DamagePair;
  readonly attack: AttackStats | null;
}

/** Alcance base de conversión de un monje (casillas). */
export const MONK_RANGE = 8;

interface Economy {
  readonly gatherPct: Int32Array;
  carry: number;
  farmFood: number;
  tradePct: number;
  marketSell: number;
  convertRange: number;
  healPct: number;
  buildSpeedPct: number;
  readonly upgrades: Map<number, number>;
}

function matches(select: UnitSelector | undefined, type: UnitType): boolean {
  if (!select) return false;
  if (select.units?.includes(type)) return true;
  const classes = UNIT_DEFS[type].classes;
  return select.classes?.some((c) => classes.includes(c)) ?? false;
}

function pct(value: number, percent: number): number {
  return (value * (100 + percent)) / 100;
}

/**
 * Estadísticas efectivas por jugador, calculadas a partir de los datos y de los modificadores activos
 * (bonus de facción según la era y tecnologías investigadas). Se cachean y se invalidan al investigar.
 */
export class StatsCache {
  private readonly units: (UnitStats | undefined)[][] = [];
  private readonly buildings: (BuildingStats | undefined)[][] = [];
  private readonly economy: (Economy | undefined)[] = new Array(MAX_PLAYERS).fill(undefined);
  private readonly mods: (Modifier[] | undefined)[] = new Array(MAX_PLAYERS).fill(undefined);

  constructor(private readonly sim: Simulation) {
    for (let p = 0; p < MAX_PLAYERS; p++) {
      this.units.push([]);
      this.buildings.push([]);
    }
  }

  invalidate(player: number): void {
    this.units[player] = [];
    this.buildings[player] = [];
    this.economy[player] = undefined;
    this.mods[player] = undefined;
  }

  /** Modificadores activos del jugador: bonus de su facción (según su era) y tecnologías investigadas. */
  modifiers(player: number): readonly Modifier[] {
    let list = this.mods[player];
    if (list) return list;
    list = [];
    const players = this.sim.players;
    if (player !== 0 && players.active[player]) {
      const era = players.era[player];
      for (const b of FACTION_DEFS[players.faction[player] as Faction].bonuses) if ((b.fromEra ?? 0) <= era) list.push(b.modifier);
    }
    for (let t = 0; t < TECH_COUNT; t++) if (players.hasTech(player, t)) list.push(...TECH_DEFS[t as TechType].effects);
    this.mods[player] = list;
    return list;
  }

  unit(player: number, type: UnitType): UnitStats {
    let s = this.units[player][type];
    if (s) return s;
    const def = UNIT_DEFS[type];
    let hp = def.hp;
    let melee = def.attack?.damage.melee ?? 0;
    let pierce = def.attack?.damage.pierce ?? 0;
    let meleeArmor = def.armor.melee;
    let pierceArmor = def.armor.pierce;
    let range = def.attack?.range ?? 0;
    let los = def.los;
    let speedPct = 0;
    const bonus = [...(def.attack?.bonus ?? [])];
    for (const m of this.modifiers(player)) {
      if (m.kind === 'unit' && matches(m.select, type)) {
        if (m.stat === 'hp') hp += m.amount;
        else if (m.stat === 'melee') melee += m.amount;
        else if (m.stat === 'pierce') pierce += m.amount;
        else if (m.stat === 'meleeArmor') meleeArmor += m.amount;
        else if (m.stat === 'pierceArmor') pierceArmor += m.amount;
        else if (m.stat === 'range' && range > 0) range += m.amount;
        else if (m.stat === 'los') los += m.amount;
        else if (m.stat === 'speedPct') speedPct += m.amount;
      } else if (m.kind === 'bonus' && matches(m.select, type) && def.attack) {
        bonus.push({ vs: m.vs, damage: m.amount });
      }
    }
    const tickRate = this.sim.tickRate;
    const attack: AttackStats | null = def.attack
      ? {
          melee: def.attack.damage.melee > 0 || melee > 0 ? melee : 0,
          pierce: def.attack.damage.pierce > 0 ? pierce : 0,
          range: Math.round(range * FP_ONE),
          minRange: Math.round((def.attack.minRange ?? 0) * FP_ONE),
          reloadTicks: Math.max(1, Math.round(def.attack.reload * tickRate)),
          bonus,
          projectile: def.attack.projectile ?? ProjectileKind.Arrow,
        }
      : null;
    s = {
      hp,
      speed: Math.max(1, Math.round((pct(def.speed, speedPct) * FP_ONE) / tickRate)),
      attack,
      armor: { melee: meleeArmor, pierce: pierceArmor },
      los,
      classes: new Set(def.classes),
    };
    this.units[player][type] = s;
    return s;
  }

  building(player: number, type: BuildingType): BuildingStats {
    let s = this.buildings[player][type];
    if (s) return s;
    const def = BUILDING_DEFS[type];
    let hpPct = 0;
    let meleeArmor = def.armor.melee;
    let pierceArmor = def.armor.pierce;
    let range = def.attack?.range ?? 0;
    for (const m of this.modifiers(player)) {
      if (m.kind !== 'building' || (m.buildings && !m.buildings.includes(type))) continue;
      if (m.stat === 'hpPct') hpPct += m.amount;
      else if (m.stat === 'meleeArmor') meleeArmor += m.amount;
      else if (m.stat === 'pierceArmor') pierceArmor += m.amount;
      else if (m.stat === 'range' && def.attack) range += m.amount;
    }
    s = {
      hp: Math.round(pct(def.hp, hpPct)),
      armor: { melee: meleeArmor, pierce: pierceArmor },
      attack: def.attack
        ? {
            melee: def.attack.damage.melee,
            pierce: def.attack.damage.pierce,
            range: Math.round(range * FP_ONE),
            minRange: 0,
            reloadTicks: Math.max(1, Math.round(def.attack.reload * this.sim.tickRate)),
            bonus: def.attack.bonus ?? [],
            projectile: ProjectileKind.Arrow,
          }
        : null,
    };
    this.buildings[player][type] = s;
    return s;
  }

  unitCost(player: number, type: UnitType): Cost {
    let percent = 0;
    for (const m of this.modifiers(player)) if (m.kind === 'cost' && matches(m.units, type)) percent += m.pct;
    return applyCost(UNIT_DEFS[type].cost, percent);
  }

  buildingCost(player: number, type: BuildingType): Cost {
    let percent = 0;
    for (const m of this.modifiers(player)) if (m.kind === 'cost' && m.buildings?.includes(type)) percent += m.pct;
    return applyCost(BUILDING_DEFS[type].cost, percent);
  }

  /** Ritmo de recolección (1/256 de unidad por tick). */
  gatherRate(player: number, nodeType: number): number {
    const def = NODE_DEFS[nodeType as keyof typeof NODE_DEFS];
    if (!def) return 0;
    const base = (def.gatherRate * FP_ONE) / this.sim.tickRate;
    return Math.max(1, Math.round(pct(base, this.eco(player).gatherPct[nodeType] + this.sim.players.gatherBonus[player])));
  }

  carry(player: number, type: UnitType): number {
    const base = UNIT_DEFS[type].carry ?? 0;
    return base > 0 ? base + this.eco(player).carry : 0;
  }

  farmFood(player: number): number {
    return (BUILDING_DEFS[BuildingType.Farm].food ?? 0) + this.eco(player).farmFood;
  }

  buildSpeedPct(player: number): number {
    return this.eco(player).buildSpeedPct;
  }

  tradePct(player: number): number {
    return this.eco(player).tradePct;
  }

  /** Porcentaje del precio que se cobra al vender en el mercado. */
  sellPct(player: number): number {
    return 70 + this.eco(player).marketSell;
  }

  convertRange(player: number): number {
    return (MONK_RANGE + this.eco(player).convertRange) * FP_ONE;
  }

  healPct(player: number): number {
    return this.eco(player).healPct;
  }

  /** Versión actual de una línea de unidades (milicia → hombre de armas → …). */
  trainedType(player: number, base: UnitType): UnitType {
    const up = this.eco(player).upgrades;
    let t: number = base;
    for (let guard = 0; up.has(t) && guard < 8; guard++) t = up.get(t) as number;
    return t as UnitType;
  }

  /** Unidades que entrena un edificio para este jugador (el castillo, la unidad única de su facción). */
  trainsFor(player: number, type: BuildingType): readonly UnitType[] {
    if (type === BuildingType.Castle) return [FACTION_DEFS[this.sim.players.faction[player] as Faction].uniqueUnit];
    return BUILDING_DEFS[type].trains;
  }

  private eco(player: number): Economy {
    let e = this.economy[player];
    if (e) return e;
    e = { gatherPct: new Int32Array(16), carry: 0, farmFood: 0, tradePct: 0, marketSell: 0, convertRange: 0, healPct: 0, buildSpeedPct: 0, upgrades: new Map() };
    for (const m of this.modifiers(player)) {
      if (m.kind === 'gather') for (const n of m.nodes) e.gatherPct[n] += m.pct;
      else if (m.kind === 'carry') e.carry += m.amount;
      else if (m.kind === 'farmFood') e.farmFood += m.amount;
      else if (m.kind === 'tradePct') e.tradePct += m.pct;
      else if (m.kind === 'marketSell') e.marketSell += m.pct;
      else if (m.kind === 'buildSpeedPct') e.buildSpeedPct += m.pct;
      else if (m.kind === 'monk') {
        if (m.stat === 'convertRange') e.convertRange += m.amount;
        else e.healPct += m.amount;
      } else if (m.kind === 'upgrade') e.upgrades.set(m.from, m.to);
    }
    this.economy[player] = e;
    return e;
  }
}

function applyCost(base: Cost, percent: number): Cost {
  if (percent === 0) return base;
  const out = [0, 0, 0, 0];
  for (let r = 0; r < RESOURCE_COUNT; r++) out[r] = Math.round(pct(base[r], percent));
  return out as unknown as Cost;
}
