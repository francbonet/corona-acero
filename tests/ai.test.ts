import { describe, expect, it } from 'vitest';
import { AiPlayer } from '../src/ai/ai-player';
import { DIFFICULTY_DEFS, Difficulty, difficultyFromKey } from '../src/ai/difficulty';
import { LORDS } from '../src/ai/lords';
import { unitWeights } from '../src/ai/military';
import { STRATEGIES } from '../src/ai/strategies';
import { BuildingType } from '../src/data/buildings';
import { Faction } from '../src/data/factions';
import { UnitType } from '../src/data/units';
import { FP_SHIFT } from '../src/engine/fixed';
import { GameClient } from '../src/game/client';
import { setupMatch } from '../src/game/scenario';
import { Selection } from '../src/game/selection';
import { generateMatchMap } from '../src/map/generator';
import { kill } from '../src/sim/combat';
import { Comp } from '../src/sim/entities';
import { Simulation } from '../src/sim/simulation';
import { buildSnapshot } from '../src/ui/hud-model';

function match(seed: string, factions: readonly number[] = [Faction.Castilla, Faction.Inglaterra]) {
  const map = generateMatchMap({ width: 96, height: 96, seed, players: 2 });
  const sim = new Simulation({ map, seed: 11, tickRate: 20 });
  const starts = setupMatch(sim, factions);
  return { sim, starts };
}

function play(sim: Simulation, minutes: number, until: () => boolean = () => false): void {
  const end = sim.tick + Math.round(minutes * 60 * sim.tickRate);
  while (sim.tick < end && sim.winner === 0 && !until()) sim.step();
}

function owned(sim: Simulation, player: number, filter: (id: number) => boolean): number[] {
  const e = sim.entities;
  const out: number[] = [];
  for (let id = 1; id < e.highWater; id++) if (e.isAlive(id) && e.owner[id] === player && filter(id)) out.push(id);
  return out;
}

const builtOf = (sim: Simulation, player: number, type: BuildingType) =>
  owned(sim, player, (id) => sim.entities.has(id, Comp.Building) && sim.entities.buildingType[id] === type && sim.entities.built[id] === 1).length;

describe('IA: configuración', () => {
  it('lee la dificultad de la URL (media por defecto)', () => {
    expect(difficultyFromKey('facil')).toBe(Difficulty.Easy);
    expect(difficultyFromKey('dificil')).toBe(Difficulty.Hard);
    expect(difficultyFromKey(null)).toBe(Difficulty.Medium);
    expect(difficultyFromKey('imposible')).toBe(Difficulty.Medium);
  });

  it('elige estrategia y señor de su facción, siempre igual con la misma semilla', () => {
    const pick = () => {
      const { sim } = match('uno');
      const ai = new AiPlayer(sim, 2);
      return `${ai.strategy.key}/${ai.lord.name}`;
    };
    const { sim } = match('uno');
    const ai = new AiPlayer(sim, 2);
    expect(STRATEGIES[Faction.Inglaterra]).toContain(ai.strategy);
    expect(LORDS[Faction.Inglaterra]).toContain(ai.lord);
    expect(pick()).toBe(pick());
    expect(new AiPlayer(sim, 1, { strategy: 'reconquista' }).strategy.key).toBe('reconquista');
  });

  it('la dificultad difícil recibe su bonificación de recolección', () => {
    const { sim } = match('uno');
    new AiPlayer(sim, 2, { difficulty: Difficulty.Hard });
    expect(sim.players.gatherBonus[2]).toBe(DIFFICULTY_DEFS[Difficulty.Hard].gatherBonus);
  });
});

describe('IA: comportamiento', () => {
  it('abre la economía: a los 15 minutos tiene aldeanos, edificios básicos y la era II', () => {
    const { sim } = match('uno');
    sim.addController(new AiPlayer(sim, 1, { difficulty: Difficulty.Medium }));
    play(sim, 15);
    const villagers = owned(sim, 1, (id) => sim.entities.has(id, Comp.Unit) && sim.entities.unitType[id] === UnitType.Villager);
    expect(villagers.length).toBeGreaterThanOrEqual(22);
    expect(sim.players.era[1]).toBeGreaterThanOrEqual(1);
    for (const type of [BuildingType.Mill, BuildingType.LumberCamp, BuildingType.Barracks]) expect(builtOf(sim, 1, type)).toBeGreaterThan(0);
    expect(builtOf(sim, 1, BuildingType.House)).toBeGreaterThanOrEqual(5);
    expect(builtOf(sim, 1, BuildingType.Farm)).toBeGreaterThan(0);
  });

  it('respeta la niebla: solo recuerda edificios enemigos en casillas que ha llegado a ver', () => {
    const { sim } = match('dos');
    const ai = new AiPlayer(sim, 1);
    sim.addController(ai);
    play(sim, 1);
    expect(ai.memory.enemyBuildings.size).toBe(0); // la base enemiga está lejos y aún no la ha visto
    play(sim, 9, () => ai.memory.enemyBuildings.size > 0);
    expect(ai.memory.enemyBuildings.size).toBeGreaterThan(0); // el batidor la encontró
    for (const b of ai.memory.enemyBuildings.values()) expect(sim.visibility.isExplored(1, b.x, b.y)).toBe(true);
  });

  it('toca a rebato ante una incursión y vuelve al trabajo cuando pasa', () => {
    const { sim, starts } = match('tres');
    const ai = new AiPlayer(sim, 1);
    sim.addController(ai);
    play(sim, 5);
    const tc = starts[0].townCenter;
    const e = sim.entities;
    sim.schedule({ type: 'debugSpawn', player: 2, unitType: UnitType.Militia, tileX: e.tileX[tc] + 6, tileY: e.tileY[tc] + 6, count: 8 });
    play(sim, 0.5, () => (sim.garrisonCount.get(tc) ?? 0) > 0);
    expect(sim.garrisonCount.get(tc) ?? 0).toBeGreaterThan(0);
    // Desaparecen los asaltantes: al rato los aldeanos salen a trabajar.
    for (const id of owned(sim, 2, (id) => e.has(id, Comp.Unit) && e.unitType[id] === UnitType.Militia)) kill(sim, id);
    play(sim, 0.75, () => (sim.garrisonCount.get(tc) ?? 0) === 0);
    expect(sim.garrisonCount.get(tc) ?? 0).toBe(0);
  });

  it('pasado el asalto, los aldeanos salen aunque ronden aldeanos enemigos cerca de sus edificios', () => {
    const { sim, starts } = match('tres');
    const ai = new AiPlayer(sim, 1);
    sim.addController(ai);
    play(sim, 5);
    const tc = starts[0].townCenter;
    const e = sim.entities;
    sim.schedule({ type: 'debugSpawn', player: 2, unitType: UnitType.Militia, tileX: e.tileX[tc] + 6, tileY: e.tileY[tc] + 6, count: 8 });
    play(sim, 0.5, () => (sim.garrisonCount.get(tc) ?? 0) > 0);
    expect(sim.garrisonCount.get(tc) ?? 0).toBeGreaterThan(0);
    // Se van los soldados, pero quedan dos aldeanos enemigos junto a la aldea: no son peligro.
    for (const id of owned(sim, 2, (id) => e.has(id, Comp.Unit) && e.unitType[id] === UnitType.Militia)) kill(sim, id);
    sim.schedule({ type: 'debugSpawn', player: 2, unitType: UnitType.Villager, tileX: e.tileX[tc] + 9, tileY: e.tileY[tc] + 2, count: 2 });
    play(sim, 0.75, () => (sim.garrisonCount.get(tc) ?? 0) === 0);
    expect(sim.garrisonCount.get(tc) ?? 0).toBe(0);
    expect(owned(sim, 2, (id) => e.has(id, Comp.Unit) && e.unitType[id] === UnitType.Villager && e.x[id] >> 8 > e.tileX[tc] + 5).length).toBeGreaterThan(0);
  });

  it('contrarresta lo que ve: más lanceros ante caballería, más infantería ante lanceros', () => {
    const { sim } = match('uno');
    const ai = new AiPlayer(sim, 1, { strategy: 'caballeria' });
    const base = unitWeights(ai);
    ai.memory.seen.set('cavalry', 20);
    ai.memory.seen.set('infantry', 2);
    expect(unitWeights(ai).get(UnitType.Spearman) ?? 0).toBeGreaterThan(base.get(UnitType.Spearman) ?? 0);
    ai.memory.seen.clear();
    ai.memory.seen.set('infantry', 20);
    ai.memory.seen.set('spear', 18);
    const vsSpears = unitWeights(ai);
    expect(vsSpears.get(UnitType.Militia) ?? 0).toBeGreaterThan(base.get(UnitType.Militia) ?? 0);
    expect(vsSpears.get(UnitType.Scout) ?? 0).toBeLessThan(base.get(UnitType.Scout) ?? 0);
  });

  it('se rinde cuando no le queda con qué seguir, y gana el otro', () => {
    const { sim } = match('uno');
    sim.addController(new AiPlayer(sim, 2));
    play(sim, 0.5);
    const e = sim.entities;
    // Se queda sin aldeanos ni centro de la villa (solo con el batidor).
    for (const id of owned(sim, 2, (id) => e.unitType[id] === UnitType.Villager || e.has(id, Comp.Building))) kill(sim, id);
    play(sim, 0.5);
    expect(sim.players.defeated[2]).toBe(1);
    expect(owned(sim, 2, (id) => e.has(id, Comp.Unit) || e.has(id, Comp.Building))).toEqual([]);
    expect(sim.winner).toBe(1);
  });

  it('rendirse deja al jugador derrotado y sin nada en el mapa', () => {
    const { sim } = match('uno');
    sim.schedule({ type: 'resign', player: 2 });
    sim.step();
    const e = sim.entities;
    expect(sim.players.defeated[2]).toBe(1);
    expect(owned(sim, 2, (id) => e.has(id, Comp.Unit) || e.has(id, Comp.Building))).toEqual([]);
    play(sim, 0.1);
    expect(sim.winner).toBe(1);
    expect(sim.winReason).toBe('conquest');
  });
});

describe('IA: determinismo', () => {
  it('IA contra IA con la misma semilla da el mismo estado tick a tick', () => {
    const runOnce = () => {
      const { sim } = match('cinco');
      sim.addController(new AiPlayer(sim, 1, { difficulty: Difficulty.Hard }));
      sim.addController(new AiPlayer(sim, 2, { difficulty: Difficulty.Medium }));
      const hashes: number[] = [];
      for (let i = 0; i < 8 * 60 * 20; i++) {
        sim.step();
        if (i % 600 === 0) hashes.push(sim.stateHash());
      }
      const e = sim.entities;
      const units = owned(sim, 1, (id) => e.has(id, Comp.Unit)).length + owned(sim, 2, (id) => e.has(id, Comp.Unit)).length;
      return { hashes, units, x: owned(sim, 2, (id) => e.has(id, Comp.Unit)).map((id) => e.x[id] >> FP_SHIFT) };
    };
    const a = runOnce();
    const b = runOnce();
    expect(a.units).toBeGreaterThan(30); // las dos IAs han crecido
    expect(b.hashes).toEqual(a.hashes);
    expect(b.x).toEqual(a.x);
  }, 60_000);
});

describe('IA: avisos del cliente', () => {
  it('avisa de los ataques sin repetirse y nombra al señor rival', () => {
    const { sim } = match('uno');
    const client = new GameClient(sim, new Selection(), 1, () => {}, () => 0);
    client.rivals.push({ player: 2, name: 'Eduardo III de Windsor', detail: 'Inglaterra · Media' });
    const hit = { kind: 'attacked', player: 1, x: 256 * 10, y: 256 * 12 } as const;
    client.handleEvents([hit]);
    client.handleEvents([hit]);
    expect(client.activeNotices().filter((n) => n.startsWith('¡Nos atacan!'))).toHaveLength(1);
    expect(client.lastAttack).toEqual({ x: 256 * 10, y: 256 * 12 });
    client.handleEvents([{ kind: 'attacked', player: 2, x: 0, y: 0 }]); // a otro jugador: nada
    expect(client.lastAttack).toEqual({ x: 256 * 10, y: 256 * 12 });
    client.handleEvents([{ kind: 'defeat', player: 2, resigned: true }]);
    expect(client.activeNotices()).toContain('Eduardo III de Windsor se ha rendido');
    const icons = { of: () => '', resource: () => '', shield: () => '' } as unknown as Parameters<typeof buildSnapshot>[1];
    expect(buildSnapshot(client, icons).rivals).toMatchObject([{ name: 'Eduardo III de Windsor', detail: 'Inglaterra · Media', defeated: false }]);
  });
});
