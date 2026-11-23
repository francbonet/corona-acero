import { BuildingType } from './buildings';
import type { EraModifier } from './modifiers';
import { NodeType } from './nodes';
import { TechType } from './techs';
import { UnitType } from './units';

/** Facciones (GDD §8). Todas comparten el árbol base; cambian sus bonus, su unidad y su tecnología únicas. */
export const Faction = {
  Castilla: 0,
  Inglaterra: 1,
  Aragon: 2,
  Francia: 3,
  Nazari: 4,
  Portugal: 5,
  Escocia: 6,
} as const;
export type Faction = (typeof Faction)[keyof typeof Faction];
export const FACTION_COUNT = 7;

/**
 * Arquitectura de cada corona: mudéjar de ladrillo (Castilla), gótica de piedra y entramado (Inglaterra), gótico
 * mediterráneo de arenisca (Corona de Aragón), gótico flamígero de caliza y pizarra azul (Francia), nazarí de tapial y
 * teja verde (Reino Nazarí), gótico portugués de caliza blanca y azulejo (Portugal) y casas-torre de piedra
 * enlucida (Escocia).
 */
export type Architecture = 'mudejar' | 'gothic' | 'catalan' | 'french' | 'nasrid' | 'portuguese' | 'scottish';

export interface FactionDef {
  readonly key: string;
  readonly name: string;
  readonly bonuses: readonly EraModifier[];
  /** Los bonus en palabras, para el menú y el HUD. */
  readonly bonusText: readonly string[];
  readonly uniqueUnit: UnitType;
  readonly uniqueTech: TechType;
  readonly architecture: Architecture;
}

export const FACTION_DEFS: Readonly<Record<Faction, FactionDef>> = {
  [Faction.Castilla]: {
    key: 'castilla',
    name: 'Castilla',
    bonuses: [
      { modifier: { kind: 'cost', pct: -15, units: { units: [UnitType.Scout, UnitType.LightCavalry, UnitType.VeteranLightCavalry, UnitType.Jinete] } } },
      { modifier: { kind: 'buildSpeedPct', pct: 15 } },
      { modifier: { kind: 'cost', pct: -10, units: { units: [UnitType.Villager] } } },
      { modifier: { kind: 'gather', nodes: [NodeType.Sheep, NodeType.Carcass], pct: 25 } },
      { modifier: { kind: 'unit', stat: 'hp', amount: 10, select: { classes: ['cavalry'] } } },
    ],
    bonusText: [
      'Caballería ligera un 15 % más barata',
      'Repoblación: los aldeanos cuestan un 10 % menos y construyen un 15 % más rápido',
      'Trashumancia: las ovejas y la caza se recogen un 25 % más rápido',
      'Órdenes militares: la caballería tiene +10 de vida',
    ],
    uniqueUnit: UnitType.Jinete,
    uniqueTech: TechType.Mesta,
    architecture: 'mudejar',
  },
  [Faction.Inglaterra]: {
    key: 'inglaterra',
    name: 'Inglaterra',
    bonuses: [
      { fromEra: 2, modifier: { kind: 'unit', stat: 'range', amount: 1, select: { classes: ['archer'] } } },
      { modifier: { kind: 'gather', nodes: [NodeType.Farm], pct: 10 } },
      { modifier: { kind: 'building', stat: 'hpPct', amount: 10, buildings: [BuildingType.WatchTower] } },
    ],
    bonusText: ['Arqueros +1 de alcance desde la era de las Coronas', 'Las granjas rinden un 10 % más', 'Torres +10 % de vida'],
    uniqueUnit: UnitType.Longbowman,
    uniqueTech: TechType.Stakes,
    architecture: 'gothic',
  },
  [Faction.Aragon]: {
    key: 'aragon',
    name: 'Corona de Aragón',
    bonuses: [
      { modifier: { kind: 'tradePct', pct: 10 } },
      { modifier: { kind: 'marketSell', pct: 5 } },
      { modifier: { kind: 'unit', stat: 'speedPct', amount: 10, select: { classes: ['infantry'] } } },
      { modifier: { kind: 'carry', amount: 1 } },
    ],
    bonusText: [
      'Consolat de Mar: el comercio rinde un 10 % más y el mercado paga un 5 % mejor',
      'Infantería un 10 % más rápida',
      'Mercaderes: los aldeanos cargan 1 recurso más',
    ],
    uniqueUnit: UnitType.Almogavar,
    uniqueTech: TechType.DespertaFerro,
    architecture: 'catalan',
  },
  [Faction.Francia]: {
    key: 'francia',
    name: 'Francia',
    bonuses: [
      { modifier: { kind: 'unit', stat: 'meleeArmor', amount: 1, select: { units: [UnitType.Knight, UnitType.HeavyKnight, UnitType.Gendarme] } } },
      { modifier: { kind: 'unit', stat: 'pierceArmor', amount: 1, select: { units: [UnitType.Knight, UnitType.HeavyKnight, UnitType.Gendarme] } } },
      { modifier: { kind: 'cost', pct: -20, buildings: [BuildingType.Castle] } },
      { modifier: { kind: 'gather', nodes: [NodeType.Berries], pct: 25 } },
    ],
    bonusText: ['Caballería pesada +1 de armadura cuerpo a cuerpo y a distancia', 'Castillos un 20 % más baratos', 'Las bayas se recogen un 25 % más rápido'],
    uniqueUnit: UnitType.Gendarme,
    uniqueTech: TechType.Oriflamme,
    architecture: 'french',
  },
  [Faction.Nazari]: {
    key: 'nazari',
    name: 'Reino Nazarí',
    bonuses: [
      {
        modifier: {
          kind: 'building',
          stat: 'hpPct',
          amount: 20,
          buildings: [BuildingType.WatchTower, BuildingType.StoneWall, BuildingType.Gate, BuildingType.Palisade],
        },
      },
      { modifier: { kind: 'cost', pct: -25, buildings: [BuildingType.Farm] } },
      { modifier: { kind: 'cost', pct: -15, units: { classes: ['infantry'] } } },
      { modifier: { kind: 'unit', stat: 'speedPct', amount: 10, select: { units: [UnitType.Scout, UnitType.LightCavalry, UnitType.VeteranLightCavalry] } } },
    ],
    bonusText: [
      'Murallas, puertas y torres +20 % de vida',
      'Acequias: las granjas cuestan un 25 % menos',
      'Voluntarios del Magreb: la infantería cuesta un 15 % menos',
      'Zenetes: la caballería ligera es un 10 % más rápida',
    ],
    uniqueUnit: UnitType.Gazi,
    uniqueTech: TechType.Alcazaba,
    architecture: 'nasrid',
  },
  [Faction.Portugal]: {
    key: 'portugal',
    name: 'Portugal',
    bonuses: [
      {
        modifier: {
          kind: 'unit',
          stat: 'los',
          amount: 1,
          select: { classes: ['villager', 'infantry', 'archer', 'cavalry', 'siege', 'monk', 'trader'] },
        },
      },
      { modifier: { kind: 'gather', nodes: [NodeType.Gold], pct: 15 } },
      { modifier: { kind: 'cost', pct: -15, units: { units: [UnitType.Archer, UnitType.Crossbowman, UnitType.Paveser, UnitType.Besteiro] } } },
    ],
    bonusText: ['Navegantes: todas las unidades +1 de visión', 'Feitorias: el oro se extrae un 15 % más rápido', 'Arqueros y ballesteros un 15 % más baratos'],
    uniqueUnit: UnitType.Besteiro,
    uniqueTech: TechType.Aljubarrota,
    architecture: 'portuguese',
  },
  [Faction.Escocia]: {
    key: 'escocia',
    name: 'Escocia',
    bonuses: [
      { modifier: { kind: 'cost', pct: -20, units: { units: [UnitType.Spearman, UnitType.Pikeman, UnitType.Halberdier, UnitType.Schiltron] } } },
      { modifier: { kind: 'unit', stat: 'pierceArmor', amount: 1, select: { classes: ['infantry'] } } },
      { modifier: { kind: 'unit', stat: 'hp', amount: 10, select: { classes: ['spear'] } } },
      { modifier: { kind: 'gather', nodes: [NodeType.Tree], pct: 15 } },
    ],
    bonusText: [
      'Lanceros un 20 % más baratos',
      'Clanes: la infantería tiene +1 de armadura a distancia y los lanceros +10 de vida',
      'Bosques de Caledonia: la madera se tala un 15 % más rápido',
    ],
    uniqueUnit: UnitType.Schiltron,
    uniqueTech: TechType.Bannockburn,
    architecture: 'scottish',
  },
};
