import { describe, expect, it } from 'vitest';
import { AiPlayer } from '../src/ai/ai-player';
import { BUILDING_DEFS, BuildingType } from '../src/data/buildings';
import { Faction } from '../src/data/factions';
import { Resource } from '../src/data/resources';
import { TechType } from '../src/data/techs';
import { UnitType } from '../src/data/units';
import { GameClient } from '../src/game/client';
import type { PickTarget } from '../src/game/picking';
import { cloneSim, restoreSim, snapshotSim } from '../src/game/save';
import { setupMatch } from '../src/game/scenario';
import { Selection } from '../src/game/selection';
import { generateMatchMap } from '../src/map/generator';
import type { Command } from '../src/sim/commands';
import { kill } from '../src/sim/combat';
import { MoveState, Task } from '../src/sim/entities';
import { Simulation } from '../src/sim/simulation';
import { REPAIR_HP_PER_SECOND } from '../src/sim/systems/construction';
import { researchBlocker } from '../src/sim/tech';
import { buildTotal } from '../src/sim/world';
import { at, economyWorld, run, runUntil, villagerAt } from './helpers/world';

const P = 1;
const wood = (sim: Simulation) => sim.players.get(P, Resource.Wood);
const stone = (sim: Simulation) => sim.players.get(P, Resource.Stone);

/** Lo que hay bajo el ratón al hacer clic sobre un edificio (para el cliente basta con el id). */
const pick = (id: number): PickTarget => ({ id, kind: 'building', x: 0, y: 0, halfW: 32, height: 0 });

describe('reparar', () => {
  it('repone la vida a 15 por segundo y cobra la mitad del coste en proporción a lo reparado', () => {
    const { sim, tc } = economyWorld();
    const e = sim.entities;
    e.hp[tc] = e.maxHp[tc] / 2;
    const v = villagerAt(sim, 7, 3);
    sim.schedule({ type: 'construct', player: P, units: [v], target: tc, queue: false });
    // Al llegar, unos 20 segundos de obra: unos 300 puntos de vida.
    runUntil(sim, 400, () => e.working[v] === 1);
    const start = e.hp[tc];
    run(sim, 20 * sim.tickRate);
    expect(e.hp[tc] - start).toBeGreaterThanOrEqual(REPAIR_HP_PER_SECOND * 20 - 2);
    expect(e.hp[tc] - start).toBeLessThanOrEqual(REPAIR_HP_PER_SECOND * 20 + 1);
    // Hasta el final: 1200 de vida de un centro de 2400 (300 de madera y 120 de piedra) son 75 y 30.
    runUntil(sim, 3000, () => e.hp[tc] === e.maxHp[tc]);
    expect(e.hp[tc]).toBe(e.maxHp[tc]);
    expect(250 - wood(sim)).toBe(75);
    expect(150 - stone(sim)).toBe(30);
    run(sim, 2);
    expect(e.task[v]).toBe(Task.None); // no estaba haciendo nada antes: se queda quieto
    expect(e.repairDone[tc]).toBe(0);
  });

  it('se para si no hay con qué pagar, avisa y sigue cuando vuelve a haber', () => {
    const { sim, tc } = economyWorld();
    const e = sim.entities;
    sim.players.add(P, Resource.Wood, -wood(sim));
    e.hp[tc] = 1000;
    const v = villagerAt(sim, 7, 3);
    sim.schedule({ type: 'construct', player: P, units: [v], target: tc, queue: false });
    runUntil(sim, 400, () => e.working[v] === 1);
    // Cada punto de madera cubre 16 de vida: los primeros 15 salen gratis por el redondeo, y ahí se para.
    run(sim, 100);
    const stuck = e.hp[tc];
    expect(stuck).toBeLessThan(1000 + 16);
    sim.drainEvents();
    run(sim, 100);
    expect(e.hp[tc]).toBe(stuck);
    expect(sim.drainEvents().some((ev) => ev.kind === 'repairBlocked' && ev.player === P)).toBe(true);
    sim.players.add(P, Resource.Wood, 100);
    run(sim, 100);
    expect(e.hp[tc]).toBeGreaterThan(stuck);
  });

  it('al terminar, el aldeano entrega lo que llevaba y vuelve a su árbol', () => {
    const { sim, tc } = economyWorld({ trees: [[10, 3]] });
    const e = sim.entities;
    const tree = at(sim, 10, 3);
    const v = villagerAt(sim, 8, 3);
    sim.schedule({ type: 'gather', player: P, units: [v], target: tree });
    runUntil(sim, 600, () => e.carryAmount[v] >= 5);
    e.hp[tc] = e.maxHp[tc] - 40;
    sim.schedule({ type: 'construct', player: P, units: [v], target: tc, queue: false });
    run(sim, 2);
    expect(e.task[v]).toBe(Task.Build);
    runUntil(sim, 1000, () => e.hp[tc] === e.maxHp[tc]);
    const carried = e.carryAmount[v];
    const before = wood(sim);
    expect(carried).toBeGreaterThan(0);
    // Está junto al centro: entrega al momento (sin pagar con la carga) y vuelve al árbol.
    runUntil(sim, 600, () => e.task[v] === Task.Gather);
    expect(wood(sim)).toBeGreaterThanOrEqual(before + carried - 1);
    expect(e.carryAmount[v]).toBe(0);
    expect(e.taskTarget[v]).toBe(tree);
  });

  it('las granjas y los edificios sanos no se reparan', () => {
    const { sim, tc } = economyWorld();
    const e = sim.entities;
    const farm = sim.placeBuilding(BuildingType.Farm, P, 12, 12);
    e.hp[farm] = 10;
    const v = villagerAt(sim, 7, 3);
    sim.schedule({ type: 'construct', player: P, units: [v], target: farm, queue: false });
    sim.schedule({ type: 'construct', player: P, units: [v], target: tc, queue: false });
    run(sim, 2);
    expect(e.task[v]).toBe(Task.None);
  });

  it('con clic derecho sobre el centro dañado, los que cargan entregan y el resto repara', () => {
    const { sim, tc } = economyWorld();
    const e = sim.entities;
    const loaded = villagerAt(sim, 8, 3);
    const empty = villagerAt(sim, 8, 5);
    e.carryKind[loaded] = Resource.Wood;
    e.carryAmount[loaded] = 8;
    const selection = new Selection();
    const client = new GameClient(sim, selection, P, (c) => sim.schedule(c), () => 0);
    selection.replace([loaded, empty]);
    expect(client.cursorFor(pick(tc))).toBe('hand'); // sano
    e.hp[tc] = 2000;
    expect(client.cursorFor(pick(tc))).toBe('hammer');
    expect(client.rightClick(pick(tc), 0, 0)).toBe('work');
    run(sim, 2);
    expect(e.task[loaded]).toBe(Task.Deliver);
    expect(e.task[empty]).toBe(Task.Build);
    expect(client.describeTask(empty)).toBe('Reparando');
  });

  it('el botón Reparar del aldeano pasa al modo reparar, y el clic elige el edificio', () => {
    const { sim, tc } = economyWorld();
    const e = sim.entities;
    const v = villagerAt(sim, 8, 5);
    const selection = new Selection();
    const client = new GameClient(sim, selection, P, (c) => sim.schedule(c), () => 0);
    selection.replace([v]);
    const slot = client.commandButtons().findIndex((b) => b?.label === 'Reparar');
    expect(slot).toBe(2);
    client.press(slot);
    expect(client.mode.kind).toBe('repair');
    expect(client.repairAt(pick(tc), false)).toBe('none'); // sano: no hace nada
    expect(client.activeNotices()).toContain('No está dañado');
    client.press(slot);
    e.hp[tc] = 1500;
    expect(client.repairAt(pick(tc), false)).toBe('work');
    expect(client.mode.kind).toBe('normal');
    run(sim, 2);
    expect(e.task[v]).toBe(Task.Build);
  });
});

describe('derribar', () => {
  it('un edificio terminado desaparece y devuelve lo que tuviera en cola', () => {
    const { sim } = economyWorld();
    const e = sim.entities;
    const barracks = sim.placeBuilding(BuildingType.Barracks, P, 12, 12);
    const food = sim.players.get(P, Resource.Food);
    const gold = sim.players.get(P, Resource.Gold);
    sim.schedule({ type: 'train', player: P, building: barracks, unitType: UnitType.Militia });
    sim.schedule({ type: 'train', player: P, building: barracks, unitType: UnitType.Militia });
    run(sim, 5);
    expect(sim.players.get(P, Resource.Food)).toBeLessThan(food);
    sim.schedule({ type: 'demolish', player: P, buildings: [barracks] });
    run(sim, 1);
    expect(e.isAlive(barracks)).toBe(false);
    expect(sim.grid.passable(12, 12)).toBe(true);
    expect(sim.players.get(P, Resource.Food)).toBe(food);
    expect(sim.players.get(P, Resource.Gold)).toBe(gold);
  });

  it('no se pueden derribar edificios ajenos', () => {
    const { sim } = economyWorld();
    const house = sim.placeBuilding(BuildingType.House, 2, 12, 12);
    sim.schedule({ type: 'demolish', player: P, buildings: [house] });
    run(sim, 1);
    expect(sim.entities.isAlive(house)).toBe(true);
  });

  it('unos cimientos a medias devuelven la parte del coste aún no gastada', () => {
    const { sim } = economyWorld();
    const e = sim.entities;
    const v = villagerAt(sim, 20, 20);
    sim.schedule({ type: 'build', player: P, units: [v], buildingType: BuildingType.House, tileX: 10, tileY: 10, queue: false });
    run(sim, 1);
    const house = at(sim, 10, 10);
    expect(wood(sim)).toBe(250 - BUILDING_DEFS[BuildingType.House].cost[Resource.Wood]);
    e.buildProgress[house] = buildTotal(sim, BuildingType.House) / 2;
    sim.schedule({ type: 'demolish', player: P, buildings: [house] });
    run(sim, 2);
    expect(e.isAlive(house)).toBe(false);
    expect(wood(sim)).toBe(250 - 15);
    expect(e.task[v]).toBe(Task.None);
    expect(e.moveState[v]).toBe(MoveState.Idle); // se para: ya no hay obra a la que ir
  });

  it('el cliente pide una segunda pulsación en 3 segundos para un edificio terminado; unos cimientos, a la primera', () => {
    const { sim } = economyWorld();
    let now = 0;
    const sent: Command[] = [];
    const selection = new Selection();
    const client = new GameClient(sim, selection, P, (c) => sent.push(c), () => now);
    const house = sim.placeBuilding(BuildingType.House, P, 12, 12);
    selection.replace([house]);
    expect(client.demolishView()).toMatchObject({ label: 'Derribar', armed: false });
    client.demolishSelected();
    expect(sent).toHaveLength(0);
    expect(client.demolishView()?.armed).toBe(true);
    now = 3500; // se pasó el plazo: vuelve a pedir confirmación
    expect(client.demolishView()?.armed).toBe(false);
    client.demolishSelected();
    expect(sent).toHaveLength(0);
    now = 4000;
    client.demolishSelected();
    expect(sent).toEqual([{ type: 'demolish', player: P, buildings: [house] }]);
    expect(client.activeNotices().some((n) => n.startsWith('Vuelve a pulsar'))).toBe(false);

    sim.entities.built[house] = 0;
    expect(client.demolishView()?.label).toBe('Cancelar obra');
    client.demolishSelected();
    expect(sent).toHaveLength(2);
    // Un edificio ajeno no tiene botón.
    selection.replace([sim.placeBuilding(BuildingType.House, 2, 16, 16)]);
    expect(client.demolishView()).toBeNull();
  });

  it('si cae un edificio mientras investiga, la tecnología se puede volver a investigar', () => {
    const { sim } = economyWorld();
    sim.players.era[P] = 1;
    const mill = sim.placeBuilding(BuildingType.Mill, P, 12, 12);
    sim.schedule({ type: 'research', player: P, building: mill, tech: TechType.Fallow });
    run(sim, 1);
    expect(researchBlocker(sim, P, TechType.Fallow)).toBe('Ya se está investigando');
    kill(sim, mill);
    expect(researchBlocker(sim, P, TechType.Fallow)).toBeNull();
  });
});

describe('partidas guardadas', () => {
  it('una partida guardada antes de la reparación carga y se puede reparar', () => {
    const { sim, tc } = economyWorld();
    const snap = structuredClone(snapshotSim(sim));
    // Así era el estado antes de que existieran estos arrays.
    const old = snap.root.entities as unknown as Record<string, unknown> & { numeric: unknown[] };
    old.numeric = old.numeric.filter((a) => a !== old.repairAccum && a !== old.repairDone);
    delete old.repairAccum;
    delete old.repairDone;
    const loaded = restoreSim(snap);
    const e = loaded.entities;
    expect(e.repairAccum).toBeInstanceOf(Int32Array);
    expect(e.repairDone.length).toBe(e.capacity);
    e.hp[tc] = 2000;
    const v = villagerAt(loaded, 7, 3);
    loaded.schedule({ type: 'construct', player: P, units: [v], target: tc, queue: false });
    runUntil(loaded, 2000, () => e.hp[tc] === e.maxHp[tc]);
    expect(e.hp[tc]).toBe(e.maxHp[tc]);
    // Y se sigue pudiendo guardar.
    expect(() => cloneSim(loaded)).not.toThrow();
  });
});

describe('IA: reparación', () => {
  it('repara su centro de la villa cuando no hay enemigos cerca', () => {
    const map = generateMatchMap({ width: 96, height: 96, seed: 'tres', players: 2 });
    const sim = new Simulation({ map, seed: 11, tickRate: 20 });
    const starts = setupMatch(sim, [Faction.Castilla, Faction.Inglaterra]);
    sim.addController(new AiPlayer(sim, 1));
    const end = (minutes: number) => sim.tick + minutes * 60 * sim.tickRate;
    const until = (tick: number, done: () => boolean) => {
      while (sim.tick < tick && !done()) sim.step();
    };
    until(end(3), () => false);
    const tc = starts[0].townCenter;
    const e = sim.entities;
    e.hp[tc] = Math.floor(e.maxHp[tc] * 0.6);
    const damaged = e.hp[tc];
    until(end(1), () => e.task.some((t, id) => t === Task.Build && e.taskTarget[id] === tc && e.owner[id] === 1));
    const repairers = () => [...e.task.keys()].filter((id) => e.task[id] === Task.Build && e.taskTarget[id] === tc && e.owner[id] === 1 && e.isAlive(id));
    expect(repairers().length).toBeGreaterThan(0);
    expect(repairers().length).toBeLessThanOrEqual(3);
    until(end(3), () => e.hp[tc] === e.maxHp[tc]);
    expect(e.hp[tc]).toBeGreaterThan(damaged + 600);
  }, 30_000);
});
