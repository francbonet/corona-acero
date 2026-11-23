import { BUILDING_DEFS, BuildingType } from '../data/buildings';
import { ERA_DEFS } from '../data/eras';
import { Resource } from '../data/resources';
import { TECH_COUNT, TECH_DEFS, type TechType } from '../data/techs';
import { NodeType } from '../data/nodes';
import { UNIT_DEFS, type UnitType } from '../data/units';
import { FP_ONE, fixedToTile, tileCenterFixed } from '../engine/fixed';
import type { Command } from './commands';
import { Stance } from '../data/combat';
import { attackOf, garrisonCapacity, isAttackable, kill, meleeCapacity, ungarrisonAll } from './combat';
import { formationGoals, formationRank } from './formation';
import { Comp, Order } from './entities';
import { nearestPassableTiles } from './slots';
import type { Simulation } from './simulation';
import { stopUnit } from './systems/movement';
import { MAX_QUEUE } from './systems/production';
import { TECH_BASE, isTechItem, researchBlocker } from './tech';
import { clearTask, needsBuilder, setBuildTarget, setDeliverTarget, setGatherTarget } from './systems/workers';
import { buildTotal, canPlaceBuilding, createBuilding, hasBuilt, isDropsite, removeEntity } from './world';

/**
 * Aplica una orden. Toda orden se valida aquí (que las unidades sean del jugador, que pueda pagar…):
 * una orden inválida simplemente no hace nada, así un cliente tramposo o desfasado no rompe la partida.
 */
export function applyCommand(sim: Simulation, command: Command): void {
  switch (command.type) {
    case 'move': {
      const ids = owned(sim, command.player, command.units, Comp.Mover);
      for (const id of ids) resetOrder(sim, id, Order.Move);
      moveGroup(sim, ids, command.x, command.y, true);
      break;
    }
    case 'stop':
      for (const id of owned(sim, command.player, command.units, Comp.Mover)) {
        resetOrder(sim, id, Order.None);
        stopUnit(sim.entities, id);
        sim.entities.pathRequest[id] = 0;
        sim.entities.orderX[id] = sim.entities.x[id];
        sim.entities.orderY[id] = sim.entities.y[id];
      }
      break;
    case 'attack':
      attack(sim, command.player, command.units, command.target);
      break;
    case 'attackMove': {
      const ids = owned(sim, command.player, command.units, Comp.Mover);
      const x = Math.max(0, Math.min(sim.grid.width * FP_ONE - 1, command.x | 0));
      const y = Math.max(0, Math.min(sim.grid.height * FP_ONE - 1, command.y | 0));
      for (const id of ids) {
        resetOrder(sim, id, Order.AttackMove);
        sim.entities.orderX[id] = x;
        sim.entities.orderY[id] = y;
      }
      moveGroup(sim, ids, x, y, true);
      break;
    }
    case 'stance': {
      const stance = command.stance | 0;
      if (stance < Stance.Aggressive || stance > Stance.NoAttack) break;
      for (const id of owned(sim, command.player, command.units, Comp.Unit)) {
        sim.entities.stance[id] = stance;
        sim.entities.orderX[id] = sim.entities.x[id];
        sim.entities.orderY[id] = sim.entities.y[id];
        if (stance === Stance.NoAttack) sim.entities.attackTarget[id] = 0;
      }
      break;
    }
    case 'garrison': {
      const target = command.target;
      if (!isOwnBuilding(sim, command.player, target) || garrisonCapacity(sim, target) === 0) break;
      for (const id of owned(sim, command.player, command.units, Comp.Mover)) {
        resetOrder(sim, id, Order.Garrison);
        sim.entities.orderTarget[id] = target;
        sim.entities.taskFails[id] = 0;
      }
      break;
    }
    case 'ungarrison':
      for (const b of owned(sim, command.player, command.buildings, Comp.Building)) ungarrisonAll(sim, b);
      break;
    case 'gather':
      gather(sim, command.player, command.units, command.target);
      break;
    case 'deliver':
      deliver(sim, command.player, command.units, command.target);
      break;
    case 'build':
      build(sim, command.player, command.units, command.buildingType, command.tileX, command.tileY, command.queue);
      break;
    case 'construct':
      construct(sim, command.player, command.units, command.target, command.queue);
      break;
    case 'train':
      train(sim, command.player, command.building, command.unitType);
      break;
    case 'cancelTrain':
      cancelTrain(sim, command.player, command.building, command.index);
      break;
    case 'rally':
      rally(sim, command.player, command.buildings, command.x, command.y, command.target);
      break;
    case 'research':
      research(sim, command.player, command.building, command.tech);
      break;
    case 'market':
      market(sim, command.player, command.resource, command.buy);
      break;
    case 'trade':
      trade(sim, command.player, command.units, command.target);
      break;
    case 'demolish':
      for (const b of owned(sim, command.player, command.buildings, Comp.Building | Comp.Position)) demolish(sim, command.player, b);
      break;
    case 'resign':
      resign(sim, command.player);
      break;
    case 'debugSpawn': {
      const count = Math.max(0, Math.min(100, command.count | 0));
      if (UNIT_DEFS[command.unitType as UnitType] && sim.grid.inBounds(command.tileX, command.tileY)) {
        sim.spawnGroup(command.unitType as UnitType, command.player, command.tileX, command.tileY, count);
      }
      break;
    }
  }
}

/** Nueva orden: olvida el combate y la tarea anteriores. */
function resetOrder(sim: Simulation, id: number, order: Order): void {
  const e = sim.entities;
  if (e.mask[id] & Comp.Worker) clearTask(sim, id);
  e.order[id] = order;
  e.orderTarget[id] = 0;
  e.attackTarget[id] = 0;
  e.taskFails[id] = 0;
  e.speedCap[id] = 0;
}

/**
 * Ataque a un objetivo concreto. Un grupo no se echa entero encima de una sola unidad: van a por ella los más
 * cercanos que quepan a su alrededor (los demás tiradores, hasta unos cuantos), y el resto avanza hacia allí
 * atacando a los enemigos de al lado (ver el reparto de objetivos en el sistema de combate). Contra un edificio
 * caben más; los monjes y el asedio van siempre a por el objetivo que se les manda.
 */
function attack(sim: Simulation, player: number, units: readonly number[], target: number): void {
  const e = sim.entities;
  if (!Number.isInteger(target)) return;
  const valid = owned(sim, player, units, Comp.Unit).filter((id) => {
    const monk = UNIT_DEFS[e.unitType[id] as UnitType].monk === true;
    return (monk || attackOf(sim, id) !== null) && isAttackable(sim, id, target);
  });
  const d2 = (id: number) => {
    const dx = e.x[id] - e.x[target];
    const dy = e.y[id] - e.y[target];
    return dx * dx + dy * dy;
  };
  valid.sort((a, b) => d2(a) - d2(b) || a - b);
  const meleeCap = meleeCapacity(sim, target);
  const rangedCap = e.size[target] > 0 ? Infinity : RANGED_FOCUS;
  let melee = 0;
  let ranged = 0;
  const spill: number[] = [];
  for (const id of valid) {
    const def = UNIT_DEFS[e.unitType[id] as UnitType];
    const a = attackOf(sim, id);
    const focused = def.monk === true || def.classes.includes('siege') || !a || (a.range > 0 ? ranged++ < rangedCap : melee++ < meleeCap);
    if (!focused) {
      spill.push(id);
      continue;
    }
    resetOrder(sim, id, Order.Attack);
    e.orderTarget[id] = target;
    e.attackTarget[id] = target;
    stopUnit(e, id);
  }
  if (spill.length === 0) return;
  // Los que no caben: ataque-mover hacia el objetivo (cogerán a otro enemigo de al lado, o a él si no hay más).
  for (const id of spill) {
    resetOrder(sim, id, Order.AttackMove);
    e.orderX[id] = e.x[target];
    e.orderY[id] = e.y[target];
  }
  moveGroup(sim, spill, e.x[target], e.y[target]);
}

/** Tiradores que disparan a la vez a una misma unidad por una orden de ataque (los demás reparten el fuego). */
const RANGED_FOCUS = 6;

/** Entidades válidas de una orden: vivas, con los componentes pedidos y del jugador. Sin duplicados y en orden de id. */
function owned(sim: Simulation, player: number, ids: readonly number[], components: number): number[] {
  const e = sim.entities;
  return [...new Set(ids)]
    .filter((id) => Number.isInteger(id) && e.isAlive(id) && e.has(id, components) && e.owner[id] === player)
    .sort((a, b) => a - b);
}

function isOwnBuilding(sim: Simulation, player: number, id: number): boolean {
  const e = sim.entities;
  return Number.isInteger(id) && e.has(id, Comp.Building) && e.owner[id] === player;
}

/**
 * Mueve un grupo. Con `formation`, un grupo de soldados marcha en formación (cuerpo a cuerpo delante, tiradores
 * detrás) y al paso del más lento; si no, o si ya está casi allí, se reparte por las casillas libres alrededor.
 */
export function moveGroup(sim: Simulation, ids: readonly number[], rawX: number, rawY: number, formation = false): void {
  if (ids.length === 0) return;
  const e = sim.entities;
  const grid = sim.grid;
  const x = Math.max(0, Math.min(grid.width * FP_ONE - 1, rawX | 0));
  const y = Math.max(0, Math.min(grid.height * FP_ONE - 1, rawY | 0));
  const goals = formation ? formationGoals(sim, ids, x, y) : null;
  if (goals) {
    // El paso lo marca el soldado más lento; el asedio, los monjes y los aldeanos van detrás a su ritmo (si no,
    // todo el ejército iría a paso de ariete).
    let slowest = Infinity;
    for (const id of ids) if (formationRank(sim, id) < 2) slowest = Math.min(slowest, e.speed[id]);
    for (const g of goals) {
      e.goalX[g.id] = g.x;
      e.goalY[g.id] = g.y;
      e.repaths[g.id] = 0;
      sim.pathing.request(g.id);
      e.speedCap[g.id] = formationRank(sim, g.id) < 2 && e.speed[g.id] > slowest ? slowest : 0;
    }
    return;
  }
  const tx = fixedToTile(x);
  const ty = fixedToTile(y);

  const slots = nearestPassableTiles(grid, tx, ty, ids.length);
  if (slots.length === 0) return;
  // Las unidades más cercanas al destino ocupan los huecos más cercanos.
  const order = ids
    .map((id) => {
      const dx = e.x[id] - x;
      const dy = e.y[id] - y;
      return { id, d2: dx * dx + dy * dy };
    })
    .sort((a, b) => a.d2 - b.d2 || a.id - b.id);

  order.forEach(({ id }, k) => {
    const slot = slots[k % slots.length];
    const sx = slot % grid.width;
    const sy = Math.floor(slot / grid.width);
    // Una sola unidad va al punto exacto si se puede pisar; en grupo, cada una al centro de su hueco.
    const exact = ids.length === 1 && sx === tx && sy === ty;
    e.goalX[id] = exact ? x : tileCenterFixed(sx);
    e.goalY[id] = exact ? y : tileCenterFixed(sy);
    e.repaths[id] = 0;
    sim.pathing.request(id);
  });
}

function gather(sim: Simulation, player: number, units: readonly number[], target: number): void {
  const e = sim.entities;
  if (!Number.isInteger(target) || !e.has(target, Comp.Resource) || e.resAmount[target] <= 0) return;
  const type = e.nodeType[target];
  if (type === NodeType.Farm && (!isOwnBuilding(sim, player, target) || !e.built[target])) return;
  if (type === NodeType.Sheep && e.owner[target] !== player && e.owner[target] !== 0) return;
  for (const id of owned(sim, player, units, Comp.Worker)) {
    resetOrder(sim, id, Order.None);
    setGatherTarget(sim, id, target);
  }
}

function deliver(sim: Simulation, player: number, units: readonly number[], target: number): void {
  const e = sim.entities;
  for (const id of owned(sim, player, units, Comp.Worker)) {
    if (e.carryAmount[id] > 0 && isDropsite(sim, target, player, e.carryKind[id])) {
      e.order[id] = Order.None;
      e.attackTarget[id] = 0;
      setDeliverTarget(sim, id, target);
    }
  }
}

function build(
  sim: Simulation,
  player: number,
  units: readonly number[],
  rawType: number,
  tileX: number,
  tileY: number,
  queue: boolean,
): void {
  const type = rawType as BuildingType;
  const def = BUILDING_DEFS[type];
  if (!def || !Number.isInteger(tileX) || !Number.isInteger(tileY)) return;
  const workers = owned(sim, player, units, Comp.Worker);
  if (workers.length === 0) return;
  if (sim.players.era[player] < (def.era ?? 0)) return;
  if (def.requires !== undefined && !hasBuilt(sim, player, def.requires)) return;
  if (!canPlaceBuilding(sim, type, tileX, tileY)) return;
  if (!sim.players.pay(player, sim.stats.buildingCost(player, type))) return;
  const building = createBuilding(sim, type, player, tileX, tileY, false);
  for (const id of workers) {
    if (!queue) resetOrder(sim, id, Order.None);
    setBuildTarget(sim, id, building, queue);
  }
}

/** Construir unos cimientos propios o reparar un edificio propio dañado. */
function construct(sim: Simulation, player: number, units: readonly number[], target: number, queue: boolean): void {
  if (!isOwnBuilding(sim, player, target) || !needsBuilder(sim, target)) return;
  for (const id of owned(sim, player, units, Comp.Worker)) {
    if (!queue) resetOrder(sim, id, Order.None);
    setBuildTarget(sim, id, target, queue);
  }
}

/** Motivo por el que el jugador no puede entrenar ese tipo de unidad (o null). */
export function trainBlocker(sim: Simulation, player: number, base: UnitType): string | null {
  const def = UNIT_DEFS[sim.stats.trainedType(player, base)];
  const baseDef = UNIT_DEFS[base];
  const era = Math.min(baseDef.era ?? 0, def.era ?? 0);
  if (sim.players.era[player] < era) return `Requiere: ${ERA_DEFS[era].title}`;
  if (baseDef.requires !== undefined && !hasBuilt(sim, player, baseDef.requires as BuildingType)) {
    return `Requiere: ${BUILDING_DEFS[baseDef.requires as BuildingType].name}`;
  }
  return null;
}

function train(sim: Simulation, player: number, building: number, rawType: number): void {
  const e = sim.entities;
  const type = rawType as UnitType;
  if (!isOwnBuilding(sim, player, building) || !e.has(building, Comp.Producer) || !e.built[building]) return;
  if (!sim.stats.trainsFor(player, e.buildingType[building] as BuildingType).includes(type)) return;
  if (trainBlocker(sim, player, type)) return;
  const queue = (e.queue[building] ??= []);
  if (queue.length >= MAX_QUEUE) return;
  if (!sim.players.pay(player, sim.stats.unitCost(player, sim.stats.trainedType(player, type)))) return;
  queue.push(type);
}

function research(sim: Simulation, player: number, building: number, rawTech: number): void {
  const e = sim.entities;
  const tech = rawTech as TechType;
  const def = TECH_DEFS[tech];
  if (!def || !isOwnBuilding(sim, player, building) || !e.has(building, Comp.Producer) || !e.built[building]) return;
  if (def.building !== e.buildingType[building] || researchBlocker(sim, player, tech)) return;
  const queue = (e.queue[building] ??= []);
  if (queue.length >= MAX_QUEUE) return;
  if (!sim.players.pay(player, def.cost)) return;
  queue.push(TECH_BASE + tech);
  sim.players.researching[player * TECH_COUNT + tech] = 1;
}

function cancelTrain(sim: Simulation, player: number, building: number, index: number): void {
  const e = sim.entities;
  if (!isOwnBuilding(sim, player, building)) return;
  const queue = e.queue[building];
  if (!queue || !Number.isInteger(index) || index < 0 || index >= queue.length) return;
  const [item] = queue.splice(index, 1);
  if (isTechItem(item)) {
    const tech = (item - TECH_BASE) as TechType;
    sim.players.refund(player, TECH_DEFS[tech].cost);
    sim.players.researching[player * TECH_COUNT + tech] = 0;
  } else {
    sim.players.refund(player, sim.stats.unitCost(player, sim.stats.trainedType(player, item as UnitType)));
  }
  if (index === 0) {
    e.trainProgress[building] = 0;
    e.trainStarted[building] = 0;
  }
}

/** Precio que sube o baja en cada compra o venta. */
const MARKET_STEP = 5;
const MARKET_MIN = 20;
const MARKET_MAX = 600;

/** Compra o vende 100 unidades de comida, madera o piedra a cambio de oro. */
function market(sim: Simulation, player: number, resource: number, buy: boolean): void {
  if (!Number.isInteger(resource) || resource < 0 || resource > 2 || !hasBuilt(sim, player, BuildingType.Market)) return;
  const players = sim.players;
  const i = player * 3 + resource;
  const price = players.prices[i];
  const r = resource as Resource;
  if (buy) {
    if (players.get(player, Resource.Gold) < price) return;
    players.add(player, Resource.Gold, -price);
    players.add(player, r, 100);
    players.prices[i] = Math.min(MARKET_MAX, price + MARKET_STEP);
  } else {
    if (players.get(player, r) < 100) return;
    players.add(player, r, -100);
    players.add(player, Resource.Gold, Math.floor((price * sim.stats.sellPct(player)) / 100));
    players.prices[i] = Math.max(MARKET_MIN, price - MARKET_STEP);
  }
}

/**
 * Derriba un edificio propio. Se devuelve lo que hubiera en su cola, y en unos cimientos, la parte del coste que
 * aún no se ha gastado en la obra. Lo construido no se recupera.
 */
function demolish(sim: Simulation, player: number, building: number): void {
  const e = sim.entities;
  const queue = e.queue[building] ?? [];
  while (queue.length > 0) cancelTrain(sim, player, building, queue.length - 1);
  if (!e.built[building]) {
    const type = e.buildingType[building] as BuildingType;
    const total = buildTotal(sim, type);
    const left = Math.max(0, total - e.buildProgress[building]);
    const price = sim.stats.buildingCost(player, type);
    sim.players.refund(player, price.map((c) => Math.floor((c * left) / total)) as unknown as typeof price);
  }
  kill(sim, building);
}

/** Rendición: derrotado al momento; sus edificios caen y sus unidades se retiran del mapa. */
function resign(sim: Simulation, player: number): void {
  const players = sim.players;
  if (!Number.isInteger(player) || player < 1 || !players.active[player] || players.defeated[player]) return;
  players.defeated[player] = 1;
  sim.emit({ kind: 'defeat', player, resigned: true });
  const e = sim.entities;
  // Recorre todos los ids (los índices por tipo se rehacen después de aplicar las órdenes).
  for (let id = 1; id < e.highWater; id++) {
    if (e.isAlive(id) && e.owner[id] === player && (e.mask[id] & Comp.Building) !== 0) kill(sim, id);
  }
  for (let id = 1; id < e.highWater; id++) {
    if (e.isAlive(id) && e.owner[id] === player && (e.mask[id] & Comp.Unit) !== 0) removeEntity(sim, id);
  }
}

/** Manda carros de comercio a ir y venir entre su mercado de origen y `target`. */
function trade(sim: Simulation, player: number, units: readonly number[], target: number): void {
  const e = sim.entities;
  if (!isOwnBuilding(sim, player, target) || e.buildingType[target] !== BuildingType.Market || !e.built[target]) return;
  for (const id of owned(sim, player, units, Comp.Mover)) {
    if (!UNIT_DEFS[e.unitType[id] as UnitType].trader) continue;
    resetOrder(sim, id, Order.Trade);
    e.orderTarget[id] = target;
    // Mercado de origen: el más cercano que no sea el destino.
    if (!e.isAlive(e.homeNode[id]) || e.homeNode[id] === target || e.buildingType[e.homeNode[id]] !== BuildingType.Market) {
      e.homeNode[id] = nearestMarket(sim, player, e.x[id], e.y[id], target);
    }
  }
}

function nearestMarket(sim: Simulation, player: number, x: number, y: number, exclude: number): number {
  const e = sim.entities;
  let best = 0;
  let bestD = Infinity;
  for (const b of sim.buildingIds) {
    if (b === exclude || !e.isAlive(b) || e.owner[b] !== player || e.buildingType[b] !== BuildingType.Market || !e.built[b]) continue;
    const dx = e.x[b] - x;
    const dy = e.y[b] - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

function rally(sim: Simulation, player: number, buildings: readonly number[], x: number, y: number, target: number): void {
  const e = sim.entities;
  const grid = sim.grid;
  const validTarget =
    Number.isInteger(target) &&
    e.isAlive(target) &&
    (e.has(target, Comp.Resource) || (e.has(target, Comp.Building) && e.owner[target] === player));
  for (const id of owned(sim, player, buildings, Comp.Building | Comp.Producer)) {
    e.hasRally[id] = 1;
    e.rallyX[id] = Math.max(0, Math.min(grid.width * FP_ONE - 1, x | 0));
    e.rallyY[id] = Math.max(0, Math.min(grid.height * FP_ONE - 1, y | 0));
    e.rallyTarget[id] = validTarget ? target : 0;
  }
}
