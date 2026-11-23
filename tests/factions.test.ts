import { describe, expect, it } from 'vitest';
import { Difficulty } from '../src/ai/difficulty';
import { LORDS } from '../src/ai/lords';
import { STRATEGIES } from '../src/ai/strategies';
import { BUILDING_DEFS, BuildingType } from '../src/data/buildings';
import { FACTION_COUNT, FACTION_DEFS, Faction } from '../src/data/factions';
import { TECH_COUNT, TECH_DEFS, TechType } from '../src/data/techs';
import { restoreSim, snapshotSim } from '../src/game/save';
import { MAX_PLAYERS } from '../src/sim/players';
import { UNIT_DEFS, UnitType } from '../src/data/units';
import { createMatch } from '../src/game/match';
import { BuildStage } from '../src/render/arch/models';
import { renderBuilding } from '../src/render/building-art';
import { Comp } from '../src/sim/entities';

const TEAM = ['#1e3a8a', '#3a5fcd', '#7a9cf0'] as const;

describe('facciones', () => {
  it('cada corona tiene su unidad y su tecnología únicas, señores distintos y estrategias para la IA', () => {
    for (let f = 0; f < FACTION_COUNT; f++) {
      const def = FACTION_DEFS[f as Faction];
      expect(UNIT_DEFS[def.uniqueUnit].faction, def.name).toBe(f);
      expect(TECH_DEFS[def.uniqueTech].faction, def.name).toBe(f);
      expect(def.bonusText.length, def.name).toBeGreaterThan(0);
      const lords = LORDS[f as Faction].map((l) => l.name);
      expect(new Set(lords).size, def.name).toBe(lords.length);
      expect(lords.length, def.name).toBeGreaterThanOrEqual(3);
      expect(STRATEGIES[f as Faction].length, def.name).toBeGreaterThan(0);
      // Las estrategias usan la unidad única de su corona y ninguna de otra.
      for (const s of STRATEGIES[f as Faction]) {
        for (const u of Object.keys(s.army).map(Number) as UnitType[]) {
          const owner = UNIT_DEFS[u].faction;
          expect(owner === undefined || owner === f, `${def.name}: ${s.key}`).toBe(true);
        }
      }
    }
  });

  it('Corona de Aragón: arquitectura propia (gótico mediterráneo), distinta de las otras dos', () => {
    for (const t of [BuildingType.TownCenter, BuildingType.House, BuildingType.Castle, BuildingType.Cathedral]) {
      const cat = renderBuilding(t, 2, 'catalan', BuildStage.Complete, TEAM).rgba.join(',');
      expect(cat).not.toBe(renderBuilding(t, 2, 'gothic', BuildStage.Complete, TEAM).rgba.join(','));
      expect(cat).not.toBe(renderBuilding(t, 2, 'mudejar', BuildStage.Complete, TEAM).rgba.join(','));
    }
  });

  it('Corona de Aragón: el almogàver es infantería rápida que castiga a la caballería', () => {
    const a = UNIT_DEFS[UnitType.Almogavar];
    expect(a.classes).toContain('infantry');
    expect(a.speed).toBeGreaterThan(UNIT_DEFS[UnitType.Swordsman].speed);
    expect(a.attack?.bonus?.some((b) => b.vs === 'cavalry' && b.damage > 0)).toBe(true);
  });

  it('las siete arquitecturas son distintas entre sí', () => {
    const archs = Object.values(FACTION_DEFS).map((f) => f.architecture);
    expect(new Set(archs).size).toBe(FACTION_COUNT);
    for (const t of [BuildingType.TownCenter, BuildingType.House, BuildingType.Castle, BuildingType.Cathedral]) {
      const images = archs.map((a) => renderBuilding(t, 2, a, BuildStage.Complete, TEAM).rgba.join(','));
      expect(new Set(images).size, `edificio ${t}`).toBe(archs.length);
    }
  });

  it('Francia: el gendarme aguanta y pega más que el caballero; castillos más baratos y caballería pesada más acorazada', () => {
    const g = UNIT_DEFS[UnitType.Gendarme];
    const k = UNIT_DEFS[UnitType.Knight];
    expect(g.classes).toContain('cavalry');
    expect(g.hp).toBeGreaterThan(k.hp);
    expect(g.armor.melee).toBeGreaterThan(k.armor.melee);
    const m = createMatch({ seed: 'francia', mapSize: 'small', faction: Faction.Francia, rivals: [{ faction: Faction.Castilla, difficulty: Difficulty.Medium }] });
    const stats = m.sim.stats;
    expect(stats.buildingCost(1, BuildingType.Castle)[2]).toBe(Math.round(BUILDING_DEFS[BuildingType.Castle].cost[2] * 0.8));
    expect(stats.buildingCost(2, BuildingType.Castle)[2]).toBe(BUILDING_DEFS[BuildingType.Castle].cost[2]);
    expect(stats.unit(1, UnitType.Knight).armor.melee).toBe(stats.unit(2, UnitType.Knight).armor.melee + 1);
  });

  it('Reino Nazarí: el gazí cae sobre los arqueros y aguanta las flechas; murallas y torres más resistentes', () => {
    const g = UNIT_DEFS[UnitType.Gazi];
    expect(g.classes).toContain('infantry');
    expect(g.armor.pierce).toBeGreaterThanOrEqual(3);
    expect(g.attack?.bonus?.some((b) => b.vs === 'archer' && b.damage > 0)).toBe(true);
    const m = createMatch({ seed: 'nazari', mapSize: 'small', faction: Faction.Nazari, rivals: [{ faction: Faction.Castilla, difficulty: Difficulty.Medium }] });
    expect(m.sim.stats.building(1, BuildingType.StoneWall).hp).toBe(Math.round(m.sim.stats.building(2, BuildingType.StoneWall).hp * 1.2));
    expect(m.sim.stats.buildingCost(1, BuildingType.Farm)[1]).toBeLessThan(m.sim.stats.buildingCost(2, BuildingType.Farm)[1]);
  });

  it('Portugal: el besteiro también castiga a la caballería; más visión y ballesteros más baratos', () => {
    const b = UNIT_DEFS[UnitType.Besteiro];
    expect(b.classes).toContain('archer');
    expect(b.attack?.bonus?.some((x) => x.vs === 'cavalry' && x.damage > 0)).toBe(true);
    const m = createMatch({ seed: 'portugal', mapSize: 'small', faction: Faction.Portugal, rivals: [{ faction: Faction.Castilla, difficulty: Difficulty.Medium }] });
    const stats = m.sim.stats;
    expect(stats.unit(1, UnitType.Villager).los).toBe(stats.unit(2, UnitType.Villager).los + 1);
    expect(stats.unitCost(1, UnitType.Archer)[3]).toBeLessThan(stats.unitCost(2, UnitType.Archer)[3]);
  });

  it('Escocia: el schiltron es un lancero que aguanta las flechas; lanceros más baratos e infantería más acorazada', () => {
    const s = UNIT_DEFS[UnitType.Schiltron];
    expect(s.classes).toContain('spear');
    expect(s.armor.pierce).toBeGreaterThan(UNIT_DEFS[UnitType.Pikeman].armor.pierce);
    expect(s.attack?.bonus?.some((b) => b.vs === 'cavalry' && b.damage >= 14)).toBe(true);
    const m = createMatch({ seed: 'escocia', mapSize: 'small', faction: Faction.Escocia, rivals: [{ faction: Faction.Castilla, difficulty: Difficulty.Medium }] });
    const stats = m.sim.stats;
    expect(stats.unit(1, UnitType.Militia).armor.pierce).toBe(stats.unit(2, UnitType.Militia).armor.pierce + 1);
    expect(stats.unitCost(1, UnitType.Spearman)[0]).toBeLessThan(stats.unitCost(2, UnitType.Spearman)[0]);
  });

  it.each([Faction.Francia, Faction.Nazari, Faction.Portugal, Faction.Escocia])('una partida con la facción %i arranca y su IA crece', (faction) => {
    const m = createMatch({ seed: `faccion-${faction}`, mapSize: 'small', faction: Faction.Castilla, rivals: [{ faction, difficulty: Difficulty.Medium }] });
    expect(m.factions).toEqual([Faction.Castilla, faction]);
    expect(LORDS[faction as Faction].map((l) => l.name)).toContain(m.ais[0].lord.name);
    const villagers = () => {
      const e = m.sim.entities;
      let n = 0;
      for (const id of m.sim.unitIds) if (e.isAlive(id) && e.owner[id] === 2 && (e.mask[id] & Comp.Worker) !== 0) n++;
      return n;
    };
    const before = villagers();
    for (let i = 0; i < 20 * 120; i++) m.sim.step();
    expect(villagers()).toBeGreaterThan(before + 3);
  });

  it('una partida guardada cuando había menos tecnologías carga y conserva lo investigado', () => {
    const m = createMatch({ seed: 'vieja', mapSize: 'small', faction: Faction.Castilla, rivals: [{ faction: Faction.Inglaterra, difficulty: Difficulty.Medium }] });
    m.sim.players.researched[1 * TECH_COUNT + TechType.Mesta] = 1;
    m.sim.players.researched[2 * TECH_COUNT + TechType.Stakes] = 1;
    const snap = structuredClone(snapshotSim(m.sim));
    // El formato de antes de las facciones nuevas: 42 tecnologías por jugador.
    const OLD = 42;
    const players = snap.root.players as unknown as Record<'researched' | 'researching', Uint8Array>;
    for (const key of ['researched', 'researching'] as const) {
      const out = new Uint8Array(MAX_PLAYERS * OLD);
      for (let p = 0; p < MAX_PLAYERS; p++) out.set(players[key].subarray(p * TECH_COUNT, p * TECH_COUNT + OLD), p * OLD);
      players[key] = out;
    }
    const sim = restoreSim(snap);
    expect(sim.players.researched.length).toBe(MAX_PLAYERS * TECH_COUNT);
    expect(sim.players.hasTech(1, TechType.Mesta)).toBe(true);
    expect(sim.players.hasTech(2, TechType.Stakes)).toBe(true);
    expect(sim.players.hasTech(1, TechType.Stakes)).toBe(false);
    expect(sim.players.hasTech(1, TechType.Oriflamme)).toBe(false);
  });

  it('una partida con la Corona de Aragón arranca y su IA hace crecer su economía', () => {
    const m = createMatch({ seed: 'aragon', mapSize: 'medium', faction: Faction.Castilla, rivals: [{ faction: Faction.Aragon, difficulty: Difficulty.Medium }] });
    expect(m.factions).toEqual([Faction.Castilla, Faction.Aragon]);
    expect(m.ais[0].lord.name).toBeTruthy();
    const villagers = () => {
      const e = m.sim.entities;
      let n = 0;
      for (const id of m.sim.unitIds) if (e.isAlive(id) && e.owner[id] === 2 && (e.mask[id] & Comp.Worker) !== 0) n++;
      return n;
    };
    const before = villagers();
    for (let i = 0; i < 20 * 120; i++) m.sim.step();
    expect(villagers()).toBeGreaterThan(before + 3);
  });
});
