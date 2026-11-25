import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiPlayer } from '../src/ai/ai-player';
import { buildContext } from '../src/ai/context';
import { Difficulty } from '../src/ai/difficulty';
import { runOffense } from '../src/ai/offense';
import { BuildingType } from '../src/data/buildings';
import { Faction } from '../src/data/factions';
import { UnitType } from '../src/data/units';
import { FP_ONE, tileCenterFixed } from '../src/engine/fixed';
import { cloneSim, restoreSim, snapshotSim } from '../src/game/save';
import { GameMap } from '../src/map/game-map';
import type { Command } from '../src/sim/commands';
import { MoveState, Order } from '../src/sim/entities';
import { applyCommand } from '../src/sim/orders';
import { Simulation } from '../src/sim/simulation';
import { indexEntities } from '../src/sim/world';

const point = (x: number, y: number) => ({ x: tileCenterFixed(x), y: tileCenterFixed(y) });
const rally = point(16, 16);

function arena(difficulty: Difficulty = Difficulty.Medium) {
  const sim = new Simulation({ map: new GameMap(96, 96), seed: 11, tickRate: 20 });
  sim.addPlayer(1, Faction.Castilla);
  sim.addPlayer(2, Faction.Inglaterra);
  sim.players.era[1] = 1;
  sim.placeBuilding(BuildingType.TownCenter, 1, 4, 4);
  const target = sim.placeBuilding(BuildingType.Barracks, 2, 64, 14);
  const ai = new AiPlayer(sim, 1, { difficulty, strategy: 'caballeria' });
  const commands: Command[] = [];
  const spy = vi.spyOn(ai, 'send').mockImplementation((command) => commands.push(command));
  const remember = (id: number) => {
    const e = sim.entities;
    ai.memory.enemyBuildings.set(id, {
      x: e.tileX[id] + (e.size[id] >> 1), y: e.tileY[id] + (e.size[id] >> 1),
      type: e.buildingType[id], owner: e.owner[id],
    });
  };
  remember(target);
  const decide = () => {
    indexEntities(sim);
    sim.visibility.update(sim);
    runOffense(ai, { ...buildContext(sim, 1), minute: 40 }, rally);
  };
  const relocate = (ids: number[], x: number, y: number) => ids.forEach((id, i) => {
    sim.entities.x[id] = tileCenterFixed(x) + (i % 4) * FP_ONE;
    sim.entities.y[id] = tileCenterFixed(y) + Math.floor(i / 4) * FP_ONE;
  });
  return { sim, ai, commands, spy, target, remember, decide, relocate };
}

afterEach(() => vi.restoreAllMocks());

describe('IA: ofensivas coordinadas', () => {
  it.each([Difficulty.Easy, Difficulty.Medium, Difficulty.Hard])('reúne las tropas dispersas antes de atacar, también en dificultad %s', (difficulty) => {
    const { sim, ai, commands, decide } = arena(difficulty);
    sim.spawnGroup(UnitType.Militia, 1, 16, 16, 5);
    const scattered = sim.spawnGroup(UnitType.Militia, 1, 35, 35, 6);
    decide();
    expect(ai.attackState).toBe('gather');
    expect(commands.some((c) => c.type === 'attackMove')).toBe(false);
    expect(commands.some((c) => c.type === 'move' && scattered.every((id) => c.units.includes(id)))).toBe(true);
  });

  it('sale en una formación con infantería, caballería, arqueros, asedio y sanadores', () => {
    const { sim, ai, commands, decide } = arena();
    const units = [
      ...sim.spawnGroup(UnitType.Militia, 1, 16, 16, 10),
      ...sim.spawnGroup(UnitType.Archer, 1, 15, 18, 4),
      ...sim.spawnGroup(UnitType.Knight, 1, 18, 15, 2),
      ...sim.spawnGroup(UnitType.Ram, 1, 14, 16, 1),
      ...sim.spawnGroup(UnitType.Monk, 1, 14, 17, 1),
    ];
    decide();
    const attack = commands.find((c) => c.type === 'attackMove');
    expect(attack?.type).toBe('attackMove');
    if (attack?.type !== 'attackMove') return;
    expect([...attack.units].sort()).toEqual([...units].sort());
    applyCommand(sim, attack);
    const slowest = Math.min(...units.map((id) => sim.entities.speed[id]));
    expect(units.every((id) => (sim.entities.speedCap[id] || sim.entities.speed[id]) === slowest)).toBe(true);
    expect(ai.campaign?.members).toHaveLength(units.length);
  });

  it('un recluta espera compañía y los refuerzos salen juntos hacia el bloque principal', () => {
    const { sim, ai, commands, decide, relocate } = arena();
    const army = sim.spawnGroup(UnitType.Militia, 1, 16, 16, 10);
    decide();
    relocate(army, 40, 16);
    commands.length = 0;
    const [recruit] = sim.spawnGroup(UnitType.Militia, 1, 16, 16, 1);
    decide();
    expect(commands.some((c) => c.type === 'attackMove' && c.units.includes(recruit))).toBe(false);
    expect(ai.campaign?.members).not.toContain(recruit);
    const more = sim.spawnGroup(UnitType.Militia, 1, 17, 16, 2);
    commands.length = 0;
    decide();
    const reinforcement = commands.find((c) => c.type === 'attackMove' && c.units.includes(recruit));
    expect(reinforcement?.type).toBe('attackMove');
    if (reinforcement?.type !== 'attackMove') return;
    expect(reinforcement.units).toHaveLength(3);
    expect(more.every((id) => reinforcement.units.includes(id))).toBe(true);
    expect(reinforcement.x).toBeGreaterThan(tileCenterFixed(35));
  });

  it('prioriza la producción sobre una granja cercana y mantiene el objetivo ante nuevos avistamientos', () => {
    const { sim, ai, target, remember, decide } = arena();
    sim.spawnGroup(UnitType.Militia, 1, 16, 16, 12);
    remember(sim.placeBuilding(BuildingType.Farm, 2, 55, 15));
    decide();
    expect(ai.campaign?.target).toBe(target);
    remember(sim.placeBuilding(BuildingType.Cathedral, 2, 50, 25));
    decide();
    expect(ai.campaign?.target).toBe(target);
    ai.memory.enemyBuildings.delete(target);
    decide();
    expect(ai.campaign?.target).not.toBe(target);
  });

  it('prefiere una economía expuesta a atacar una fortaleza sin asedio', () => {
    const { sim, ai, target, remember, decide } = arena();
    ai.memory.enemyBuildings.delete(target);
    sim.spawnGroup(UnitType.Militia, 1, 16, 16, 12);
    remember(sim.placeBuilding(BuildingType.Castle, 2, 55, 14));
    const camp = sim.placeBuilding(BuildingType.LumberCamp, 2, 60, 40);
    remember(camp);
    decide();
    expect(ai.campaign?.target).toBe(camp);
  });

  it('se retira de un combate perdido, incluso estando trabada, y lleva consigo el apoyo', () => {
    const { sim, ai, commands, decide, relocate } = arena();
    const army = sim.spawnGroup(UnitType.Militia, 1, 16, 16, 10);
    const support = [...sim.spawnGroup(UnitType.Ram, 1, 16, 18, 1), ...sim.spawnGroup(UnitType.Monk, 1, 15, 17, 1)];
    decide();
    relocate([...army, ...support], 40, 16);
    const enemies = sim.spawnGroup(UnitType.Knight, 2, 44, 16, 20);
    for (const id of army) {
      sim.entities.hp[id] = 5;
      sim.entities.attackTarget[id] = enemies[0];
    }
    commands.length = 0;
    decide();
    expect(ai.attackState).toBe('gather');
    expect(ai.campaign).toBeNull();
    const retreat = commands.find((c) => c.type === 'move' && c.units.includes(army[0]));
    expect(retreat?.type).toBe('move');
    if (retreat?.type !== 'move') return;
    expect([...army, ...support].every((id) => retreat.units.includes(id))).toBe(true);
    applyCommand(sim, retreat);
    expect(army.every((id) => sim.entities.attackTarget[id] === 0 && sim.entities.order[id] === Order.Move)).toBe(true);
    relocate([...army, ...support], 16, 16);
    commands.length = 0;
    decide();
    expect(ai.attackState).toBe('gather'); // no da media vuelta inmediatamente después de retirarse
  });

  it('los refuerzos en casa no ocultan que el ejército desplegado ha sido destruido', () => {
    const { sim, ai, decide } = arena();
    const army = sim.spawnGroup(UnitType.Militia, 1, 16, 16, 10);
    decide();
    for (const id of army.slice(2)) sim.entities.destroy(id);
    sim.spawnGroup(UnitType.Militia, 1, 16, 16, 15);
    decide();
    expect(ai.attackState).toBe('gather');
    expect(ai.campaign).toBeNull();
  });

  it('no utiliza un ejército enemigo oculto para decidir la retirada', () => {
    const { sim, ai, decide, relocate } = arena();
    const army = sim.spawnGroup(UnitType.Militia, 1, 16, 16, 10);
    decide();
    relocate(army, 40, 16);
    sim.spawnGroup(UnitType.Knight, 2, 49, 16, 30);
    indexEntities(sim);
    sim.visibility.layers(1).visible.fill(0);
    runOffense(ai, { ...buildContext(sim, 1), minute: 40 }, rally);
    expect(ai.attackState).toBe('attack');
  });

  it.each([UnitType.Trebuchet, UnitType.Bombard])('la escolta espera fuera del alcance del castillo mientras el asedio %s dispara', (type) => {
    const { sim, ai, target, commands, remember, decide, relocate } = arena();
    ai.memory.enemyBuildings.delete(target);
    const castle = sim.placeBuilding(BuildingType.Castle, 2, 64, 24);
    remember(castle);
    const army = sim.spawnGroup(UnitType.Militia, 1, 16, 16, 10);
    const siege = sim.spawnGroup(type, 1, 16, 18, 1);
    decide();
    expect(ai.campaign?.target).toBe(castle);
    const goal = ai.campaign!.goal!;
    expect(Math.hypot(goal.x - tileCenterFixed(66), goal.y - tileCenterFixed(26))).toBeGreaterThan(12 * FP_ONE);
    relocate([...army, ...siege], 51, 25);
    indexEntities(sim);
    sim.visibility.layers(1).visible.fill(1);
    commands.length = 0;
    runOffense(ai, { ...buildContext(sim, 1), minute: 40 }, rally);
    const shot = commands.find((c) => c.type === 'attack' && c.units.includes(siege[0]));
    expect(shot).toMatchObject({ type: 'attack', target: castle });
    if (!shot) return;
    applyCommand(sim, shot);
    sim.entities.deployState[siege[0]] = 2;
    for (let i = 0; i < 180; i++) sim.step();
    // La escolta permanece parada en su puesto; una decisión posterior no debe desmontar el trabuquete.
    for (const id of army) sim.entities.moveState[id] = MoveState.Idle;
    sim.entities.x[army[0]] = tileCenterFixed(30); // obliga a reorganizar al rezagado
    commands.length = 0;
    runOffense(ai, { ...buildContext(sim, 1), minute: 40 }, rally);
    expect(commands.some((c) => c.type === 'attackMove' && c.units.includes(siege[0]))).toBe(false);
    expect(sim.entities.deployState[siege[0]]).toBe(2);
    sim.entities.destroy(siege[0]);
    decide();
    expect(ai.attackState).toBe('gather'); // perder el asedio no deja a la escolta esperando sin fin
  });

  it('conserva una ofensiva en marcha al guardar y cargar, y ambas copias dan las mismas órdenes', () => {
    const { sim, ai, spy, decide } = arena();
    sim.spawnGroup(UnitType.Militia, 1, 16, 16, 10);
    decide();
    spy.mockRestore();
    sim.addController(ai);
    const copy = cloneSim(sim);
    const restored = copy.controllers[0] as AiPlayer;
    expect(restored.campaign).toEqual(ai.campaign);
    for (let i = 0; i < 300; i++) {
      sim.step();
      copy.step();
    }
    expect(copy.stateHash()).toBe(sim.stateHash());
    expect(copy.log).toEqual(sim.log);
  });

  it('carga partidas anteriores a las ofensivas coordinadas y puede seguir creando tropas', () => {
    const { sim, ai, spy } = arena();
    spy.mockRestore();
    sim.addController(ai);
    sim.spawnGroup(UnitType.Militia, 1, 16, 16, 10);
    const snap = structuredClone(snapshotSim(sim));
    const oldAi = snap.root.controllers[0] as unknown as Record<string, unknown>;
    const oldEntities = snap.root.entities as unknown as Record<string, unknown>;
    delete oldAi.campaign;
    delete oldAi.regroupUntil;
    delete oldAi.failedAttacks;
    delete oldEntities.generation;
    delete oldEntities.nextGeneration;
    const restored = restoreSim(snap);
    const id = restored.spawnGroup(UnitType.Militia, 1, 16, 16, 1)[0];
    expect(restored.entities.generation[id]).toBeGreaterThan(0);
    expect(() => {
      for (let i = 0; i < 100; i++) restored.step();
    }).not.toThrow();
    expect((restored.controllers[0] as AiPlayer).attackState).toBe('gather');
  });
});

describe('IA: adaptación de las ofensivas', () => {
  it('manda al ejército por un flanco y recorre los puntos de paso antes de ir al objetivo', () => {
    const { sim, ai, commands, target, remember, decide, relocate } = arena();
    const army = sim.spawnGroup(UnitType.Militia, 1, 16, 16, 10);
    remember(sim.placeBuilding(BuildingType.Castle, 2, 37, 14));
    decide();
    expect(ai.campaign?.target).toBe(target);
    expect(ai.campaign?.tactic).toBe('flank');
    const route = ai.campaign!.approach!;
    const first = route.points[0];
    expect(commands.find((c) => c.type === 'attackMove')).toMatchObject({ ...first, units: army });
    relocate(army, first.x >> 8, first.y >> 8);
    commands.length = 0;
    decide();
    expect(route.index).toBe(1);
    expect(commands.find((c) => c.type === 'attackMove')).toMatchObject(route.points[1]);
  });

  it('al descubrir una fortaleza en el acceso directo, replantea la aproximación', () => {
    const { sim, ai, target, remember, decide } = arena();
    sim.spawnGroup(UnitType.Militia, 1, 16, 16, 10);
    decide();
    expect(ai.campaign?.approach?.side).toBe(0);
    remember(sim.placeBuilding(BuildingType.Castle, 2, 37, 14));
    decide();
    expect(ai.campaign?.target).toBe(target);
    expect(ai.campaign?.approach?.side).not.toBe(0);
  });

  it('la caballería elige una economía expuesta y ataca a sus trabajadores cercanos', () => {
    const { sim, ai, commands, remember, decide, relocate } = arena();
    const army = sim.spawnGroup(UnitType.Knight, 1, 16, 16, 10);
    const camp = sim.placeBuilding(BuildingType.MiningCamp, 2, 64, 30);
    remember(camp);
    decide();
    expect(ai.campaign?.target).toBe(camp);
    expect(ai.campaign?.tactic).toBe('raid');
    relocate(army, 57, 30);
    const workers = sim.spawnGroup(UnitType.Villager, 2, 61, 30, 3);
    commands.length = 0;
    decide();
    const raid = commands.find((c) => c.type === 'attack' && workers.includes(c.target));
    expect(raid?.type).toBe('attack');
    if (raid?.type !== 'attack') return;
    expect(raid.units.length).toBeGreaterThanOrEqual(3);
    expect(raid.units.every((id) => army.includes(id))).toBe(true);
    applyCommand(sim, raid);
    const chasing = raid.units.filter((id) => sim.entities.order[id] === Order.Attack && sim.entities.orderTarget[id] === raid.target);
    expect(chasing.length).toBeGreaterThan(0);
    // Si el trabajador huye de la zona económica, el grupo recupera su objetivo común.
    relocate([raid.target], 80, 30);
    commands.length = 0;
    decide();
    expect(ai.campaign?.raidTarget).toBeUndefined();
    expect(commands.some((c) => c.type === 'attackMove' && chasing.every((id) => c.units.includes(id)))).toBe(true);
  });

  it('la caballería mantiene el combate principal si hay una escolta enemiga junto a los trabajadores', () => {
    const { sim, ai, commands, remember, decide, relocate } = arena();
    const army = sim.spawnGroup(UnitType.Knight, 1, 16, 16, 10);
    remember(sim.placeBuilding(BuildingType.MiningCamp, 2, 64, 30));
    decide();
    expect(ai.campaign?.tactic).toBe('raid');
    relocate(army, 57, 30);
    const workers = sim.spawnGroup(UnitType.Villager, 2, 61, 30, 3);
    sim.spawnGroup(UnitType.Spearman, 2, 60, 32, 2);
    commands.length = 0;
    decide();
    expect(commands.some((c) => c.type === 'attack' && workers.includes(c.target))).toBe(false);
  });

  it('recuerda un ataque fallido y el siguiente intento busca otro objetivo', () => {
    const { sim, ai, target, remember, decide, relocate } = arena();
    const army = sim.spawnGroup(UnitType.Militia, 1, 16, 16, 10);
    decide();
    relocate(army, 40, 16);
    sim.spawnGroup(UnitType.Knight, 2, 44, 16, 20);
    for (const id of army) sim.entities.hp[id] = 5;
    decide();
    expect(ai.failedAttacks.has(target)).toBe(true);
    expect(ai.attackState).toBe('gather');
    relocate(army, 16, 16);
    const alternative = sim.placeBuilding(BuildingType.Barracks, 2, 68, 36);
    remember(alternative);
    for (let i = 0; i < 510; i++) sim.step();
    decide();
    expect(ai.campaign?.target).toBe(alternative);
  });

  it('abandona una aproximación atascada para poder probar otra', () => {
    const { sim, ai, target, decide } = arena();
    sim.spawnGroup(UnitType.Militia, 1, 16, 16, 10);
    decide();
    // Las órdenes se capturan sin aplicarse: simula un acceso por el que no consigue avanzar.
    for (let i = 0; i < 920; i++) sim.step();
    decide();
    expect(ai.campaign).toBeNull();
    expect(ai.failedAttacks.has(target)).toBe(true);
  });

  it('el plan de flanqueo y la memoria de fracasos sobreviven al guardado', () => {
    const { sim, ai, spy, target, remember, decide } = arena();
    sim.spawnGroup(UnitType.Militia, 1, 16, 16, 10);
    remember(sim.placeBuilding(BuildingType.Castle, 2, 37, 14));
    ai.failedAttacks.set(target, { x: 65, y: 15, tick: 0, side: -1 });
    decide();
    expect(ai.campaign?.approach?.side).not.toBe(0);
    spy.mockRestore();
    sim.addController(ai);
    const copy = cloneSim(sim);
    const restored = copy.controllers[0] as AiPlayer;
    expect(restored.campaign?.approach).toEqual(ai.campaign?.approach);
    expect(restored.failedAttacks).toEqual(ai.failedAttacks);
    for (let i = 0; i < 300; i++) {
      sim.step();
      copy.step();
    }
    expect(copy.log).toEqual(sim.log);
    expect(copy.stateHash()).toBe(sim.stateHash());
  });
});
