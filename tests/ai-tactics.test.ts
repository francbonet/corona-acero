import { describe, expect, it } from 'vitest';
import { AiPlayer } from '../src/ai/ai-player';
import { buildContext } from '../src/ai/context';
import { planApproach } from '../src/ai/tactics';
import { BuildingType } from '../src/data/buildings';
import { Faction } from '../src/data/factions';
import { UnitType } from '../src/data/units';
import { FP_ONE, tileCenterFixed } from '../src/engine/fixed';
import { GameMap } from '../src/map/game-map';
import { Simulation } from '../src/sim/simulation';
import { indexEntities } from '../src/sim/world';

const point = (x: number, y: number) => ({ x: tileCenterFixed(x), y: tileCenterFixed(y) });

function battlefield() {
  const sim = new Simulation({ map: new GameMap(96, 96), seed: 31, tickRate: 20 });
  sim.addPlayer(1, Faction.Castilla);
  sim.addPlayer(2, Faction.Inglaterra);
  const ai = new AiPlayer(sim, 1, { strategy: 'caballeria' });
  sim.visibility.revealAll(1);
  const remember = (type: BuildingType, x: number, y: number) => {
    const id = sim.placeBuilding(type, 2, x, y);
    const e = sim.entities;
    ai.memory.enemyBuildings.set(id, { x: x + (e.size[id] >> 1), y: y + (e.size[id] >> 1), type, owner: 2 });
    return id;
  };
  const plan = () => planApproach(ai, buildContext(sim, 1), point(12, 48), point(82, 48), false);
  return { sim, ai, plan, remember };
}

describe('IA: elección del acceso al objetivo', () => {
  it('usa el acceso directo si no hay peligro que justifique un rodeo', () => {
    const { plan } = battlefield();
    expect(plan()).toMatchObject({ side: 0, points: [point(82, 48)] });
  });

  it('rodea una fortaleza interpuesta y elige el lado menos expuesto', () => {
    const { remember, plan } = battlefield();
    remember(BuildingType.Castle, 44, 46);
    remember(BuildingType.Castle, 44, 25); // protege también el flanco norte
    const route = plan();
    expect(route.side).toBe(1);
    expect(route.points).toHaveLength(3);
    expect(route.points[0].y).toBeGreaterThan(tileCenterFixed(60));
    expect(route.points.at(-1)).toEqual(point(82, 48));
  });

  it('descarta un flanco que no es transitable y usa el otro', () => {
    const { sim, remember, plan } = battlefield();
    remember(BuildingType.Castle, 44, 46);
    // Barrera conocida que encierra por completo el flanco norte.
    for (let y = 0; y <= 40; y++) for (let x = 24; x <= 75; x++) sim.grid.setBlocked(x, y, true);
    sim.visibility.layers(1).visible.fill(1);
    const route = plan();
    expect(route.side).toBe(1);
    expect(route.points.every((p) => sim.grid.passable(p.x >> 8, p.y >> 8))).toBe(true);
  });

  it('no usa fortalezas, tropas ni obstáculos que siguen ocultos para elegir el flanco', () => {
    const { sim, plan } = battlefield();
    sim.visibility.layers(1).explored.fill(0);
    const before = plan();
    sim.placeBuilding(BuildingType.Castle, 2, 44, 46);
    sim.spawnGroup(UnitType.Knight, 2, 36, 48, 20);
    for (let y = 30; y < 60; y++) sim.grid.setBlocked(30, y, true);
    indexEntities(sim);
    expect(plan()).toEqual(before);
  });

  it('después de fracasar por el centro, prueba un flanco sin dar un rodeo excesivo', () => {
    const { ai, sim } = battlefield();
    const route = planApproach(ai, buildContext(sim, 1), point(12, 48), point(82, 48), false,
      { x: 82, y: 48, tick: sim.tick, side: 0 });
    expect(route.side).not.toBe(0);
    const points = [point(12, 48), ...route.points];
    const length = points.slice(1).reduce((total, p, i) => total + Math.hypot(p.x - points[i].x, p.y - points[i].y) / FP_ONE, 0);
    expect(length).toBeLessThan(110);
  });

  it('si fracasa un flanco, prueba el contrario cuando ambos tienen un riesgo parecido', () => {
    const { ai, sim, remember } = battlefield();
    remember(BuildingType.Castle, 44, 46);
    const ctx = buildContext(sim, 1);
    const first = planApproach(ai, ctx, point(12, 48), point(82, 48), false);
    const second = planApproach(ai, ctx, point(12, 48), point(82, 48), false,
      { x: 82, y: 48, tick: sim.tick, side: first.side });
    expect(first.side).not.toBe(0);
    expect(second.side).toBe(-first.side);
    expect(planApproach(ai, ctx, point(12, 48), point(82, 48), false)).toEqual(first);
  });
});
