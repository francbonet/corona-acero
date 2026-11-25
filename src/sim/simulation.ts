import type { BuildingType } from '../data/buildings';
import { NodeType } from '../data/nodes';
import { STARTING_STOCK } from '../data/resources';
import { UNIT_DEFS, type UnitType } from '../data/units';
import { tileCenterFixed } from '../engine/fixed';
import { Fnv32 } from '../engine/hash';
import { Rng } from '../engine/rng';
import type { GameMap } from '../map/game-map';
import { Deposit, TreeKind } from '../map/terrain';
import type { Projectile } from './combat';
import type { SimEvent } from './events';
import { type Command, CommandQueue, type ScheduledCommand } from './commands';
import { Comp, Entities } from './entities';
import { applyCommand } from './orders';
import { PathGrid } from './path-grid';
import { MAX_PLAYERS, Players } from './players';
import { nearestPassableTiles } from './slots';
import { SpatialHash } from './spatial-hash';
import { runCombat } from './systems/combat';
import { applyConstruction } from './systems/construction';
import { moveUnits, resolveStuck, separateUnits } from './systems/movement';
import { PathingSystem } from './systems/pathing';
import { runProduction } from './systems/production';
import { runTrade } from './systems/trade';
import { checkVictory } from './systems/victory';
import { runWorkers } from './systems/workers';
import { StatsCache } from './stats';
import { VISION_EVERY, Visibility } from './visibility';
import { createBuilding, createNode, indexEntities, spawnUnit } from './world';

/**
 * Jugador automático (IA) que corre dentro de la simulación: cada `interval` ticks lee el estado y emite
 * órdenes con `schedule`, igual que un jugador. Como va dentro del paso y usa su propio PRNG con semilla,
 * la partida sigue siendo determinista (y reproducible con semilla + órdenes humanas).
 */
export interface Controller {
  readonly player: number;
  readonly interval: number;
  think(sim: Simulation): void;
}

export interface SimulationOptions {
  map: GameMap;
  seed: number;
  /** Ticks por segundo: convierte los segundos y velocidades de los datos a ticks. */
  tickRate: number;
  capacity?: number;
  /** Crear árboles y yacimientos del mapa como entidades (por defecto sí). */
  spawnNodes?: boolean;
}

/**
 * Estado de la partida y avance tick a tick. No sabe nada de Pixi ni del DOM: puede correr en Node,
 * en un Web Worker o en varios clientes a la vez (lockstep), y con las mismas órdenes da el mismo resultado.
 */
export class Simulation {
  readonly map: GameMap;
  readonly grid: PathGrid;
  readonly entities: Entities;
  readonly players = new Players();
  readonly rng: Rng;
  readonly tickRate: number;
  readonly pathing: PathingSystem;
  readonly spatial: SpatialHash;
  /** Registro de órdenes aplicadas: semilla + registro = repetición de la partida. */
  readonly log: ScheduledCommand[] = [];
  /** Buffers de trabajo para los sistemas (no forman parte del estado). */
  readonly scratchA: Int32Array;
  readonly scratchB: Int32Array;
  readonly stats: StatsCache;
  readonly projectiles: Projectile[] = [];
  /** Jugadores automáticos. */
  readonly controllers: Controller[] = [];
  /** Ganador de la partida (0 = aún nadie) y cómo ganó. */
  winner = 0;
  winReason: 'conquest' | 'wonder' | '' = '';
  readonly visibility: Visibility;
  /** Índices del tick (se rehacen en cada paso). */
  readonly unitIds: number[] = [];
  readonly buildingIds: number[] = [];
  readonly garrisonCount = new Map<number, number>();
  /** Sucesos para el render (muertes, golpes); el render los vacía con `drainEvents`. */
  private events: SimEvent[] = [];

  private currentTick = 0;
  private readonly commands = new CommandQueue();
  /** Constructores al alcance de cada obra en este tick. */
  private builders = new Map<number, number>();

  constructor(options: SimulationOptions) {
    this.map = options.map;
    this.tickRate = options.tickRate;
    this.grid = PathGrid.fromMap(options.map);
    this.entities = new Entities(options.capacity);
    this.rng = new Rng(options.seed);
    this.spatial = new SpatialHash(this.grid.width, this.grid.height, this.entities.capacity);
    this.scratchA = new Int32Array(this.entities.capacity);
    this.scratchB = new Int32Array(this.entities.capacity);
    this.pathing = new PathingSystem(this);
    this.stats = new StatsCache(this);
    this.visibility = new Visibility(this.grid.width, this.grid.height);
    for (let p = 1; p < MAX_PLAYERS; p++) this.players.set(p, STARTING_STOCK);
    if (options.spawnNodes !== false) this.spawnMapNodes();
    this.visibility.update(this);
  }

  /** Próximo tick que se va a ejecutar (= ticks ejecutados hasta ahora). */
  get tick(): number {
    return this.currentTick;
  }

  /** Programa una orden. Por defecto, para el próximo tick. */
  schedule(command: Command, tick = this.currentTick): void {
    this.commands.schedule(Math.max(tick, this.currentTick), command);
  }

  step(): void {
    const e = this.entities;
    for (let id = 1; id < e.highWater; id++) {
      if ((e.mask[id] & Comp.Position) === 0) continue;
      e.prevX[id] = e.x[id];
      e.prevY[id] = e.y[id];
    }
    for (const c of this.controllers) {
      if (this.currentTick % c.interval === c.player % c.interval && !this.players.defeated[c.player]) c.think(this);
    }
    for (const command of this.commands.take(this.currentTick)) {
      this.log.push({ tick: this.currentTick, command });
      applyCommand(this, command);
    }
    indexEntities(this);
    runWorkers(this);
    runCombat(this);
    runTrade(this);
    applyConstruction(this);
    runProduction(this);
    this.pathing.process();
    moveUnits(this);
    separateUnits(this);
    resolveStuck(this);
    if (this.currentTick % VISION_EVERY === 0) this.visibility.update(this);
    checkVictory(this);
    this.currentTick++;
  }

  /** Da de alta a un jugador en la partida con su facción (antes de crear sus unidades). */
  addPlayer(player: number, faction: number): void {
    this.players.active[player] = 1;
    this.players.faction[player] = faction;
    this.stats.invalidate(player);
  }

  addController(controller: Controller): void {
    this.controllers.push(controller);
  }

  declareWinner(player: number, reason: 'conquest' | 'wonder'): void {
    if (this.winner !== 0) return;
    this.winner = player;
    this.winReason = reason;
    this.emit({ kind: 'victory', player, reason });
  }

  /** Ticks que tarda en montarse o desmontarse un asedio. */
  deployTicks(unitType: number): number {
    return Math.max(1, Math.round((UNIT_DEFS[unitType as UnitType].deployTime ?? 0) * this.tickRate));
  }

  emit(event: SimEvent): void {
    this.events.push(event);
    if (this.events.length > 2000) this.events.splice(0, this.events.length - 2000);
  }

  /** Sucesos desde la última llamada. */
  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  // ── API para escenarios, pruebas y sistemas ──

  spawnUnit(type: UnitType, owner: number, x: number, y: number): number {
    return spawnUnit(this, type, owner, x, y);
  }

  /** Crea `count` unidades repartidas por las casillas libres más cercanas a (tx, ty). Devuelve sus ids. */
  spawnGroup(type: UnitType, owner: number, tx: number, ty: number, count: number): number[] {
    return nearestPassableTiles(this.grid, tx, ty, count).map((i) =>
      spawnUnit(this, type, owner, tileCenterFixed(i % this.grid.width), tileCenterFixed(Math.floor(i / this.grid.width))),
    );
  }

  /** Coloca un edificio ya terminado (escenarios). */
  placeBuilding(type: BuildingType, owner: number, tileX: number, tileY: number): number {
    return createBuilding(this, type, owner, tileX, tileY, true);
  }

  /** Un aldeano trabaja en la obra este tick. */
  addBuilder(building: number): void {
    this.builders.set(building, (this.builders.get(building) ?? 0) + 1);
  }

  /** Obras con constructores en este tick, en el orden en que se apuntaron (determinista). */
  takeBuilders(): Map<number, number> {
    const out = this.builders;
    this.builders = new Map();
    return out;
  }

  /** Hash del estado: dos simulaciones con la misma semilla y las mismas órdenes deben dar siempre el mismo valor. */
  stateHash(): number {
    const e = this.entities;
    const h = new Fnv32().add(this.currentTick).add(e.highWater).add(this.rng.getState()).add(this.pathing.requestCounter);
    for (const v of this.players.stock) h.add(v);
    for (const v of this.players.era) h.add(v);
    for (const v of this.players.researched) h.add(v);
    h.add(this.winner);
    for (let id = 1; id < e.highWater; id++) {
      if (e.mask[id] === 0) continue;
      h.add(id).add(e.generation[id]).add(e.mask[id]).add(e.x[id]).add(e.y[id]).add(e.owner[id]).add(e.hp[id]);
      h.add(e.moveState[id]).add(e.goalX[id]).add(e.goalY[id]).add(e.pathIndex[id]);
      h.add(e.task[id]).add(e.taskTarget[id]).add(e.carryAmount[id]).add(e.resAmount[id]);
      h.add(e.buildProgress[id]).add(e.trainProgress[id]).add(e.queue[id]?.length ?? 0);
      h.add(e.attackTarget[id]).add(e.attackCooldown[id]).add(e.order[id]).add(e.garrisonedIn[id]).add(e.stance[id]);
    }
    for (const p of this.projectiles) h.add(p.target).add(p.ticks).add(p.total).add(p.damage);
    return h.digest();
  }

  /** Árboles y yacimientos del mapa → entidades, en orden de casilla (determinista). */
  private spawnMapNodes(): void {
    const map = this.map;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tree = map.treeAt(x, y);
        if (tree !== TreeKind.None) {
          createNode(this, NodeType.Tree, x, y, tree);
          continue;
        }
        const deposit = map.depositAt(x, y);
        if (deposit === Deposit.Berries) createNode(this, NodeType.Berries, x, y);
        else if (deposit === Deposit.Gold) createNode(this, NodeType.Gold, x, y);
        else if (deposit === Deposit.Stone) createNode(this, NodeType.Stone, x, y);
      }
    }
    for (const a of map.animals) spawnUnit(this, a.type as UnitType, 0, tileCenterFixed(a.x), tileCenterFixed(a.y));
  }
}

