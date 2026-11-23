import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/data/buildings';
import { Stance } from '../src/data/combat';
import { NodeType } from '../src/data/nodes';
import { Resource } from '../src/data/resources';
import { UNIT_DEFS, UnitType } from '../src/data/units';
import { FP_ONE, fixedLength, tileCenterFixed } from '../src/engine/fixed';
import { GameMap } from '../src/map/game-map';
import { computeDamage } from '../src/sim/combat';
import { Comp } from '../src/sim/entities';
import { Simulation } from '../src/sim/simulation';
import { TICK_RATE, run, runUntil } from './helpers/world';

function arena(width = 40, height = 24): Simulation {
  return new Simulation({ map: new GameMap(width, height), seed: 5, tickRate: TICK_RATE });
}

const alive = (sim: Simulation, ids: number[]) => ids.filter((id) => sim.entities.has(id, Comp.Unit));

/** Dos grupos que avanzan atacando el uno hacia el otro hasta que solo queda uno. */
function battle(a: [UnitType, number], b: [UnitType, number]): { winner: 1 | 2 | 0; left: number; seconds: number } {
  const sim = arena();
  const ga = sim.spawnGroup(a[0], 1, 8, 12, a[1]);
  const gb = sim.spawnGroup(b[0], 2, 31, 12, b[1]);
  sim.schedule({ type: 'attackMove', player: 1, units: ga, x: tileCenterFixed(31), y: tileCenterFixed(12) });
  sim.schedule({ type: 'attackMove', player: 2, units: gb, x: tileCenterFixed(8), y: tileCenterFixed(12) });
  const ticks = runUntil(sim, 6000, () => alive(sim, ga).length === 0 || alive(sim, gb).length === 0);
  const la = alive(sim, ga).length;
  const lb = alive(sim, gb).length;
  return { winner: la > 0 && lb === 0 ? 1 : lb > 0 && la === 0 ? 2 : 0, left: Math.max(la, lb), seconds: ticks / TICK_RATE };
}

const costOf = (t: UnitType) => UNIT_DEFS[t].cost.reduce((s, c) => s + c, 0);
/** Cuántas unidades de cada tipo caben en un presupuesto (para combates a igual coste). */
const forBudget = (t: UnitType, budget = 480) => Math.round(budget / costOf(t));

describe('daño', () => {
  it('suma ataque − armadura por tipo, más los bonus, y nunca baja de 1', () => {
    const sim = arena();
    const militia = sim.spawnUnit(UnitType.Militia, 2, tileCenterFixed(5), tileCenterFixed(5));
    const scout = sim.spawnUnit(UnitType.Scout, 2, tileCenterFixed(6), tileCenterFixed(5));
    const tc = sim.placeBuilding(BuildingType.TownCenter, 2, 10, 10);
    const spear = sim.stats.unit(1, UnitType.Spearman).attack!;
    const archer = sim.stats.unit(1, UnitType.Archer).attack!;
    const militiaAtk = sim.stats.unit(1, UnitType.Militia).attack!;
    expect(computeDamage(sim, spear, scout)).toBe(3 + 14); // bonus contra caballería
    expect(computeDamage(sim, archer, militia)).toBe(4 - 1 + 3); // armadura perforante 1, bonus contra infantería
    expect(computeDamage(sim, archer, scout)).toBe(4 - 2);
    expect(computeDamage(sim, militiaAtk, tc)).toBe(5 - 2 + 3); // bonus contra edificios
    expect(computeDamage(sim, archer, tc)).toBe(1); // las flechas apenas hacen nada a la piedra
  });
});

describe('triángulo de contraataques (a igual coste)', () => {
  it('los lanceros vencen a la caballería', () => {
    const r = battle([UnitType.Spearman, forBudget(UnitType.Spearman)], [UnitType.Scout, forBudget(UnitType.Scout)]);
    expect(r.winner).toBe(1);
  });

  it('la caballería vence a los arqueros', () => {
    const r = battle([UnitType.Scout, forBudget(UnitType.Scout)], [UnitType.Archer, forBudget(UnitType.Archer)]);
    expect(r.winner).toBe(1);
  });

  it('los arqueros vencen a la infantería de choque', () => {
    const r = battle([UnitType.Archer, forBudget(UnitType.Archer)], [UnitType.Militia, forBudget(UnitType.Militia)]);
    expect(r.winner).toBe(1);
  });

  it('los arqueros vencen a los lanceros', () => {
    const r = battle([UnitType.Archer, forBudget(UnitType.Archer)], [UnitType.Spearman, forBudget(UnitType.Spearman)]);
    expect(r.winner).toBe(1);
  });

  it('la infantería de choque vence a los lanceros', () => {
    const r = battle([UnitType.Militia, forBudget(UnitType.Militia)], [UnitType.Spearman, forBudget(UnitType.Spearman)]);
    expect(r.winner).toBe(1);
  });
});

describe('proyectiles, torres y guarnición', () => {
  it('las flechas tardan en llegar y entonces hacen daño', () => {
    const sim = arena();
    const archer = sim.spawnUnit(UnitType.Archer, 1, tileCenterFixed(5), tileCenterFixed(5));
    const target = sim.spawnUnit(UnitType.Militia, 2, tileCenterFixed(9), tileCenterFixed(5));
    sim.entities.stance[target] = Stance.NoAttack;
    sim.schedule({ type: 'attack', player: 1, units: [archer], target });
    runUntil(sim, 100, () => sim.projectiles.length > 0);
    expect(sim.projectiles.length).toBe(1);
    expect(sim.entities.hp[target]).toBe(40);
    runUntil(sim, 100, () => sim.projectiles.length === 0);
    expect(sim.entities.hp[target]).toBe(40 - 6);
  });

  it('una torre mata a una milicia que se acerca; con guarnición dispara más flechas', () => {
    const sim = arena();
    const tower = sim.placeBuilding(BuildingType.WatchTower, 1, 20, 12);
    const militia = sim.spawnUnit(UnitType.Militia, 2, tileCenterFixed(30), tileCenterFixed(12));
    sim.entities.stance[militia] = Stance.NoAttack;
    sim.schedule({ type: 'move', player: 2, units: [militia], x: tileCenterFixed(22), y: tileCenterFixed(12) });
    runUntil(sim, 1200, () => !sim.entities.isAlive(militia));
    expect(sim.entities.isAlive(militia)).toBe(false);

    const vs = sim.spawnGroup(UnitType.Villager, 1, 18, 12, 3);
    sim.schedule({ type: 'garrison', player: 1, units: vs, target: tower });
    runUntil(sim, 400, () => vs.every((v) => sim.entities.garrisonedIn[v] === tower));
    expect(vs.every((v) => !sim.entities.has(v, Comp.Position))).toBe(true);
    const enemy = sim.spawnUnit(UnitType.Militia, 2, tileCenterFixed(25), tileCenterFixed(12));
    sim.entities.stance[enemy] = Stance.NoAttack;
    const volley = runUntil(sim, 100, () => sim.projectiles.length > 0);
    expect(volley).toBeGreaterThanOrEqual(0);
    expect(sim.projectiles.length).toBe(4); // 1 + 3 guarecidos

    sim.schedule({ type: 'ungarrison', player: 1, buildings: [tower] });
    run(sim, 2);
    expect(vs.every((v) => sim.entities.has(v, Comp.Position) && sim.entities.garrisonedIn[v] === 0)).toBe(true);
  });

  it('al destruir un edificio salen sus guarecidos y se libera su huella', () => {
    const sim = arena();
    const tower = sim.placeBuilding(BuildingType.WatchTower, 1, 20, 12);
    const v = sim.spawnUnit(UnitType.Villager, 1, tileCenterFixed(19), tileCenterFixed(12));
    sim.schedule({ type: 'garrison', player: 1, units: [v], target: tower });
    runUntil(sim, 200, () => sim.entities.garrisonedIn[v] === tower);
    sim.entities.hp[tower] = 5;
    const militia = sim.spawnGroup(UnitType.Militia, 2, 24, 12, 3);
    sim.schedule({ type: 'attack', player: 2, units: militia, target: tower });
    runUntil(sim, 800, () => !sim.entities.isAlive(tower));
    expect(sim.entities.isAlive(tower)).toBe(false);
    expect(sim.grid.passable(20, 12)).toBe(true);
    expect(sim.entities.has(v, Comp.Position)).toBe(true);
  });
});

describe('caza y animales', () => {
  it('el aldeano caza un ciervo (que huye), y recolecta su carne', () => {
    const sim = arena();
    sim.placeBuilding(BuildingType.TownCenter, 1, 2, 2);
    const deer = sim.spawnUnit(UnitType.Deer, 0, tileCenterFixed(14), tileCenterFixed(10));
    const v = sim.spawnUnit(UnitType.Villager, 1, tileCenterFixed(10), tileCenterFixed(10));
    sim.schedule({ type: 'gather', player: 1, units: [v], target: deer });
    runUntil(sim, 2000, () => sim.entities.nodeType[deer] === NodeType.Carcass);
    expect(sim.entities.nodeType[deer]).toBe(NodeType.Carcass);
    expect(sim.entities.has(deer, Comp.Unit)).toBe(false);
    runUntil(sim, 3000, () => sim.players.get(1, Resource.Food) > 250);
    expect(sim.players.get(1, Resource.Food)).toBe(262);
  });

  it('el jabalí se defiende, y entre tres aldeanos cae sin bajas', () => {
    const sim = arena();
    const boar = sim.spawnUnit(UnitType.Boar, 0, tileCenterFixed(14), tileCenterFixed(10));
    const vs = sim.spawnGroup(UnitType.Villager, 1, 11, 10, 3);
    sim.schedule({ type: 'gather', player: 1, units: vs, target: boar });
    runUntil(sim, 2000, () => !sim.entities.has(boar, Comp.Unit));
    expect(sim.entities.nodeType[boar]).toBe(NodeType.Carcass);
    expect(alive(sim, vs)).toHaveLength(3);
    expect(vs.some((v) => sim.entities.hp[v] < 25)).toBe(true); // devolvió golpes
  });

  it('los lobos atacan al aldeano que se acerca', () => {
    const sim = arena();
    const wolf = sim.spawnUnit(UnitType.Wolf, 0, tileCenterFixed(20), tileCenterFixed(12));
    const v = sim.spawnUnit(UnitType.Villager, 1, tileCenterFixed(17), tileCenterFixed(12));
    run(sim, 60);
    expect(sim.entities.attackTarget[wolf]).toBe(v);
    run(sim, 600);
    expect(sim.entities.isAlive(v)).toBe(false);
  });
});

describe('posturas y órdenes', () => {
  it('"mantener posición" no persigue y "no atacar" no ataca', () => {
    const sim = arena();
    const guard = sim.spawnUnit(UnitType.Militia, 1, tileCenterFixed(10), tileCenterFixed(10));
    const pacifist = sim.spawnUnit(UnitType.Militia, 1, tileCenterFixed(10), tileCenterFixed(14));
    sim.schedule({ type: 'stance', player: 1, units: [guard], stance: Stance.StandGround });
    sim.schedule({ type: 'stance', player: 1, units: [pacifist], stance: Stance.NoAttack });
    const enemy = sim.spawnUnit(UnitType.Villager, 2, tileCenterFixed(13), tileCenterFixed(12));
    run(sim, 200);
    const e = sim.entities;
    expect(fixedLength(e.x[guard] - tileCenterFixed(10), e.y[guard] - tileCenterFixed(10))).toBeLessThan(FP_ONE / 2);
    expect(e.attackTarget[pacifist]).toBe(0);
    expect(e.hp[enemy]).toBe(25);
  });

  it('ataque-mover: se detiene a luchar y luego sigue hasta el destino', () => {
    const sim = arena();
    const group = sim.spawnGroup(UnitType.Militia, 1, 5, 12, 4);
    const enemy = sim.spawnUnit(UnitType.Villager, 2, tileCenterFixed(18), tileCenterFixed(12));
    sim.schedule({ type: 'attackMove', player: 1, units: group, x: tileCenterFixed(34), y: tileCenterFixed(12) });
    runUntil(sim, 3000, () => !sim.entities.isAlive(enemy));
    expect(sim.entities.isAlive(enemy)).toBe(false);
    run(sim, 1200);
    for (const id of group) expect(Math.abs(sim.entities.x[id] - tileCenterFixed(34))).toBeLessThan(4 * FP_ONE);
  });

  it('una orden de movimiento ignora a los enemigos hasta llegar', () => {
    const sim = arena();
    const m = sim.spawnUnit(UnitType.Militia, 1, tileCenterFixed(5), tileCenterFixed(12));
    const enemy = sim.spawnUnit(UnitType.Villager, 2, tileCenterFixed(18), tileCenterFixed(13));
    sim.entities.stance[enemy] = Stance.NoAttack;
    sim.schedule({ type: 'move', player: 1, units: [m], x: tileCenterFixed(30), y: tileCenterFixed(12) });
    run(sim, 400);
    expect(sim.entities.hp[enemy]).toBe(25);
  });
});

describe('niebla de guerra', () => {
  it('ve alrededor de sus unidades, recuerda lo explorado y no ve lo lejano', () => {
    const sim = arena(60, 60);
    const scout = sim.spawnUnit(UnitType.Scout, 1, tileCenterFixed(10), tileCenterFixed(10));
    run(sim, 4);
    const vis = sim.visibility;
    expect(vis.isVisible(1, 12, 10)).toBe(true);
    expect(vis.isVisible(1, 40, 40)).toBe(false);
    expect(vis.isExplored(1, 40, 40)).toBe(false);
    sim.schedule({ type: 'move', player: 1, units: [scout], x: tileCenterFixed(40), y: tileCenterFixed(10) });
    run(sim, 600);
    expect(vis.isVisible(1, 40, 10)).toBe(true);
    expect(vis.isVisible(1, 10, 10)).toBe(false);
    expect(vis.isExplored(1, 10, 10)).toBe(true);
    expect(vis.isVisible(2, 40, 10)).toBe(false);
  });
});

describe('determinismo con combate', () => {
  it('misma semilla y mismas órdenes → mismo estado', () => {
    const play = () => {
      const sim = arena();
      const a = [...sim.spawnGroup(UnitType.Archer, 1, 6, 10, 5), ...sim.spawnGroup(UnitType.Spearman, 1, 6, 14, 5)];
      const b = [...sim.spawnGroup(UnitType.Scout, 2, 32, 10, 4), ...sim.spawnGroup(UnitType.Militia, 2, 32, 14, 5)];
      sim.placeBuilding(BuildingType.WatchTower, 1, 12, 12);
      sim.spawnUnit(UnitType.Wolf, 0, tileCenterFixed(20), tileCenterFixed(4));
      sim.schedule({ type: 'attackMove', player: 1, units: a, x: tileCenterFixed(30), y: tileCenterFixed(12) }, 100);
      sim.schedule({ type: 'attackMove', player: 2, units: b, x: tileCenterFixed(8), y: tileCenterFixed(12) });
      const hashes: number[] = [];
      for (let i = 0; i < 2000; i++) {
        sim.step();
        if (i % 50 === 0) hashes.push(sim.stateHash());
      }
      return hashes;
    };
    expect(play()).toEqual(play());
  });
});
