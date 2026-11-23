import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/data/buildings';
import { NodeType } from '../src/data/nodes';
import { UnitType } from '../src/data/units';
import { GameClient } from '../src/game/client';
import { createMatch } from '../src/game/match';
import { LOCAL_PLAYER } from '../src/game/scenario';
import { Selection } from '../src/game/selection';
import { TUTORIAL_MATCH, TUTORIAL_STEP_COUNT, TUTORIAL_STOCK, Tutorial } from '../src/game/tutorial';
import { Comp } from '../src/sim/entities';
import type { Simulation } from '../src/sim/simulation';
import { tileCenterFixed } from '../src/engine/fixed';
import { canPlaceBuilding } from '../src/sim/world';

/** Juega el tutorial como lo haría un jugador: hace lo que pide cada paso y comprueba que avanza. */
describe('tutorial', () => {
  const setup = () => {
    const { sim } = createMatch(TUTORIAL_MATCH);
    sim.players.set(LOCAL_PLAYER, TUTORIAL_STOCK);
    const selection = new Selection();
    const client = new GameClient(sim, selection, LOCAL_PLAYER, (c) => sim.schedule(c), () => 0);
    // Las unidades iniciales aparecen en el primer paso de la simulación.
    sim.step();
    return { sim, selection, client, tutorial: new Tutorial(sim, client) };
  };
  const e = (sim: Simulation) => sim.entities;
  const mine = (sim: Simulation, type: UnitType) => sim.unitIds.filter((id) => e(sim).isAlive(id) && e(sim).owner[id] === LOCAL_PLAYER && e(sim).unitType[id] === type);
  const building = (sim: Simulation, type: BuildingType) =>
    sim.buildingIds.find((id) => e(sim).isAlive(id) && e(sim).owner[id] === LOCAL_PLAYER && e(sim).buildingType[id] === type) ?? 0;
  /** Fuente más cercana al centro de la villa (ids de entidades vivas con ese tipo de nodo). */
  const nearestNode = (sim: Simulation, types: readonly NodeType[]) => {
    const tc = building(sim, BuildingType.TownCenter);
    let best = 0;
    let bestD = Infinity;
    for (let id = 1; id < e(sim).nodeType.length; id++) {
      if (!e(sim).isAlive(id) || (e(sim).mask[id] & Comp.Resource) === 0 || !types.includes(e(sim).nodeType[id] as NodeType)) continue;
      const d = Math.abs(e(sim).tileX[id] - e(sim).tileX[tc]) + Math.abs(e(sim).tileY[id] - e(sim).tileY[tc]);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  };
  /** Casilla libre para un edificio, en espiral alrededor del centro de la villa. */
  const freeSpot = (sim: Simulation, type: BuildingType): [number, number] => {
    const tc = building(sim, BuildingType.TownCenter);
    const cx = e(sim).tileX[tc];
    const cy = e(sim).tileY[tc];
    for (let r = 5; r < 20; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) === r && canPlaceBuilding(sim, type, cx + dx, cy + dy)) return [cx + dx, cy + dy];
        }
      }
    }
    throw new Error('sin sitio');
  };
  /** Avanza la partida hasta que el tutorial pase de paso (como mucho `seconds`). */
  const playUntilNext = (sim: Simulation, tutorial: Tutorial, seconds: number) => {
    const step = tutorial.view().step;
    for (let t = 0; t < seconds * 20 && tutorial.view().step === step; t++) {
      sim.step();
      if (t % 5 === 0) tutorial.update();
    }
    return tutorial.view().step;
  };

  it('se puede completar de principio a fin haciendo lo que pide cada paso', () => {
    const { sim, selection, tutorial } = setup();
    const P = LOCAL_PLAYER;
    tutorial.update();
    expect(tutorial.view()).toMatchObject({ step: 1, total: TUTORIAL_STEP_COUNT, manual: true });

    // 1. Bienvenida: se pasa con "Siguiente".
    tutorial.next();
    expect(tutorial.view().step).toBe(2);

    // 2. Seleccionar un aldeano.
    const villagers = mine(sim, UnitType.Villager);
    expect(villagers.length).toBeGreaterThanOrEqual(3);
    selection.replace([villagers[0]]);
    expect(playUntilNext(sim, tutorial, 1)).toBe(3);

    // 3. Madera.
    sim.schedule({ type: 'gather', player: P, units: [villagers[0]], target: nearestNode(sim, [NodeType.Tree]) });
    expect(playUntilNext(sim, tutorial, 30)).toBe(4);

    // 4. Comida.
    sim.schedule({ type: 'gather', player: P, units: [villagers[1]], target: nearestNode(sim, [NodeType.Berries, NodeType.Sheep]) });
    expect(playUntilNext(sim, tutorial, 30)).toBe(5);

    // 5. Entrenar un aldeano (el paso resalta su botón).
    expect(tutorial.hint({ kind: 'unit', type: UnitType.Villager } as never)).toBe(true);
    sim.schedule({ type: 'train', player: P, building: building(sim, BuildingType.TownCenter), unitType: UnitType.Villager });
    expect(playUntilNext(sim, tutorial, 5)).toBe(6);

    // 6. Una casa.
    const [hx, hy] = freeSpot(sim, BuildingType.House);
    sim.schedule({ type: 'build', player: P, units: [villagers[2]], buildingType: BuildingType.House, tileX: hx, tileY: hy, queue: false });
    expect(playUntilNext(sim, tutorial, 30)).toBe(7);

    // 7. Un cuartel terminado (con tres aldeanos).
    const [bx, by] = freeSpot(sim, BuildingType.Barracks);
    sim.schedule({ type: 'build', player: P, units: villagers.slice(0, 3), buildingType: BuildingType.Barracks, tileX: bx, tileY: by, queue: false });
    expect(playUntilNext(sim, tutorial, 240)).toBe(8);

    // 8. Tres milicias.
    const barracks = building(sim, BuildingType.Barracks);
    for (let i = 0; i < 3; i++) sim.schedule({ type: 'train', player: P, building: barracks, unitType: UnitType.Militia });
    expect(playUntilNext(sim, tutorial, 180)).toBe(9);

    // 9. Explorar con el batidor: lejos, hacia el centro del mapa.
    const scout = mine(sim, UnitType.Scout)[0];
    expect(scout).toBeTruthy();
    const w = sim.grid.width;
    sim.schedule({ type: 'move', player: P, units: [scout], x: tileCenterFixed(w >> 1), y: tileCenterFixed(sim.grid.height >> 1) });
    expect(playUntilNext(sim, tutorial, 90)).toBe(10);

    // 10. Lobos: aparecen cerca de la aldea y las milicias acaban con ellos.
    sim.step();
    const tc = building(sim, BuildingType.TownCenter);
    const near = (id: number) => Math.abs((e(sim).x[id] >> 8) - e(sim).tileX[tc]) + Math.abs((e(sim).y[id] >> 8) - e(sim).tileY[tc]) < 20;
    const wolves = sim.unitIds.filter((id) => e(sim).isAlive(id) && e(sim).unitType[id] === UnitType.Wolf && near(id));
    expect(wolves.length).toBeGreaterThanOrEqual(2);
    const militia = mine(sim, UnitType.Militia);
    for (const wolf of wolves) sim.schedule({ type: 'attack', player: P, units: militia, target: wolf });
    expect(playUntilNext(sim, tutorial, 120)).toBe(11);

    // 11. Fin.
    expect(tutorial.view()).toMatchObject({ step: TUTORIAL_STEP_COUNT, done: true });
    expect(tutorial.finished).toBe(true);
  });

  it('el rival no juega: en cinco minutos no entrena tropas ni sale de su base', () => {
    const { sim } = setup();
    const army = () => sim.unitIds.filter((id) => e(sim).isAlive(id) && e(sim).owner[id] === 2 && (e(sim).mask[id] & Comp.Worker) === 0).length;
    const before = army();
    for (let t = 0; t < 20 * 300; t++) sim.step();
    expect(army()).toBeLessThanOrEqual(before);
  });
});
