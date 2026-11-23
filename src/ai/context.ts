import { BUILDING_DEFS, BUILDING_TYPE_COUNT, BuildingType } from '../data/buildings';
import type { UnitClass } from '../data/combat';
import { NodeType } from '../data/nodes';
import { RESOURCE_COUNT, type Resource } from '../data/resources';
import { UNIT_DEFS, type UnitType } from '../data/units';
import { FP_SHIFT } from '../engine/fixed';
import { Comp, MoveState, Task } from '../sim/entities';
import type { Simulation } from '../sim/simulation';

/** Recurso que recolecta un aldeano según el tipo de su última fuente (-1 = ninguno). */
export function resourceOfNode(nodeType: number): Resource | -1 {
  switch (nodeType) {
    case NodeType.Tree:
      return 1;
    case NodeType.Stone:
      return 2;
    case NodeType.Gold:
      return 3;
    case NodeType.Berries:
    case NodeType.Carcass:
    case NodeType.Sheep:
    case NodeType.Farm:
    case NodeType.Deer:
    case NodeType.Boar:
      return 0;
    default:
      return -1;
  }
}

/** Lo que la IA sabe de sí misma y de lo que ve en este momento (se rehace en cada decisión). */
export interface AiContext {
  readonly sim: Simulation;
  readonly player: number;
  readonly era: number;
  readonly minute: number;
  readonly villagers: number[];
  readonly idle: number[];
  /** Aldeanos por recurso que recolectan (o llevan). */
  readonly gatherers: number[][];
  readonly builders: number[];
  /** Unidades militares (con ataque, sin aldeanos ni asedio). */
  readonly army: number[];
  readonly siege: number[];
  readonly monks: number[];
  /** Edificios propios por tipo (también cimientos). */
  readonly buildings: number[][];
  readonly home: number;
  readonly homeX: number;
  readonly homeY: number;
  /** Unidades enemigas visibles ahora (que ocupan población). */
  readonly enemies: number[];
  /** Enemigos visibles cerca de algún edificio propio. */
  readonly threats: number[];
  readonly room: number;
}

/** Radio (casillas) alrededor de los edificios propios en el que un enemigo cuenta como amenaza. */
const THREAT_RADIUS = 14;

export function buildContext(sim: Simulation, player: number): AiContext {
  const e = sim.entities;
  const villagers: number[] = [];
  const idle: number[] = [];
  const builders: number[] = [];
  const gatherers: number[][] = Array.from({ length: RESOURCE_COUNT }, () => []);
  const army: number[] = [];
  const siege: number[] = [];
  const monks: number[] = [];
  const enemies: number[] = [];
  const buildings: number[][] = Array.from({ length: BUILDING_TYPE_COUNT }, () => []);
  const { visible } = sim.visibility.layers(player);
  const w = sim.grid.width;

  for (let id = 1; id < e.highWater; id++) {
    const m = e.mask[id];
    if (m === 0) continue;
    const owner = e.owner[id];
    if (m & Comp.Building) {
      if (owner === player) buildings[e.buildingType[id]].push(id);
      continue;
    }
    if ((m & Comp.Unit) === 0) continue;
    const def = UNIT_DEFS[e.unitType[id] as UnitType];
    if (owner !== player) {
      if (owner !== 0 && def.pop > 0 && m & Comp.Position && visible[(e.y[id] >> FP_SHIFT) * w + (e.x[id] >> FP_SHIFT)]) enemies.push(id);
      continue;
    }
    if ((m & Comp.Position) === 0) continue; // guarecida
    if (m & Comp.Worker) {
      villagers.push(id);
      if (e.task[id] === Task.Build) builders.push(id);
      else if (e.task[id] === Task.Gather || e.task[id] === Task.Deliver) {
        const r = resourceOfNode(e.homeType[id]);
        if (r >= 0) gatherers[r].push(id);
      } else if (e.moveState[id] === MoveState.Idle && e.attackTarget[id] === 0) idle.push(id);
    } else if (def.monk) monks.push(id);
    else if (def.classes.includes('siege')) siege.push(id);
    else if (def.attack && def.pop > 0) army.push(id);
  }

  const tcs = buildings[BuildingType.TownCenter].filter((b) => e.built[b]);
  const home = tcs[0] ?? buildings.flat()[0] ?? 0;
  const homeX = home ? e.tileX[home] + (e.size[home] >> 1) : sim.grid.width >> 1;
  const homeY = home ? e.tileY[home] + (e.size[home] >> 1) : sim.grid.height >> 1;

  const own = buildings.flat().filter((b) => !BUILDING_DEFS[e.buildingType[b] as BuildingType].wall);
  const threats = enemies.filter((t) => {
    const tx = e.x[t] >> FP_SHIFT;
    const ty = e.y[t] >> FP_SHIFT;
    return own.some((b) => Math.abs(e.tileX[b] - tx) <= THREAT_RADIUS && Math.abs(e.tileY[b] - ty) <= THREAT_RADIUS);
  });

  return {
    sim,
    player,
    era: sim.players.era[player],
    minute: sim.tick / sim.tickRate / 60,
    villagers,
    idle,
    gatherers,
    builders,
    army,
    siege,
    monks,
    buildings,
    home,
    homeX,
    homeY,
    enemies,
    threats,
    room: Math.min(200, sim.players.popCap[player]) - sim.players.popUsed[player],
  };
}

/** Lo que la IA recuerda entre decisiones, respetando la niebla de guerra. */
export class AiMemory {
  /** Edificios enemigos vistos alguna vez (por id): dónde están y de qué tipo. */
  readonly enemyBuildings = new Map<number, { x: number; y: number; type: number; owner: number }>();
  /** Recuento (que se va olvidando) de las clases de unidades enemigas vistas. */
  readonly seen = new Map<UnitClass, number>();
  /** Dónde y cuándo se vio por última vez una unidad enemiga (punto fijo). */
  lastEnemy: { x: number; y: number; tick: number } | null = null;

  update(sim: Simulation, player: number, ctx: AiContext): void {
    const e = sim.entities;
    const vis = sim.visibility;
    for (const b of sim.buildingIds) {
      if (!e.isAlive(b) || e.owner[b] === player || e.owner[b] === 0) continue;
      const cx = e.tileX[b] + (e.size[b] >> 1);
      const cy = e.tileY[b] + (e.size[b] >> 1);
      if (vis.isVisible(player, cx, cy)) this.enemyBuildings.set(b, { x: cx, y: cy, type: e.buildingType[b], owner: e.owner[b] });
    }
    // Olvida los que ya no están (solo si se ve el sitio: la IA no sabe lo que pasa en la niebla).
    for (const [id, info] of this.enemyBuildings) {
      if (!vis.isVisible(player, info.x, info.y)) continue;
      if (!e.isAlive(id) || !e.has(id, Comp.Building) || e.owner[id] === player) this.enemyBuildings.delete(id);
    }
    for (const [k, v] of this.seen) this.seen.set(k, v * 0.97);
    if (ctx.enemies.length > 0) {
      const id = ctx.enemies[0];
      this.lastEnemy = { x: e.x[id], y: e.y[id], tick: sim.tick };
    }
    for (const id of ctx.enemies) {
      for (const c of UNIT_DEFS[e.unitType[id] as UnitType].classes) this.seen.set(c, (this.seen.get(c) ?? 0) + 1);
    }
  }

  /** Proporción (0–1) de una clase entre las unidades enemigas vistas. */
  share(c: UnitClass): number {
    let total = 0;
    for (const k of ['infantry', 'archer', 'cavalry', 'siege'] as UnitClass[]) total += this.seen.get(k) ?? 0;
    // 'spear' es una subclase de infantería: su proporción se mide sobre el mismo total.
    return total > 0 ? (this.seen.get(c) ?? 0) / total : 0;
  }
}
