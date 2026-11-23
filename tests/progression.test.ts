import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/data/buildings';
import { Faction } from '../src/data/factions';
import { NodeType } from '../src/data/nodes';
import { Resource } from '../src/data/resources';
import { TECH_DEFS, TechType } from '../src/data/techs';
import { UNIT_DEFS, UnitType } from '../src/data/units';
import { FP_ONE, tileCenterFixed } from '../src/engine/fixed';
import { GameMap } from '../src/map/game-map';
import { generateMatchMap } from '../src/map/generator';
import { Deposit } from '../src/map/terrain';
import { Comp } from '../src/sim/entities';
import { Simulation } from '../src/sim/simulation';
import { researchBlocker } from '../src/sim/tech';
import { TICK_RATE, run, runUntil } from './helpers/world';

/** Mundo llano con dos jugadores (1 azul Castilla, 2 rojo Inglaterra) y recursos de sobra. */
function world(size = 48, f1: number = Faction.Castilla, f2: number = Faction.Inglaterra): Simulation {
  const sim = new Simulation({ map: new GameMap(size, size), seed: 3, tickRate: TICK_RATE });
  sim.addPlayer(1, f1);
  sim.addPlayer(2, f2);
  sim.players.set(1, [20000, 20000, 20000, 20000]);
  sim.players.set(2, [20000, 20000, 20000, 20000]);
  return sim;
}

function unitsOf(sim: Simulation, owner: number, type?: UnitType): number[] {
  const e = sim.entities;
  const out: number[] = [];
  for (let id = 1; id < e.highWater; id++) {
    if (e.has(id, Comp.Unit) && e.owner[id] === owner && (type === undefined || e.unitType[id] === type)) out.push(id);
  }
  return out;
}

function researchNow(sim: Simulation, player: number, building: number, tech: TechType): void {
  sim.schedule({ type: 'research', player, building, tech });
  run(sim, TECH_DEFS[tech].time * TICK_RATE + 2);
}

describe('eras', () => {
  it('avanzar exige dos edificios distintos de la era actual, cobra y tarda lo previsto', () => {
    const sim = world();
    const tc = sim.placeBuilding(BuildingType.TownCenter, 1, 4, 4);
    run(sim, 1);
    expect(researchBlocker(sim, 1, TechType.AdvanceBurgos)).toMatch(/Requiere 2 edificios/);
    sim.placeBuilding(BuildingType.Barracks, 1, 12, 4);
    sim.placeBuilding(BuildingType.Mill, 1, 12, 10);
    run(sim, 1);
    expect(researchBlocker(sim, 1, TechType.AdvanceBurgos)).toBeNull();
    const food = sim.players.get(1, Resource.Food);
    sim.schedule({ type: 'research', player: 1, building: tc, tech: TechType.AdvanceBurgos });
    run(sim, 2);
    expect(sim.players.get(1, Resource.Food)).toBe(food - 400);
    run(sim, 110 * TICK_RATE - 5);
    expect(sim.players.era[1]).toBe(0);
    run(sim, 10);
    expect(sim.players.era[1]).toBe(1);
  });

  it('las unidades y edificios de una era no se pueden hacer antes', () => {
    const sim = world();
    const barracks = sim.placeBuilding(BuildingType.Barracks, 1, 12, 4);
    const v = sim.spawnUnit(UnitType.Villager, 1, tileCenterFixed(10), tileCenterFixed(10));
    sim.schedule({ type: 'train', player: 1, building: barracks, unitType: UnitType.Spearman });
    sim.schedule({ type: 'build', player: 1, units: [v], buildingType: BuildingType.Market, tileX: 20, tileY: 20, queue: false });
    run(sim, 2);
    expect(sim.entities.queue[barracks] ?? []).toHaveLength(0);
    expect(sim.grid.occupantAt(20, 20)).toBe(0);
    sim.players.era[1] = 1;
    sim.schedule({ type: 'train', player: 1, building: barracks, unitType: UnitType.Spearman });
    sim.schedule({ type: 'build', player: 1, units: [v], buildingType: BuildingType.Market, tileX: 20, tileY: 20, queue: false });
    run(sim, 2);
    expect(sim.entities.queue[barracks]).toHaveLength(1);
    expect(sim.grid.occupantAt(20, 20)).not.toBe(0);
  });
});

describe('tecnologías', () => {
  it('la herrería mejora el ataque y el jubón da vida a los aldeanos que ya existen', () => {
    const sim = world();
    sim.players.era[1] = 1;
    const tc = sim.placeBuilding(BuildingType.TownCenter, 1, 4, 4);
    const smith = sim.placeBuilding(BuildingType.Blacksmith, 1, 12, 4);
    const v = sim.spawnUnit(UnitType.Villager, 1, tileCenterFixed(10), tileCenterFixed(12));
    sim.entities.hp[v] = 20;
    expect(sim.stats.unit(1, UnitType.Militia).attack!.melee).toBe(5);
    researchNow(sim, 1, smith, TechType.Forging);
    expect(sim.stats.unit(1, UnitType.Militia).attack!.melee).toBe(6);
    expect(sim.stats.unit(2, UnitType.Militia).attack!.melee).toBe(5); // el rival no la tiene
    researchNow(sim, 1, tc, TechType.Gambeson);
    expect(sim.entities.maxHp[v]).toBe(40);
    expect(sim.entities.hp[v]).toBe(35);
  });

  it('las hachas de hierro hacen talar más rápido', () => {
    const sim = world();
    const before = sim.stats.gatherRate(1, 1);
    sim.players.era[1] = 1;
    const camp = sim.placeBuilding(BuildingType.LumberCamp, 1, 12, 4);
    researchNow(sim, 1, camp, TechType.IronAxes);
    expect(sim.stats.gatherRate(1, 1)).toBeGreaterThan(before * 1.1);
  });

  it('una mejora de línea convierte las unidades existentes y las futuras', () => {
    const sim = world();
    sim.players.era[1] = 1;
    const barracks = sim.placeBuilding(BuildingType.Barracks, 1, 12, 4);
    sim.placeBuilding(BuildingType.House, 1, 30, 30); // población para entrenar
    const old = sim.spawnGroup(UnitType.Militia, 1, 20, 20, 3);
    researchNow(sim, 1, barracks, TechType.ManAtArms);
    for (const id of old) expect(sim.entities.unitType[id]).toBe(UnitType.ManAtArms);
    expect(sim.entities.maxHp[old[0]]).toBe(UNIT_DEFS[UnitType.ManAtArms].hp);
    sim.schedule({ type: 'train', player: 1, building: barracks, unitType: UnitType.Militia });
    run(sim, UNIT_DEFS[UnitType.Militia].trainTime * TICK_RATE + 2);
    expect(unitsOf(sim, 1, UnitType.ManAtArms)).toHaveLength(4);
    expect(unitsOf(sim, 1, UnitType.Militia)).toHaveLength(0);
  });

  it('no se puede investigar dos veces ni la tecnología única de otra facción', () => {
    const sim = world();
    sim.players.era[1] = 2;
    const castle = sim.placeBuilding(BuildingType.Castle, 1, 12, 4);
    expect(researchBlocker(sim, 1, TechType.Stakes)).toBe('De otra facción');
    researchNow(sim, 1, castle, TechType.Mesta);
    expect(researchBlocker(sim, 1, TechType.Mesta)).toBe('Ya investigada');
  });
});

describe('facciones', () => {
  it('Castilla paga menos por la caballería ligera; Inglaterra gana alcance en la era de las Coronas', () => {
    const sim = world();
    expect(sim.stats.unitCost(1, UnitType.Scout)[0]).toBe(68); // 80 − 15 %
    expect(sim.stats.unitCost(2, UnitType.Scout)[0]).toBe(80);
    const before = sim.stats.unit(2, UnitType.Archer).attack!.range;
    sim.players.era[2] = 1;
    sim.stats.invalidate(2);
    expect(sim.stats.unit(2, UnitType.Archer).attack!.range).toBe(before);
    sim.players.era[2] = 2;
    sim.stats.invalidate(2);
    expect(sim.stats.unit(2, UnitType.Archer).attack!.range).toBe(before + FP_ONE);
  });

  it('Castilla: trashumancia (ovejas y caza más rápidas), aldeanos más baratos y caballería con más vida', () => {
    const sim = world();
    expect(sim.stats.gatherRate(1, NodeType.Sheep)).toBeGreaterThan(sim.stats.gatherRate(2, NodeType.Sheep));
    expect(sim.stats.gatherRate(1, NodeType.Carcass)).toBeGreaterThan(sim.stats.gatherRate(2, NodeType.Carcass));
    expect(sim.stats.gatherRate(1, NodeType.Tree)).toBe(sim.stats.gatherRate(2, NodeType.Tree));
    expect(sim.stats.gatherRate(1, NodeType.Gold)).toBe(sim.stats.gatherRate(2, NodeType.Gold));
    expect(sim.stats.unitCost(1, UnitType.Villager)[Resource.Food]).toBeLessThan(sim.stats.unitCost(2, UnitType.Villager)[Resource.Food]);
    expect(sim.stats.unit(1, UnitType.Knight).hp).toBe(sim.stats.unit(2, UnitType.Knight).hp + 10);
    expect(sim.stats.unit(1, UnitType.Militia).hp).toBe(sim.stats.unit(2, UnitType.Militia).hp);
  });

  it('el castillo entrena la unidad única de cada facción', () => {
    const sim = world();
    sim.players.era[1] = 2;
    sim.players.era[2] = 2;
    const c1 = sim.placeBuilding(BuildingType.Castle, 1, 6, 6);
    const c2 = sim.placeBuilding(BuildingType.Castle, 2, 30, 30);
    sim.placeBuilding(BuildingType.House, 1, 14, 14);
    sim.placeBuilding(BuildingType.House, 2, 24, 24);
    sim.schedule({ type: 'train', player: 1, building: c1, unitType: UnitType.Jinete });
    sim.schedule({ type: 'train', player: 2, building: c2, unitType: UnitType.Longbowman });
    sim.schedule({ type: 'train', player: 1, building: c1, unitType: UnitType.Longbowman }); // no es suya
    run(sim, 30 * TICK_RATE);
    expect(unitsOf(sim, 1, UnitType.Jinete)).toHaveLength(1);
    expect(unitsOf(sim, 2, UnitType.Longbowman)).toHaveLength(1);
    expect(unitsOf(sim, 1, UnitType.Longbowman)).toHaveLength(0);
  });
});

describe('monjes', () => {
  it('convierte a una unidad enemiga', () => {
    const sim = world();
    const monk = sim.spawnUnit(UnitType.Monk, 1, tileCenterFixed(10), tileCenterFixed(10));
    const knight = sim.spawnUnit(UnitType.Knight, 2, tileCenterFixed(16), tileCenterFixed(10));
    sim.entities.stance[knight] = 3;
    sim.schedule({ type: 'attack', player: 1, units: [monk], target: knight });
    const ticks = runUntil(sim, 15 * TICK_RATE, () => sim.entities.owner[knight] === 1);
    expect(sim.entities.owner[knight]).toBe(1);
    expect(ticks).toBeGreaterThanOrEqual(4 * TICK_RATE - 2);
  });

  it('cura a las unidades propias heridas que ve', () => {
    const sim = world();
    sim.spawnUnit(UnitType.Monk, 1, tileCenterFixed(10), tileCenterFixed(10));
    const hurt = sim.spawnUnit(UnitType.Militia, 1, tileCenterFixed(14), tileCenterFixed(10));
    sim.entities.hp[hurt] = 10;
    run(sim, 20 * TICK_RATE);
    expect(sim.entities.hp[hurt]).toBe(sim.entities.maxHp[hurt]);
  });
});

describe('asedio', () => {
  it('el trabuquete se monta antes de disparar y derriba un edificio desde lejos', () => {
    const sim = world();
    const house = sim.placeBuilding(BuildingType.House, 2, 30, 10);
    const treb = sim.spawnUnit(UnitType.Trebuchet, 1, tileCenterFixed(17), tileCenterFixed(10));
    sim.schedule({ type: 'attack', player: 1, units: [treb], target: house });
    run(sim, 2 * TICK_RATE);
    expect(sim.entities.deployState[treb]).toBe(1); // montándose
    expect(sim.projectiles).toHaveLength(0);
    runUntil(sim, 3000, () => !sim.entities.isAlive(house));
    expect(sim.entities.isAlive(house)).toBe(false);
    expect(sim.entities.x[treb]).toBe(tileCenterFixed(17)); // no se acercó: tiene alcance de sobra
  });

  it('el ariete ignora a las unidades y derriba edificios; las flechas apenas le hacen daño', () => {
    const sim = world();
    const tower = sim.placeBuilding(BuildingType.WatchTower, 2, 25, 10);
    const ram = sim.spawnUnit(UnitType.Ram, 1, tileCenterFixed(18), tileCenterFixed(10));
    const enemy = sim.spawnUnit(UnitType.Villager, 2, tileCenterFixed(19), tileCenterFixed(11));
    sim.entities.stance[enemy] = 3;
    sim.schedule({ type: 'attack', player: 1, units: [ram], target: enemy });
    run(sim, 2);
    expect(sim.entities.attackTarget[ram]).toBe(0);
    sim.schedule({ type: 'attack', player: 1, units: [ram], target: tower });
    runUntil(sim, 4000, () => !sim.entities.isAlive(tower));
    expect(sim.entities.isAlive(tower)).toBe(false);
    // Cada flecha le hace 1 de daño (el mínimo); un aldeano habría caído en segundos.
    expect(sim.entities.hp[ram]).toBeGreaterThan(100);
  });
});

describe('murallas y puertas', () => {
  it('una puerta deja pasar a su dueño y no al enemigo', () => {
    const sim = world(30);
    // Muro de lado a lado en x = 15 con una puerta en el centro.
    for (let y = 0; y < 30; y++) sim.placeBuilding(y === 15 ? BuildingType.Gate : BuildingType.StoneWall, 1, 15, y);
    const own = sim.spawnUnit(UnitType.Scout, 1, tileCenterFixed(10), tileCenterFixed(15));
    const foe = sim.spawnUnit(UnitType.Scout, 2, tileCenterFixed(10), tileCenterFixed(18));
    sim.entities.stance[own] = sim.entities.stance[foe] = 3;
    sim.schedule({ type: 'move', player: 1, units: [own], x: tileCenterFixed(20), y: tileCenterFixed(15) });
    sim.schedule({ type: 'move', player: 2, units: [foe], x: tileCenterFixed(20), y: tileCenterFixed(18) });
    run(sim, 600);
    expect(sim.entities.x[own] >> 8).toBeGreaterThan(15);
    expect(sim.entities.x[foe] >> 8).toBeLessThan(15);
  });
});

describe('mercado y comercio', () => {
  it('comprar sube el precio y vender lo baja; hace falta un mercado', () => {
    const sim = world();
    sim.schedule({ type: 'market', player: 1, resource: Resource.Wood, buy: true });
    run(sim, 1);
    expect(sim.players.get(1, Resource.Wood)).toBe(20000);
    sim.placeBuilding(BuildingType.Market, 1, 10, 10);
    sim.schedule({ type: 'market', player: 1, resource: Resource.Wood, buy: true });
    run(sim, 1);
    expect(sim.players.get(1, Resource.Wood)).toBe(20100);
    expect(sim.players.get(1, Resource.Gold)).toBe(20000 - 100);
    expect(sim.players.prices[1 * 3 + Resource.Wood]).toBe(105);
    sim.schedule({ type: 'market', player: 1, resource: Resource.Stone, buy: false });
    run(sim, 1);
    expect(sim.players.get(1, Resource.Gold)).toBe(20000 - 100 + 70);
    expect(sim.players.prices[1 * 3 + Resource.Stone]).toBe(95);
  });

  it('un carro de comercio trae oro entre dos mercados lejanos', () => {
    const sim = world(64);
    const a = sim.placeBuilding(BuildingType.Market, 1, 4, 4);
    const b = sim.placeBuilding(BuildingType.Market, 1, 50, 50);
    const cart = sim.spawnUnit(UnitType.TradeCart, 1, tileCenterFixed(9), tileCenterFixed(6));
    sim.entities.homeNode[cart] = a;
    sim.schedule({ type: 'trade', player: 1, units: [cart], target: b });
    const gold = sim.players.get(1, Resource.Gold);
    runUntil(sim, 3000, () => sim.players.get(1, Resource.Gold) > gold);
    expect(sim.players.get(1, Resource.Gold) - gold).toBeGreaterThan(15);
  });
});

describe('victoria', () => {
  it('conquista: gana quien elimina todas las unidades y edificios del rival (los muros no cuentan)', () => {
    const sim = world();
    sim.placeBuilding(BuildingType.TownCenter, 1, 4, 4);
    const house = sim.placeBuilding(BuildingType.House, 2, 30, 30);
    sim.placeBuilding(BuildingType.Palisade, 2, 20, 20);
    const v = sim.spawnUnit(UnitType.Villager, 2, tileCenterFixed(34), tileCenterFixed(34));
    run(sim, 40);
    expect(sim.winner).toBe(0);
    sim.entities.hp[house] = 1;
    sim.schedule({ type: 'debugSpawn', player: 1, unitType: UnitType.Militia, tileX: 32, tileY: 32, count: 4 });
    runUntil(sim, 3000, () => sim.winner !== 0);
    expect(sim.entities.isAlive(v)).toBe(false);
    expect(sim.winner).toBe(1);
    expect(sim.winReason).toBe('conquest');
  });

  it('Catedral: aguantar 10 minutos en pie da la victoria', () => {
    const sim = world(40);
    sim.placeBuilding(BuildingType.TownCenter, 2, 30, 30);
    sim.placeBuilding(BuildingType.Cathedral, 1, 4, 4);
    run(sim, 10 * 60 * TICK_RATE - 100);
    expect(sim.winner).toBe(0);
    run(sim, 200);
    expect(sim.winner).toBe(1);
    expect(sim.winReason).toBe('wonder');
  });
});

describe('mapa de partida', () => {
  it('cada jugador tiene los mismos recursos cerca de su posición', () => {
    const map = generateMatchMap({ width: 96, height: 96, seed: 'justo', players: 2 });
    expect(map.starts).toHaveLength(2);
    const near = (sx: number, sy: number, kind: number) => {
      let n = 0;
      for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (map.depositAt(x, y) === kind && (x - sx) ** 2 + (y - sy) ** 2 <= 24 * 24) n++;
      return n;
    };
    const [a, b] = map.starts;
    for (const kind of [Deposit.Gold, Deposit.Stone, Deposit.Berries]) {
      expect(near(a.x, a.y, kind)).toBeGreaterThan(0);
      expect(Math.abs(near(a.x, a.y, kind) - near(b.x, b.y, kind))).toBeLessThanOrEqual(1);
    }
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(40);
  });
});
