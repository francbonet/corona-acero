import { describe, expect, it } from 'vitest';
import { BUILDING_DEFS, BuildingType } from '../src/data/buildings';
import { NodeType } from '../src/data/nodes';
import { Resource } from '../src/data/resources';
import { UNIT_DEFS, UnitType } from '../src/data/units';
import { tileCenterFixed } from '../src/engine/fixed';
import { Comp, Task } from '../src/sim/entities';
import { TICK_RATE, at, economyWorld, run, runUntil, villagerAt } from './helpers/world';

const P = 1;

describe('recolección', () => {
  it('tala, carga 12 de madera, la entrega en el centro de la villa y vuelve al árbol', () => {
    const { sim } = economyWorld({ trees: [[10, 3]] });
    const tree = at(sim, 10, 3);
    const v = villagerAt(sim, 8, 3);
    sim.schedule({ type: 'gather', player: P, units: [v], target: tree });
    const e = sim.entities;
    const ticks = runUntil(sim, 2000, () => sim.players.get(P, Resource.Wood) > 250);
    expect(ticks).toBeGreaterThan(0);
    expect(sim.players.get(P, Resource.Wood)).toBe(250 + UNIT_DEFS[UnitType.Villager].carry!);
    expect(e.task[v]).toBe(Task.Gather);
    expect(e.taskTarget[v]).toBe(tree);
    expect(e.resAmount[tree]).toBe(110 - 12);
  });

  it('un árbol agotado desaparece, libera su casilla y el aldeano pasa al de al lado', () => {
    const { sim } = economyWorld({ trees: [[10, 3], [11, 3]] });
    const first = at(sim, 10, 3);
    const second = at(sim, 11, 3);
    sim.entities.resAmount[first] = 5;
    const v = villagerAt(sim, 9, 3);
    sim.schedule({ type: 'gather', player: P, units: [v], target: first });
    runUntil(sim, 2000, () => !sim.entities.isAlive(first));
    expect(sim.entities.isAlive(first)).toBe(false);
    expect(sim.grid.passable(10, 3)).toBe(true);
    run(sim, 5);
    expect(sim.entities.taskTarget[v]).toBe(second);
  });

  it('las ovejas se sacrifican al llegar y su carne se recolecta', () => {
    const { sim } = economyWorld();
    const sheep = sim.spawnUnit(UnitType.Sheep, P, tileCenterFixed(12), tileCenterFixed(12));
    const v = villagerAt(sim, 9, 9);
    sim.schedule({ type: 'gather', player: P, units: [v], target: sheep });
    runUntil(sim, 2000, () => sim.players.get(P, Resource.Food) > 250);
    const e = sim.entities;
    expect(e.nodeType[sheep]).toBe(NodeType.Carcass);
    expect(e.has(sheep, Comp.Unit)).toBe(false);
    expect(sim.players.get(P, Resource.Food)).toBe(250 + 12);
  });

  it('una mina encerrada (entre árboles) se veta entera en vez de intentarla sin fin', () => {
    // Piedra de 2×2 en el centro de un anillo cerrado de árboles: las casillas de alrededor están libres pero no se llega.
    const trees: [number, number][] = [];
    for (let i = 14; i <= 19; i++) trees.push([i, 14], [i, 19], [14, i], [19, i]);
    const stone: [number, number][] = [[16, 16], [17, 16], [16, 17], [17, 17]];
    const { sim } = economyWorld({ trees, stone });
    let requests = 0;
    const request = sim.pathing.request.bind(sim.pathing);
    sim.pathing.request = (id: number) => {
      requests++;
      request(id);
    };
    const v = villagerAt(sim, 8, 8);
    sim.schedule({ type: 'gather', player: P, units: [v], target: at(sim, 16, 16) });
    run(sim, 60 * TICK_RATE);
    const e = sim.entities;
    for (const [x, y] of stone) expect(e.blockedUntil[at(sim, x, y)]).toBeGreaterThan(sim.tick);
    expect(e.task[v]).toBe(Task.None);
    expect(requests).toBeLessThan(15);
  });

  it('no deja recolectar fuentes ni mover unidades de otro jugador', () => {
    const { sim } = economyWorld({ trees: [[10, 3]] });
    const v = villagerAt(sim, 8, 3, 2);
    sim.schedule({ type: 'gather', player: P, units: [v], target: at(sim, 10, 3) });
    run(sim, 10);
    expect(sim.entities.task[v]).toBe(Task.None);
  });
});

describe('construcción', () => {
  it('construye una casa: cobra, tarda lo previsto y sube la población', () => {
    const { sim } = economyWorld();
    const v = villagerAt(sim, 9, 9);
    sim.schedule({ type: 'build', player: P, units: [v], buildingType: BuildingType.House, tileX: 10, tileY: 10, queue: false });
    run(sim, 1);
    expect(sim.players.get(P, Resource.Wood)).toBe(250 - 30);
    const house = at(sim, 10, 10);
    expect(sim.entities.built[house]).toBe(0);
    // +1: la obra empieza en el mismo tick en que se colocan los cimientos (el aldeano ya está al lado).
    const ticks = runUntil(sim, 2000, () => sim.entities.built[house] === 1) + 1;
    const expected = BUILDING_DEFS[BuildingType.House].buildTime * TICK_RATE;
    expect(ticks).toBeGreaterThanOrEqual(expected);
    expect(ticks).toBeLessThan(expected + 40);
    run(sim, 1);
    expect(sim.players.popCap[P]).toBe(10);
    expect(sim.entities.task[v]).toBe(Task.None);
  });

  it('dos constructores tardan 1/1,5 de lo que tarda uno', () => {
    const timeWith = (n: number) => {
      const { sim } = economyWorld();
      const vs = Array.from({ length: n }, (_, i) => villagerAt(sim, 9 + i, 9));
      sim.schedule({ type: 'build', player: P, units: vs, buildingType: BuildingType.House, tileX: 9, tileY: 10, queue: false });
      run(sim, 1);
      const house = at(sim, 9, 10);
      return runUntil(sim, 3000, () => sim.entities.built[house] === 1);
    };
    const one = timeWith(1);
    const two = timeWith(2);
    expect(two / one).toBeGreaterThan(0.6);
    expect(two / one).toBeLessThan(0.72);
  });

  it('rechaza cimientos sobre árboles, sin recursos o sin el edificio requerido', () => {
    const { sim } = economyWorld({ trees: [[12, 12]] });
    const v = villagerAt(sim, 9, 9);
    sim.schedule({ type: 'build', player: P, units: [v], buildingType: BuildingType.House, tileX: 11, tileY: 11, queue: false });
    sim.schedule({ type: 'build', player: P, units: [v], buildingType: BuildingType.Farm, tileX: 14, tileY: 14, queue: false });
    sim.players.set(P, [0, 10, 0, 0]);
    sim.schedule({ type: 'build', player: P, units: [v], buildingType: BuildingType.House, tileX: 16, tileY: 4, queue: false });
    run(sim, 2);
    expect(at(sim, 11, 11)).toBe(0);
    expect(at(sim, 14, 14)).toBe(0);
    expect(at(sim, 16, 4)).toBe(0);
  });

  it('con Shift encadena varios edificios', () => {
    const { sim } = economyWorld();
    const v = villagerAt(sim, 9, 9);
    sim.schedule({ type: 'build', player: P, units: [v], buildingType: BuildingType.House, tileX: 10, tileY: 10, queue: false });
    sim.schedule({ type: 'build', player: P, units: [v], buildingType: BuildingType.House, tileX: 13, tileY: 10, queue: true });
    run(sim, 1);
    const a = at(sim, 10, 10);
    const b = at(sim, 13, 10);
    runUntil(sim, 4000, () => sim.entities.built[b] === 1);
    expect(sim.entities.built[a]).toBe(1);
    expect(sim.entities.built[b]).toBe(1);
  });

  it('al terminar un aserradero, los constructores se ponen a talar cerca', () => {
    const { sim } = economyWorld({ trees: [[15, 10], [15, 11]] });
    const v = villagerAt(sim, 11, 10);
    sim.schedule({ type: 'build', player: P, units: [v], buildingType: BuildingType.LumberCamp, tileX: 12, tileY: 10, queue: false });
    run(sim, 1);
    const camp = at(sim, 12, 10);
    runUntil(sim, 2000, () => sim.entities.built[camp] === 1);
    run(sim, 2);
    expect(sim.entities.task[v]).toBe(Task.Gather);
    expect(sim.entities.nodeType[sim.entities.taskTarget[v]]).toBe(NodeType.Tree);
  });
});

describe('granjas', () => {
  it('el granjero cultiva y, al agotarse, la granja se replanta pagando madera', () => {
    const { sim } = economyWorld();
    sim.placeBuilding(BuildingType.Mill, P, 12, 4);
    const v = villagerAt(sim, 8, 9);
    sim.schedule({ type: 'build', player: P, units: [v], buildingType: BuildingType.Farm, tileX: 7, tileY: 7, queue: false });
    run(sim, 1);
    const farm = at(sim, 7, 7);
    expect(sim.grid.passable(8, 8)).toBe(true); // las granjas no bloquean
    runUntil(sim, 2000, () => sim.entities.built[farm] === 1);
    run(sim, 2);
    expect(sim.entities.taskTarget[v]).toBe(farm);
    sim.entities.resAmount[farm] = 3;
    const wood = sim.players.get(P, Resource.Wood);
    runUntil(sim, 1000, () => sim.entities.resAmount[farm] > 3);
    expect(sim.entities.isAlive(farm)).toBe(true);
    expect(sim.players.get(P, Resource.Wood)).toBe(wood - BUILDING_DEFS[BuildingType.Farm].cost[1]);
    expect(sim.entities.resAmount[farm]).toBeGreaterThan(200);
  });

  it('solo trabaja un granjero por granja', () => {
    const { sim } = economyWorld();
    sim.placeBuilding(BuildingType.Mill, P, 12, 4);
    const farm = sim.placeBuilding(BuildingType.Farm, P, 7, 7);
    const a = villagerAt(sim, 8, 11);
    const b = villagerAt(sim, 9, 11);
    sim.schedule({ type: 'gather', player: P, units: [a, b], target: farm });
    run(sim, 200);
    const farming = [a, b].filter((v) => sim.entities.task[v] === Task.Gather && sim.entities.taskTarget[v] === farm);
    expect(farming).toHaveLength(1);
  });
});

describe('producción', () => {
  it('el centro de la villa entrena aldeanos, cobra y respeta el tope de población', () => {
    const { sim, tc } = economyWorld();
    for (let i = 0; i < 4; i++) villagerAt(sim, 8 + i, 8);
    for (let i = 0; i < 3; i++) sim.schedule({ type: 'train', player: P, building: tc, unitType: UnitType.Villager });
    run(sim, 1);
    expect(sim.players.get(P, Resource.Food)).toBe(250 - 3 * 55);
    run(sim, UNIT_DEFS[UnitType.Villager].trainTime * TICK_RATE * 3);
    // Con tope 5 y 4 aldeanos solo cabe uno más: los otros dos esperan.
    expect(sim.players.popUsed[P]).toBe(5);
    expect(sim.entities.queue[tc]).toHaveLength(2);
    // Cancelar devuelve la comida.
    sim.schedule({ type: 'cancelTrain', player: P, building: tc, index: 1 });
    run(sim, 1);
    expect(sim.players.get(P, Resource.Food)).toBe(250 - 2 * 55);
  });

  it('con punto de reunión sobre un árbol, el aldeano nuevo se pone a talar', () => {
    const { sim, tc } = economyWorld({ trees: [[12, 4]] });
    const tree = at(sim, 12, 4);
    sim.schedule({ type: 'rally', player: P, buildings: [tc], x: tileCenterFixed(12), y: tileCenterFixed(4), target: tree });
    sim.schedule({ type: 'train', player: P, building: tc, unitType: UnitType.Villager });
    run(sim, UNIT_DEFS[UnitType.Villager].trainTime * TICK_RATE + 5);
    const e = sim.entities;
    const villager = [...Array(e.highWater).keys()].find((id) => e.has(id, Comp.Worker));
    expect(villager).toBeDefined();
    expect(e.task[villager!]).toBe(Task.Gather);
    expect(e.taskTarget[villager!]).toBe(tree);
  });
});

describe('determinismo con economía', () => {
  it('misma semilla y mismas órdenes → mismo estado', () => {
    const play = () => {
      const { sim, tc } = economyWorld({ trees: [[14, 3], [15, 3], [14, 4]], berries: [[3, 12], [4, 12]], gold: [[18, 18]] });
      const vs = [villagerAt(sim, 8, 8), villagerAt(sim, 9, 8), villagerAt(sim, 10, 8)];
      sim.schedule({ type: 'gather', player: P, units: [vs[0]], target: at(sim, 14, 3) });
      sim.schedule({ type: 'gather', player: P, units: [vs[1]], target: at(sim, 3, 12) });
      sim.schedule({ type: 'build', player: P, units: [vs[2]], buildingType: BuildingType.House, tileX: 10, tileY: 12, queue: false });
      sim.schedule({ type: 'train', player: P, building: tc, unitType: UnitType.Villager }, 50);
      sim.schedule({ type: 'gather', player: P, units: [vs[2]], target: at(sim, 18, 18) }, 900);
      const hashes: number[] = [];
      for (let i = 0; i < 2000; i++) {
        sim.step();
        if (i % 100 === 0) hashes.push(sim.stateHash());
      }
      return hashes;
    };
    expect(play()).toEqual(play());
  });
});
