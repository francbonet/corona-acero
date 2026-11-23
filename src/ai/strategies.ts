import { BuildingType } from '../data/buildings';
import { Faction } from '../data/factions';
import { UnitType } from '../data/units';

/** Paso de la apertura: construir un edificio cuando se cumplan las condiciones. */
export interface BuildStep {
  readonly building: BuildingType;
  readonly villagers?: number;
  readonly era?: number;
  /** Cuántos de ese tipo debe haber (por defecto 1). */
  readonly count?: number;
}

/** Estrategia: apertura (orden de construcción), cuándo avanzar de era y qué ejército formar. */
export interface Strategy {
  readonly key: string;
  readonly name: string;
  readonly build: readonly BuildStep[];
  /** Aldeanos a partir de los cuales ahorra para avanzar a la era 1, 2 y 3. */
  readonly advanceAt: readonly number[];
  /** Peso de cada unidad base en el ejército (antes de ajustar por contraataques). */
  readonly army: Partial<Record<UnitType, number>>;
  /** Multiplica el tamaño de oleada (más bajo = ataca antes). */
  readonly aggression: number;
}

const ECONOMY: readonly BuildStep[] = [
  { building: BuildingType.LumberCamp, villagers: 6 },
  { building: BuildingType.Mill, villagers: 9 },
  { building: BuildingType.MiningCamp, villagers: 16 },
  { building: BuildingType.Barracks, villagers: 18 },
  { building: BuildingType.Blacksmith, era: 1 },
  { building: BuildingType.Market, era: 1, villagers: 30 },
  { building: BuildingType.LumberCamp, villagers: 30, count: 2 },
  { building: BuildingType.University, era: 2 },
  { building: BuildingType.SiegeWorkshop, era: 2 },
  { building: BuildingType.Monastery, era: 2, villagers: 45 },
];

/**
 * Estrategias por facción: Castilla tira de caballería y lanceros; Inglaterra, de arqueros; la Corona de Aragón, de infantería
 * ligera; Francia, de caballería pesada; el Reino Nazarí, de caballería ligera y gazíes; Portugal, de ballesteros;
 * Escocia, de lanceros.
 */
export const STRATEGIES: Readonly<Record<Faction, readonly Strategy[]>> = {
  [Faction.Castilla]: [
    {
      key: 'caballeria',
      name: 'Caballería castellana',
      build: [
        ...ECONOMY,
        { building: BuildingType.Stable, era: 1 },
        { building: BuildingType.ArcheryRange, era: 1, villagers: 28 },
        { building: BuildingType.Stable, era: 2, count: 2 },
        { building: BuildingType.Castle, era: 2, villagers: 40 },
      ],
      advanceAt: [20, 34, 50],
      army: { [UnitType.Scout]: 3, [UnitType.Knight]: 4, [UnitType.Spearman]: 2, [UnitType.Militia]: 2, [UnitType.Archer]: 1, [UnitType.Jinete]: 3, [UnitType.Ram]: 1 },
      aggression: 1,
    },
    {
      key: 'reconquista',
      name: 'Hueste de la Reconquista',
      // Caballería ligera para la frontera y lanceros que la cubran; jinetes en cuanto hay castillo.
      build: [
        ...ECONOMY,
        { building: BuildingType.Stable, era: 1 },
        { building: BuildingType.ArcheryRange, era: 1 },
        { building: BuildingType.Stable, era: 2, count: 2 },
        { building: BuildingType.Castle, era: 2, villagers: 45 },
      ],
      advanceAt: [19, 30, 48],
      army: { [UnitType.Scout]: 3, [UnitType.Spearman]: 2, [UnitType.Archer]: 2, [UnitType.Militia]: 1, [UnitType.Knight]: 2, [UnitType.Jinete]: 2, [UnitType.Ram]: 1 },
      aggression: 0.8,
    },
  ],
  [Faction.Inglaterra]: [
    {
      key: 'arqueros',
      name: 'Arqueros de Crécy',
      build: [...ECONOMY, { building: BuildingType.ArcheryRange, era: 1 }, { building: BuildingType.ArcheryRange, era: 2, count: 2 }, { building: BuildingType.Castle, era: 2, villagers: 40 }],
      advanceAt: [20, 34, 50],
      army: { [UnitType.Archer]: 4, [UnitType.Spearman]: 2, [UnitType.Militia]: 2, [UnitType.Longbowman]: 4, [UnitType.Ram]: 1 },
      aggression: 1,
    },
    {
      key: 'hombres_de_armas',
      name: 'Hombres de armas',
      build: [...ECONOMY, { building: BuildingType.ArcheryRange, era: 1 }, { building: BuildingType.Barracks, era: 1, count: 2 }, { building: BuildingType.Stable, era: 2 }],
      advanceAt: [19, 30, 48],
      army: { [UnitType.Militia]: 4, [UnitType.Archer]: 3, [UnitType.Spearman]: 1, [UnitType.Knight]: 1, [UnitType.Ram]: 1 },
      aggression: 0.8,
    },
  ],
  [Faction.Aragon]: [
    {
      key: 'almogavers',
      name: 'Companyia d\'almogàvers',
      // Infantería rápida desde el principio y almogàvers en cuanto hay castillo.
      build: [
        ...ECONOMY,
        { building: BuildingType.Barracks, era: 1, count: 2 },
        { building: BuildingType.ArcheryRange, era: 1, villagers: 28 },
        { building: BuildingType.Castle, era: 2, villagers: 40 },
      ],
      advanceAt: [20, 33, 50],
      army: { [UnitType.Militia]: 3, [UnitType.Spearman]: 3, [UnitType.Archer]: 2, [UnitType.Almogavar]: 4, [UnitType.Ram]: 1 },
      aggression: 0.9,
    },
    {
      key: 'mercaders',
      name: 'Mercaders de la Mediterrània',
      // Mercado pronto para aprovechar el Consolat de Mar; ballesteros y caballería detrás.
      build: [
        ...ECONOMY.map((s) => (s.building === BuildingType.Market ? { ...s, villagers: 24 } : s)),
        { building: BuildingType.ArcheryRange, era: 1 },
        { building: BuildingType.Stable, era: 2 },
        { building: BuildingType.Castle, era: 2, villagers: 45 },
      ],
      advanceAt: [19, 31, 48],
      army: { [UnitType.Archer]: 3, [UnitType.Spearman]: 2, [UnitType.Militia]: 1, [UnitType.Knight]: 2, [UnitType.Almogavar]: 2, [UnitType.Ram]: 1 },
      aggression: 1,
    },
  ],
  [Faction.Francia]: [
    {
      key: 'gendarmes',
      name: 'Compañías de ordenanza',
      // Caballería pesada en cuanto se puede y un castillo pronto (le sale más barato) para los gendarmes.
      build: [
        ...ECONOMY,
        { building: BuildingType.Stable, era: 1 },
        { building: BuildingType.ArcheryRange, era: 1, villagers: 28 },
        { building: BuildingType.Castle, era: 2, villagers: 36 },
        { building: BuildingType.Stable, era: 2, count: 2 },
      ],
      advanceAt: [20, 34, 50],
      army: { [UnitType.Knight]: 4, [UnitType.Gendarme]: 4, [UnitType.Spearman]: 2, [UnitType.Archer]: 2, [UnitType.Scout]: 1, [UnitType.Ram]: 1 },
      aggression: 1,
    },
    {
      key: 'cien_anos',
      name: 'Hueste de los Cien Años',
      // Ballesteros y hombres de armas con caballería detrás.
      build: [
        ...ECONOMY,
        { building: BuildingType.ArcheryRange, era: 1 },
        { building: BuildingType.Stable, era: 1, villagers: 26 },
        { building: BuildingType.Castle, era: 2, villagers: 40 },
      ],
      advanceAt: [19, 31, 48],
      army: { [UnitType.Archer]: 3, [UnitType.Militia]: 2, [UnitType.Spearman]: 2, [UnitType.Knight]: 2, [UnitType.Gendarme]: 2, [UnitType.Ram]: 1 },
      aggression: 0.9,
    },
  ],
  [Faction.Nazari]: [
    {
      key: 'frontera',
      name: 'Frontera de Granada',
      // Caballería ligera rápida para hostigar y gazíes contra los arqueros; torres y castillo para aguantar.
      build: [
        ...ECONOMY,
        { building: BuildingType.Stable, era: 1 },
        { building: BuildingType.ArcheryRange, era: 1, villagers: 26 },
        { building: BuildingType.Castle, era: 2, villagers: 40 },
        { building: BuildingType.Barracks, era: 2, count: 2 },
      ],
      advanceAt: [20, 33, 50],
      army: { [UnitType.Scout]: 3, [UnitType.Archer]: 2, [UnitType.Spearman]: 2, [UnitType.Militia]: 1, [UnitType.Gazi]: 4, [UnitType.Ram]: 1 },
      aggression: 0.9,
    },
    {
      key: 'voluntarios',
      name: 'Voluntarios de la Fe',
      // Infantería desde el principio, ballesteros detrás y gazíes en cuanto hay castillo.
      build: [
        ...ECONOMY,
        { building: BuildingType.Barracks, era: 1, count: 2 },
        { building: BuildingType.ArcheryRange, era: 1 },
        { building: BuildingType.Castle, era: 2, villagers: 42 },
      ],
      advanceAt: [19, 31, 48],
      army: { [UnitType.Militia]: 3, [UnitType.Spearman]: 2, [UnitType.Archer]: 3, [UnitType.Gazi]: 3, [UnitType.Ram]: 1 },
      aggression: 1,
    },
  ],
  [Faction.Portugal]: [
    {
      key: 'besteiros',
      name: 'Besteiros do conto',
      // Ballesteros baratos en masa, con lanceros delante.
      build: [
        ...ECONOMY,
        { building: BuildingType.ArcheryRange, era: 1 },
        { building: BuildingType.ArcheryRange, era: 2, count: 2 },
        { building: BuildingType.Castle, era: 2, villagers: 40 },
      ],
      advanceAt: [20, 34, 50],
      army: { [UnitType.Archer]: 4, [UnitType.Spearman]: 3, [UnitType.Militia]: 1, [UnitType.Besteiro]: 4, [UnitType.Ram]: 1 },
      aggression: 1,
    },
    {
      key: 'avis',
      name: 'Hueste de Avís',
      // Mercado y oro pronto (feitorias); ejército mixto de ballesteros y caballería.
      build: [
        ...ECONOMY.map((s) => (s.building === BuildingType.Market ? { ...s, villagers: 26 } : s)),
        { building: BuildingType.ArcheryRange, era: 1 },
        { building: BuildingType.Stable, era: 2 },
        { building: BuildingType.Castle, era: 2, villagers: 44 },
      ],
      advanceAt: [19, 31, 48],
      army: { [UnitType.Archer]: 3, [UnitType.Spearman]: 2, [UnitType.Knight]: 2, [UnitType.Scout]: 1, [UnitType.Besteiro]: 2, [UnitType.Ram]: 1 },
      aggression: 0.9,
    },
  ],
  [Faction.Escocia]: [
    {
      key: 'schiltrons',
      name: 'Schiltrons de Bannockburn',
      // Lanceros baratos y resistentes en bloque, con arqueros detrás.
      build: [
        ...ECONOMY,
        { building: BuildingType.Barracks, era: 1, count: 2 },
        { building: BuildingType.ArcheryRange, era: 1, villagers: 26 },
        { building: BuildingType.Castle, era: 2, villagers: 40 },
      ],
      advanceAt: [20, 33, 50],
      army: { [UnitType.Spearman]: 3, [UnitType.Militia]: 2, [UnitType.Archer]: 3, [UnitType.Schiltron]: 3, [UnitType.Ram]: 1 },
      aggression: 0.9,
    },
    {
      key: 'clanes',
      name: 'Clanes de las Highlands',
      // Infantería de choque con arqueros detrás; caballería ligera para los arqueros enemigos.
      build: [
        ...ECONOMY,
        { building: BuildingType.Barracks, era: 1 },
        { building: BuildingType.ArcheryRange, era: 1, villagers: 24 },
        { building: BuildingType.Stable, era: 2 },
        { building: BuildingType.Castle, era: 2, villagers: 44 },
      ],
      advanceAt: [19, 30, 48],
      army: { [UnitType.Militia]: 3, [UnitType.Archer]: 3, [UnitType.Spearman]: 2, [UnitType.Scout]: 1, [UnitType.Schiltron]: 2, [UnitType.Ram]: 1 },
      aggression: 0.8,
    },
  ],
};
