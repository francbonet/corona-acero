import { BuildingType } from './buildings';
import { ERA_DEFS } from './eras';
import type { Modifier } from './modifiers';
import { NodeType } from './nodes';
import { type Cost, cost } from './resources';
import { UnitType } from './units';

/** Tecnologías: se investigan en un edificio y cambian estadísticas (GDD §9). Valores propios y provisionales. */
export const TechType = {
  AdvanceBurgos: 0,
  AdvanceCoronas: 1,
  AdvancePolvora: 2,
  Gambeson: 3,
  Angarillas: 4,
  OxCart: 5,
  Fallow: 6,
  WaterMill: 7,
  CropRotation: 8,
  IronAxes: 9,
  WaterSawmill: 10,
  GoldShafts: 11,
  StoneWedges: 12,
  Forging: 13,
  Tempering: 14,
  ToledoSteel: 15,
  PaddedArmor: 16,
  MailArmor: 17,
  PlateArmor: 18,
  Fletching: 19,
  TemperedBolts: 20,
  GothicMasonry: 21,
  Bastions: 22,
  ArcFire: 23,
  FreeFairs: 24,
  BillsOfExchange: 25,
  Preaching: 26,
  Hospitallers: 27,
  RefinedPowder: 28,
  ManAtArms: 29,
  Swordsman: 30,
  VeteranSwordsman: 31,
  Pikeman: 32,
  Halberdier: 33,
  Crossbowman: 34,
  Paveser: 35,
  LightCavalry: 36,
  VeteranLightCavalry: 37,
  HeavyKnight: 38,
  Mesta: 39,
  Stakes: 40,
  DespertaFerro: 41,
  Oriflamme: 42,
  Alcazaba: 43,
  Aljubarrota: 44,
  Bannockburn: 45,
} as const;
export type TechType = (typeof TechType)[keyof typeof TechType];
export const TECH_COUNT = 46;

/** Dibujo del icono: una unidad (mejoras de línea) o un glifo genérico. */
export type TechIcon =
  | { readonly unit: UnitType }
  | { readonly glyph: 'era' | 'attack' | 'armor' | 'ranged' | 'wood' | 'gold' | 'stone' | 'farm' | 'villager' | 'building' | 'monk' | 'trade' | 'powder' | 'unique' };

export interface TechDef {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  /** Dónde se investiga. */
  readonly building: BuildingType;
  /** Era mínima. */
  readonly era: number;
  readonly cost: Cost;
  /** Segundos de investigación. */
  readonly time: number;
  readonly requires?: readonly TechType[];
  /** Solo para esta facción (tecnología única). */
  readonly faction?: number;
  /** Avanza a la era indicada. */
  readonly advance?: number;
  readonly effects: readonly Modifier[];
  readonly icon: TechIcon;
}

const INFANTRY = { classes: ['infantry' as const] };
const ARCHERS = { classes: ['archer' as const] };
const CAVALRY = { classes: ['cavalry' as const] };
const SPEARS = { classes: ['spear' as const] };
const FOOT = { classes: ['infantry' as const, 'archer' as const] };
const FORTIFICATIONS = [BuildingType.WatchTower, BuildingType.StoneWall, BuildingType.Gate, BuildingType.Castle];
const MELEE = { classes: ['infantry' as const, 'cavalry' as const] };
const VILLAGERS = { units: [UnitType.Villager] };

function advance(era: number, key: string): TechDef {
  const def = ERA_DEFS[era];
  return {
    key,
    name: `Avanzar a la ${def.title.toLowerCase()}`,
    description: def.description,
    building: BuildingType.TownCenter,
    era: era - 1,
    cost: def.cost,
    time: def.time,
    advance: era,
    effects: [],
    icon: { glyph: 'era' },
  };
}

function lineUpgrade(
  key: string,
  name: string,
  building: BuildingType,
  era: number,
  price: Cost,
  time: number,
  from: UnitType,
  to: UnitType,
  requires?: TechType,
): TechDef {
  return {
    key,
    name,
    description: 'Mejora las unidades existentes y las que se entrenen a partir de ahora.',
    building,
    era,
    cost: price,
    time,
    requires: requires === undefined ? undefined : [requires],
    effects: [{ kind: 'upgrade', from, to }],
    icon: { unit: to },
  };
}

export const TECH_DEFS: Readonly<Record<TechType, TechDef>> = {
  [TechType.AdvanceBurgos]: advance(1, 'avanzar_burgos'),
  [TechType.AdvanceCoronas]: advance(2, 'avanzar_coronas'),
  [TechType.AdvancePolvora]: advance(3, 'avanzar_polvora'),

  // ── Centro de la villa ──
  [TechType.Gambeson]: {
    key: 'jubon_acolchado',
    name: 'Jubón acolchado',
    description: 'Aldeanos +15 de vida y +1 de armadura perforante.',
    building: BuildingType.TownCenter,
    era: 0,
    cost: cost({ gold: 50 }),
    time: 25,
    effects: [
      { kind: 'unit', stat: 'hp', amount: 15, select: VILLAGERS },
      { kind: 'unit', stat: 'pierceArmor', amount: 1, select: VILLAGERS },
    ],
    icon: { glyph: 'villager' },
  },
  [TechType.Angarillas]: {
    key: 'angarillas',
    name: 'Angarillas',
    description: 'Aldeanos un 10 % más rápidos y +3 de carga.',
    building: BuildingType.TownCenter,
    era: 1,
    cost: cost({ food: 150, wood: 50 }),
    time: 50,
    effects: [
      { kind: 'unit', stat: 'speedPct', amount: 10, select: VILLAGERS },
      { kind: 'carry', amount: 3 },
    ],
    icon: { glyph: 'villager' },
  },
  [TechType.OxCart]: {
    key: 'carro_bueyes',
    name: 'Carro de bueyes',
    description: 'Aldeanos otro 10 % más rápidos y +5 de carga.',
    building: BuildingType.TownCenter,
    era: 2,
    cost: cost({ food: 300, wood: 200 }),
    time: 70,
    requires: [TechType.Angarillas],
    effects: [
      { kind: 'unit', stat: 'speedPct', amount: 10, select: VILLAGERS },
      { kind: 'carry', amount: 5 },
    ],
    icon: { glyph: 'villager' },
  },

  // ── Molino ──
  [TechType.Fallow]: {
    key: 'barbecho',
    name: 'Barbecho y abono',
    description: 'Las granjas dan +75 de comida.',
    building: BuildingType.Mill,
    era: 1,
    cost: cost({ wood: 80 }),
    time: 20,
    effects: [{ kind: 'farmFood', amount: 75 }],
    icon: { glyph: 'farm' },
  },
  [TechType.WaterMill]: {
    key: 'molino_hidraulico',
    name: 'Molino hidráulico',
    description: 'Granjas +75 de comida y se cultiva un 10 % más rápido.',
    building: BuildingType.Mill,
    era: 2,
    cost: cost({ food: 250, wood: 125 }),
    time: 45,
    requires: [TechType.Fallow],
    effects: [
      { kind: 'farmFood', amount: 75 },
      { kind: 'gather', nodes: [NodeType.Farm], pct: 10 },
    ],
    icon: { glyph: 'farm' },
  },
  [TechType.CropRotation]: {
    key: 'rotacion_trienal',
    name: 'Rotación trienal',
    description: 'Las granjas dan +100 de comida.',
    building: BuildingType.Mill,
    era: 3,
    cost: cost({ food: 400, wood: 250 }),
    time: 70,
    requires: [TechType.WaterMill],
    effects: [{ kind: 'farmFood', amount: 100 }],
    icon: { glyph: 'farm' },
  },

  // ── Aserradero y campamento minero ──
  [TechType.IronAxes]: {
    key: 'hachas_hierro',
    name: 'Hachas de hierro',
    description: 'Se tala un 15 % más rápido.',
    building: BuildingType.LumberCamp,
    era: 1,
    cost: cost({ food: 100, wood: 50 }),
    time: 25,
    effects: [{ kind: 'gather', nodes: [NodeType.Tree], pct: 15 }],
    icon: { glyph: 'wood' },
  },
  [TechType.WaterSawmill]: {
    key: 'serreria_hidraulica',
    name: 'Serrería hidráulica',
    description: 'Se tala otro 15 % más rápido.',
    building: BuildingType.LumberCamp,
    era: 2,
    cost: cost({ food: 150, wood: 100 }),
    time: 50,
    requires: [TechType.IronAxes],
    effects: [{ kind: 'gather', nodes: [NodeType.Tree], pct: 15 }],
    icon: { glyph: 'wood' },
  },
  [TechType.GoldShafts]: {
    key: 'pozos_malacate',
    name: 'Pozos con malacate',
    description: 'Se extrae oro un 15 % más rápido.',
    building: BuildingType.MiningCamp,
    era: 1,
    cost: cost({ food: 100, wood: 75 }),
    time: 30,
    effects: [{ kind: 'gather', nodes: [NodeType.Gold], pct: 15 }],
    icon: { glyph: 'gold' },
  },
  [TechType.StoneWedges]: {
    key: 'cunas_barrenos',
    name: 'Cuñas y barrenos',
    description: 'Se extrae piedra un 15 % más rápido.',
    building: BuildingType.MiningCamp,
    era: 1,
    cost: cost({ food: 100, wood: 75 }),
    time: 30,
    effects: [{ kind: 'gather', nodes: [NodeType.Stone], pct: 15 }],
    icon: { glyph: 'stone' },
  },

  // ── Herrería ──
  [TechType.Forging]: {
    key: 'forja',
    name: 'Forja',
    description: 'Infantería y caballería +1 de ataque.',
    building: BuildingType.Blacksmith,
    era: 1,
    cost: cost({ food: 150 }),
    time: 50,
    effects: [{ kind: 'unit', stat: 'melee', amount: 1, select: MELEE }],
    icon: { glyph: 'attack' },
  },
  [TechType.Tempering]: {
    key: 'templado',
    name: 'Templado',
    description: 'Infantería y caballería +1 de ataque.',
    building: BuildingType.Blacksmith,
    era: 2,
    cost: cost({ food: 220, gold: 120 }),
    time: 75,
    requires: [TechType.Forging],
    effects: [{ kind: 'unit', stat: 'melee', amount: 1, select: MELEE }],
    icon: { glyph: 'attack' },
  },
  [TechType.ToledoSteel]: {
    key: 'acero_toledo',
    name: 'Acero de Toledo',
    description: 'Infantería y caballería +2 de ataque.',
    building: BuildingType.Blacksmith,
    era: 3,
    cost: cost({ food: 275, gold: 225 }),
    time: 100,
    requires: [TechType.Tempering],
    effects: [{ kind: 'unit', stat: 'melee', amount: 2, select: MELEE }],
    icon: { glyph: 'attack' },
  },
  [TechType.PaddedArmor]: {
    key: 'gambeson',
    name: 'Gambesón',
    description: 'Infantería +1/+1 de armadura.',
    building: BuildingType.Blacksmith,
    era: 1,
    cost: cost({ food: 100 }),
    time: 40,
    effects: [
      { kind: 'unit', stat: 'meleeArmor', amount: 1, select: INFANTRY },
      { kind: 'unit', stat: 'pierceArmor', amount: 1, select: INFANTRY },
    ],
    icon: { glyph: 'armor' },
  },
  [TechType.MailArmor]: {
    key: 'loriga',
    name: 'Loriga',
    description: 'Infantería y caballería +1/+1 de armadura.',
    building: BuildingType.Blacksmith,
    era: 2,
    cost: cost({ food: 200, gold: 100 }),
    time: 70,
    requires: [TechType.PaddedArmor],
    effects: [
      { kind: 'unit', stat: 'meleeArmor', amount: 1, select: MELEE },
      { kind: 'unit', stat: 'pierceArmor', amount: 1, select: MELEE },
    ],
    icon: { glyph: 'armor' },
  },
  [TechType.PlateArmor]: {
    key: 'arnes_placas',
    name: 'Arnés de placas',
    description: 'Infantería y caballería +1/+2 de armadura.',
    building: BuildingType.Blacksmith,
    era: 3,
    cost: cost({ food: 300, gold: 150 }),
    time: 90,
    requires: [TechType.MailArmor],
    effects: [
      { kind: 'unit', stat: 'meleeArmor', amount: 1, select: MELEE },
      { kind: 'unit', stat: 'pierceArmor', amount: 2, select: MELEE },
    ],
    icon: { glyph: 'armor' },
  },
  [TechType.Fletching]: {
    key: 'ballesteria',
    name: 'Ballestería',
    description: 'Arqueros +1 de ataque y +1 de alcance.',
    building: BuildingType.Blacksmith,
    era: 1,
    cost: cost({ food: 100, wood: 50 }),
    time: 30,
    effects: [
      { kind: 'unit', stat: 'pierce', amount: 1, select: ARCHERS },
      { kind: 'unit', stat: 'range', amount: 1, select: ARCHERS },
    ],
    icon: { glyph: 'ranged' },
  },
  [TechType.TemperedBolts]: {
    key: 'saetas_templadas',
    name: 'Saetas templadas',
    description: 'Arqueros +1 de ataque.',
    building: BuildingType.Blacksmith,
    era: 2,
    cost: cost({ food: 200, gold: 100 }),
    time: 50,
    requires: [TechType.Fletching],
    effects: [{ kind: 'unit', stat: 'pierce', amount: 1, select: ARCHERS }],
    icon: { glyph: 'ranged' },
  },

  // ── Universidad ──
  [TechType.GothicMasonry]: {
    key: 'canteria_gotica',
    name: 'Cantería gótica',
    description: 'Edificios +15 % de vida y +1/+1 de armadura.',
    building: BuildingType.University,
    era: 2,
    cost: cost({ wood: 175, stone: 150 }),
    time: 50,
    effects: [
      { kind: 'building', stat: 'hpPct', amount: 15 },
      { kind: 'building', stat: 'meleeArmor', amount: 1 },
      { kind: 'building', stat: 'pierceArmor', amount: 1 },
    ],
    icon: { glyph: 'building' },
  },
  [TechType.Bastions]: {
    key: 'fortificacion_abaluartada',
    name: 'Fortificación abaluartada',
    description: 'Torres, castillos y murallas +20 % de vida; torres y castillos +1 de alcance.',
    building: BuildingType.University,
    era: 3,
    cost: cost({ food: 300, stone: 300 }),
    time: 60,
    requires: [TechType.GothicMasonry],
    effects: [
      { kind: 'building', stat: 'hpPct', amount: 20, buildings: [BuildingType.WatchTower, BuildingType.Castle, BuildingType.StoneWall, BuildingType.Gate] },
      { kind: 'building', stat: 'range', amount: 1, buildings: [BuildingType.WatchTower, BuildingType.Castle] },
    ],
    icon: { glyph: 'building' },
  },
  [TechType.ArcFire]: {
    key: 'tiro_parabolico',
    name: 'Tiro parabólico',
    description: 'Arqueros, torres, castillos y centros de la villa +1 de alcance.',
    building: BuildingType.University,
    era: 2,
    cost: cost({ wood: 300, gold: 175 }),
    time: 60,
    effects: [
      { kind: 'unit', stat: 'range', amount: 1, select: ARCHERS },
      { kind: 'building', stat: 'range', amount: 1, buildings: [BuildingType.WatchTower, BuildingType.Castle, BuildingType.TownCenter] },
    ],
    icon: { glyph: 'ranged' },
  },

  // ── Mercado ──
  [TechType.FreeFairs]: {
    key: 'ferias_francas',
    name: 'Ferias francas',
    description: 'Los carros de comercio traen un 25 % más de oro.',
    building: BuildingType.Market,
    era: 1,
    cost: cost({ food: 150, wood: 100 }),
    time: 40,
    effects: [{ kind: 'tradePct', pct: 25 }],
    icon: { glyph: 'trade' },
  },
  [TechType.BillsOfExchange]: {
    key: 'letras_cambio',
    name: 'Letras de cambio',
    description: 'Al vender en el mercado se cobra un 15 % más.',
    building: BuildingType.Market,
    era: 2,
    cost: cost({ food: 200, gold: 200 }),
    time: 50,
    effects: [{ kind: 'marketSell', pct: 15 }],
    icon: { glyph: 'trade' },
  },

  // ── Monasterio y fundición ──
  [TechType.Preaching]: {
    key: 'predicacion',
    name: 'Predicación',
    description: 'Los monjes convierten desde 3 casillas más lejos.',
    building: BuildingType.Monastery,
    era: 2,
    cost: cost({ gold: 150 }),
    time: 40,
    effects: [{ kind: 'monk', stat: 'convertRange', amount: 3 }],
    icon: { glyph: 'monk' },
  },
  [TechType.Hospitallers]: {
    key: 'hospitalarios',
    name: 'Hospitalarios',
    description: 'Los monjes curan el doble de rápido y tienen +15 de vida.',
    building: BuildingType.Monastery,
    era: 2,
    cost: cost({ gold: 200 }),
    time: 50,
    effects: [
      { kind: 'monk', stat: 'healPct', amount: 100 },
      { kind: 'unit', stat: 'hp', amount: 15, select: { units: [UnitType.Monk] } },
    ],
    icon: { glyph: 'monk' },
  },
  [TechType.RefinedPowder]: {
    key: 'polvora_refinada',
    name: 'Pólvora refinada',
    description: 'Arcabuceros y bombardas +3 de ataque y +1 de alcance.',
    building: BuildingType.Foundry,
    era: 3,
    cost: cost({ food: 300, gold: 300 }),
    time: 60,
    effects: [
      { kind: 'unit', stat: 'pierce', amount: 3, select: { classes: ['gunpowder'] } },
      { kind: 'unit', stat: 'range', amount: 1, select: { classes: ['gunpowder'] } },
    ],
    icon: { glyph: 'powder' },
  },

  // ── Mejoras de línea ──
  [TechType.ManAtArms]: lineUpgrade('hombre_de_armas', 'Hombre de armas', BuildingType.Barracks, 1, cost({ food: 100, gold: 40 }), 30, UnitType.Militia, UnitType.ManAtArms),
  [TechType.Swordsman]: lineUpgrade('espadachin', 'Espadachín', BuildingType.Barracks, 2, cost({ food: 150, gold: 65 }), 40, UnitType.ManAtArms, UnitType.Swordsman, TechType.ManAtArms),
  [TechType.VeteranSwordsman]: lineUpgrade('espadachin_veterano', 'Espadachín veterano', BuildingType.Barracks, 3, cost({ food: 300, gold: 100 }), 50, UnitType.Swordsman, UnitType.VeteranSwordsman, TechType.Swordsman),
  [TechType.Pikeman]: lineUpgrade('piquero', 'Piquero', BuildingType.Barracks, 2, cost({ food: 160, wood: 90 }), 40, UnitType.Spearman, UnitType.Pikeman),
  [TechType.Halberdier]: lineUpgrade('alabardero', 'Alabardero', BuildingType.Barracks, 3, cost({ food: 300, gold: 200 }), 50, UnitType.Pikeman, UnitType.Halberdier, TechType.Pikeman),
  [TechType.Crossbowman]: lineUpgrade('ballestero', 'Ballestero', BuildingType.ArcheryRange, 2, cost({ food: 125, gold: 75 }), 35, UnitType.Archer, UnitType.Crossbowman),
  [TechType.Paveser]: lineUpgrade('pavesero', 'Pavesero', BuildingType.ArcheryRange, 3, cost({ food: 300, gold: 200 }), 45, UnitType.Crossbowman, UnitType.Paveser, TechType.Crossbowman),
  [TechType.LightCavalry]: lineUpgrade('jinete_ligero', 'Jinete ligero', BuildingType.Stable, 1, cost({ food: 150 }), 30, UnitType.Scout, UnitType.LightCavalry),
  [TechType.VeteranLightCavalry]: lineUpgrade('jinete_ligero_veterano', 'Jinete ligero veterano', BuildingType.Stable, 2, cost({ food: 250, gold: 150 }), 45, UnitType.LightCavalry, UnitType.VeteranLightCavalry, TechType.LightCavalry),
  [TechType.HeavyKnight]: lineUpgrade('caballero_acorazado', 'Caballero acorazado', BuildingType.Stable, 3, cost({ food: 300, gold: 300 }), 60, UnitType.Knight, UnitType.HeavyKnight),

  // ── Tecnologías únicas (castillo) ──
  [TechType.Mesta]: {
    key: 'mesta',
    name: 'Mesta',
    description: 'Tecnología única de Castilla: las granjas dan +60 de comida y cuestan un 20 % menos.',
    building: BuildingType.Castle,
    era: 2,
    cost: cost({ food: 300, gold: 200 }),
    time: 50,
    faction: 0,
    effects: [
      { kind: 'farmFood', amount: 60 },
      { kind: 'cost', pct: -20, buildings: [BuildingType.Farm] },
    ],
    icon: { glyph: 'unique' },
  },
  [TechType.Stakes]: {
    key: 'estacas',
    name: 'Estacas',
    description: 'Tecnología única de Inglaterra: los arqueros clavan estacas: +4 de daño contra caballería.',
    building: BuildingType.Castle,
    era: 2,
    cost: cost({ food: 250, wood: 200 }),
    time: 45,
    faction: 1,
    effects: [{ kind: 'bonus', vs: 'cavalry', amount: 4, select: ARCHERS }],
    icon: { glyph: 'unique' },
  },
  [TechType.DespertaFerro]: {
    key: 'desperta_ferro',
    name: 'Desperta ferro',
    description: 'Tecnología única de la Corona de Aragón: el grito de guerra de los almogàvers: la infantería gana +1 de ataque y un 10 % de velocidad.',
    building: BuildingType.Castle,
    era: 2,
    cost: cost({ food: 300, gold: 250 }),
    time: 50,
    faction: 2,
    effects: [
      { kind: 'unit', stat: 'melee', amount: 1, select: INFANTRY },
      { kind: 'unit', stat: 'speedPct', amount: 10, select: INFANTRY },
    ],
    icon: { glyph: 'unique' },
  },
  [TechType.Oriflamme]: {
    key: 'oriflama',
    name: 'Oriflama',
    description: 'Tecnología única de Francia: el estandarte real sale a la batalla: la caballería gana +1 de ataque y +15 de vida.',
    building: BuildingType.Castle,
    era: 2,
    cost: cost({ food: 300, gold: 250 }),
    time: 50,
    faction: 3,
    effects: [
      { kind: 'unit', stat: 'melee', amount: 1, select: CAVALRY },
      { kind: 'unit', stat: 'hp', amount: 15, select: CAVALRY },
    ],
    icon: { glyph: 'unique' },
  },
  [TechType.Alcazaba]: {
    key: 'alcazaba',
    name: 'Alcazaba',
    description: 'Tecnología única del Reino Nazarí: torres, murallas, puertas y castillos ganan +2 de armadura cuerpo a cuerpo y a distancia.',
    building: BuildingType.Castle,
    era: 2,
    cost: cost({ wood: 250, stone: 200 }),
    time: 45,
    faction: 4,
    effects: [
      { kind: 'building', stat: 'meleeArmor', amount: 2, buildings: FORTIFICATIONS },
      { kind: 'building', stat: 'pierceArmor', amount: 2, buildings: FORTIFICATIONS },
    ],
    icon: { glyph: 'unique' },
  },
  [TechType.Aljubarrota]: {
    key: 'aljubarrota',
    name: 'Aljubarrota',
    description: 'Tecnología única de Portugal: la infantería y los tiradores aprenden a formar en cuadro: +1 de armadura cuerpo a cuerpo y a distancia.',
    building: BuildingType.Castle,
    era: 2,
    cost: cost({ food: 250, gold: 250 }),
    time: 45,
    faction: 5,
    effects: [
      { kind: 'unit', stat: 'meleeArmor', amount: 1, select: FOOT },
      { kind: 'unit', stat: 'pierceArmor', amount: 1, select: FOOT },
    ],
    icon: { glyph: 'unique' },
  },
  [TechType.Bannockburn]: {
    key: 'bannockburn',
    name: 'Bannockburn',
    description: 'Tecnología única de Escocia: los lanceros clavan las picas en el suelo: +1 de armadura cuerpo a cuerpo y +6 de daño contra caballería.',
    building: BuildingType.Castle,
    era: 2,
    cost: cost({ food: 250, wood: 200 }),
    time: 45,
    faction: 6,
    effects: [
      { kind: 'unit', stat: 'meleeArmor', amount: 1, select: SPEARS },
      { kind: 'bonus', vs: 'cavalry', amount: 6, select: SPEARS },
    ],
    icon: { glyph: 'unique' },
  },
};
