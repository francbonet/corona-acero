import { BUILDING_DEFS, BuildingType } from '../../src/data/buildings';
import { NodeType } from '../../src/data/nodes';
import { Resource } from '../../src/data/resources';
import { UNIT_DEFS, UnitType } from '../../src/data/units';
import { FP_SHIFT } from '../../src/engine/fixed';
import { Comp, MoveState, Task } from '../../src/sim/entities';
import type { Simulation } from '../../src/sim/simulation';
import { findNode } from '../../src/sim/systems/workers';
import { canPlaceBuilding } from '../../src/sim/world';

/**
 * Guion de apertura económica para pruebas (germen del gestor económico de la IA, Fase 5).
 * Solo usa la cola de órdenes, igual que un jugador.
 */
const RATIO: Record<Resource, number> = {
  [Resource.Food]: 0.46,
  [Resource.Wood]: 0.34,
  [Resource.Gold]: 0.12,
  [Resource.Stone]: 0.08,
};
const ORDER: Resource[] = [Resource.Food, Resource.Wood, Resource.Gold, Resource.Stone];

function resourceOf(nodeType: number): Resource | -1 {
  switch (nodeType) {
    case NodeType.Tree:
      return Resource.Wood;
    case NodeType.Gold:
      return Resource.Gold;
    case NodeType.Stone:
      return Resource.Stone;
    case NodeType.Berries:
    case NodeType.Carcass:
    case NodeType.Sheep:
    case NodeType.Farm:
      return Resource.Food;
    default:
      return -1;
  }
}

export class EcoScript {
  /** Dejar de entrenar aldeanos (para ahorrar comida, p. ej. para avanzar de era). */
  holdVillagers = false;

  constructor(
    private readonly sim: Simulation,
    private readonly player: number,
  ) {}

  /** Llamar una vez por segundo de juego. */
  update(): void {
    const sim = this.sim;
    const e = sim.entities;
    const P = this.player;
    const villagers: number[] = [];
    const idle: number[] = [];
    const gatherers: number[][] = [[], [], [], []];
    const count = new Array<number>(8).fill(0);
    const pending = new Array<number>(8).fill(0);
    const producers: number[] = [];
    let home = 0;
    for (let id = 1; id < e.highWater; id++) {
      if (e.owner[id] !== P) continue;
      if (e.has(id, Comp.Worker)) {
        villagers.push(id);
        const r = e.task[id] === Task.Gather || e.task[id] === Task.Deliver ? resourceOf(e.homeType[id]) : -1;
        if (r >= 0) gatherers[r].push(id);
        else if (e.task[id] === Task.None && e.moveState[id] === MoveState.Idle) idle.push(id);
      } else if (e.has(id, Comp.Building)) {
        const t = e.buildingType[id];
        count[t]++;
        if (!e.built[id]) pending[t]++;
        else if (e.has(id, Comp.Producer)) producers.push(id);
        if (t === BuildingType.TownCenter && !home) home = id;
      }
    }
    if (!home) return;
    const hx = e.x[home] >> FP_SHIFT;
    const hy = e.y[home] >> FP_SHIFT;
    const stock = (r: Resource) => sim.players.get(P, r);
    const builder = (): number => idle.shift() ?? gatherers[Resource.Wood].shift() ?? gatherers[Resource.Food].shift() ?? 0;
    const build = (type: BuildingType, near: [number, number], margin: number): boolean => {
      if (!sim.players.canAfford(P, BUILDING_DEFS[type].cost)) return false;
      const spot = this.findSpot(type, near[0], near[1], margin);
      const v = spot && builder();
      if (!spot || !v) return false;
      sim.schedule({ type: 'build', player: P, units: [v], buildingType: type, tileX: spot[0], tileY: spot[1], queue: false });
      return true;
    };

    // Producción: aldeanos hasta 80; luego milicia en el cuartel.
    for (const b of producers) {
      const queue = e.queue[b]?.length ?? 0;
      if (queue >= 2) continue;
      const t = e.buildingType[b];
      if (t === BuildingType.TownCenter && !this.holdVillagers && villagers.length < 80 && stock(Resource.Food) >= UNIT_DEFS[UnitType.Villager].cost[0]) {
        sim.schedule({ type: 'train', player: P, building: b, unitType: UnitType.Villager });
      } else if (t === BuildingType.Barracks && villagers.length >= 40 && sim.players.canAfford(P, UNIT_DEFS[UnitType.Militia].cost)) {
        sim.schedule({ type: 'train', player: P, building: b, unitType: UnitType.Militia });
      }
    }

    // Casas antes de quedarse sin población.
    const room = sim.players.popCap[P] - sim.players.popUsed[P];
    if (sim.players.popCap[P] < 200 && room <= 3 + 2 * count[BuildingType.TownCenter] && pending[BuildingType.House] < (villagers.length > 30 ? 2 : 1)) {
      build(BuildingType.House, [hx, hy - 6], 1);
    }
    // Puntos de entrega junto a los recursos.
    const nearest = (types: number[]) => (villagers[0] ? findNode(sim, villagers[0], types, e.x[home], e.y[home], 30, 0) : 0);
    if (count[BuildingType.LumberCamp] === 0 && gatherers[Resource.Wood].length >= 3) {
      const tree = nearest([NodeType.Tree]);
      if (tree) build(BuildingType.LumberCamp, [e.tileX[tree], e.tileY[tree]], 0);
    }
    if (count[BuildingType.Mill] === 0 && villagers.length >= 8) {
      const bush = nearest([NodeType.Berries]);
      build(BuildingType.Mill, bush ? [e.tileX[bush], e.tileY[bush]] : [hx + 5, hy + 5], 0);
    }
    if (count[BuildingType.MiningCamp] === 0 && gatherers[Resource.Gold].length >= 2) {
      const gold = nearest([NodeType.Gold]);
      if (gold) build(BuildingType.MiningCamp, [e.tileX[gold], e.tileY[gold]], 0);
    }
    if (count[BuildingType.Barracks] === 0 && villagers.length >= 30) build(BuildingType.Barracks, [hx + 7, hy], 1);
    if (count[BuildingType.TownCenter] < 2 && villagers.length >= 25) build(BuildingType.TownCenter, [hx - 9, hy + 2], 1);

    // Aldeanos ociosos al recurso con más déficit.
    for (const v of idle) {
      const want = ORDER.slice().sort((a, b) => RATIO[b] * villagers.length - gatherers[b].length - (RATIO[a] * villagers.length - gatherers[a].length));
      for (const r of want) {
        if (this.assign(v, r, home)) {
          gatherers[r].push(v);
          break;
        }
      }
    }
  }

  private assign(v: number, r: Resource, home: number): boolean {
    const sim = this.sim;
    const e = sim.entities;
    const P = this.player;
    const from: [number, number] = [e.x[home], e.y[home]];
    const types: Record<Resource, number[][]> = {
      [Resource.Food]: [[NodeType.Carcass], [NodeType.Berries], [NodeType.Farm]],
      [Resource.Wood]: [[NodeType.Tree]],
      [Resource.Gold]: [[NodeType.Gold]],
      [Resource.Stone]: [[NodeType.Stone]],
    };
    for (const t of types[r]) {
      const node = findNode(sim, v, t, from[0], from[1], r === Resource.Food ? 14 : 30, 0);
      if (node) {
        sim.schedule({ type: 'gather', player: P, units: [v], target: node });
        return true;
      }
    }
    if (r === Resource.Food && sim.players.canAfford(P, BUILDING_DEFS[BuildingType.Farm].cost)) {
      const spot = this.findSpot(BuildingType.Farm, e.tileX[home] + 1, e.tileY[home] + 1, 0);
      if (spot) {
        sim.schedule({ type: 'build', player: P, units: [v], buildingType: BuildingType.Farm, tileX: spot[0], tileY: spot[1], queue: false });
        return true;
      }
    }
    return false;
  }

  /** Primer hueco válido en espiral alrededor de (x, y), dejando `margin` casillas libres alrededor. */
  private findSpot(type: BuildingType, x: number, y: number, margin: number): [number, number] | null {
    const size = BUILDING_DEFS[type].size;
    const grid = this.sim.grid;
    for (let r = 0; r <= 24; r++) {
      for (let oy = y - r; oy <= y + r; oy++) {
        for (let ox = x - r; ox <= x + r; ox++) {
          if (Math.max(Math.abs(ox - x), Math.abs(oy - y)) !== r) continue;
          const sx = ox - (size >> 1);
          const sy = oy - (size >> 1);
          if (!canPlaceBuilding(this.sim, type, sx, sy)) continue;
          let free = true;
          for (let ty = sy - margin; ty < sy + size + margin && free; ty++) {
            for (let tx = sx - margin; tx < sx + size + margin && free; tx++) if (!grid.buildable(tx, ty)) free = false;
          }
          if (free) return [sx, sy];
        }
      }
    }
    return null;
  }
}
