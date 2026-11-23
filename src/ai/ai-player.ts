import { BuildingType } from '../data/buildings';
import type { Faction } from '../data/factions';
import { UnitType } from '../data/units';
import { Rng } from '../engine/rng';
import type { Command } from '../sim/commands';
import type { Controller, Simulation } from '../sim/simulation';
import { AiMemory, type AiContext, buildContext } from './context';
import { DIFFICULTY_DEFS, Difficulty, type DifficultyDef } from './difficulty';
import { runEconomy } from './economy';
import { LORDS, type Lord } from './lords';
import { runMilitary } from './military';
import { STRATEGIES, type Strategy } from './strategies';

export interface AiOptions {
  readonly difficulty?: Difficulty;
  /** Clave de estrategia; si no se da, se elige al azar (con el PRNG de la IA) entre las de su facción. */
  readonly strategy?: string;
  /** Señores que ya llevan otras IA de la partida (para no repetir nombre). */
  readonly avoidLords?: readonly string[];
}

/**
 * Jugador automático. Solo lee la simulación (lo propio y lo que ve a través de la niebla) y solo actúa
 * con órdenes, igual que un jugador humano. Corre dentro del paso de la simulación con su propio PRNG,
 * así que es determinista.
 */
export class AiPlayer implements Controller {
  readonly interval: number;
  readonly rng: Rng;
  readonly diff: DifficultyDef;
  readonly difficulty: Difficulty;
  readonly strategy: Strategy;
  readonly lord: Lord;
  readonly memory = new AiMemory();
  /** Decisiones tomadas (sirve para repartir tareas cada cierto número de decisiones). */
  thinks = 0;
  /** Ahorrando comida para avanzar de era: no entrena. */
  hold = false;
  /** Aldeanos ya usados en esta decisión (para no darles dos órdenes). */
  readonly reserved = new Set<number>();
  attackState: 'gather' | 'attack' = 'gather';
  alarm = false;
  lastThreat = 0;
  /** Último tick con soldados enemigos junto al centro de la villa (para tocar a rebato y dar el fin de la alarma). */
  lastDanger = 0;
  waypoints: [number, number][] = [];
  wpIndex = 0;
  /** Siguiente punto que explora el ejército cuando no sabe dónde está el enemigo. */
  armyWp = 0;
  /** Rejilla que recorre el ejército buscando al enemigo cuando no sabe dónde está. */
  huntPoints: [number, number][] = [];
  explorer = 0;
  readonly rallied = new Set<number>();
  resigned = false;

  constructor(
    private readonly sim: Simulation,
    readonly player: number,
    options: AiOptions = {},
  ) {
    this.difficulty = options.difficulty ?? Difficulty.Medium;
    this.diff = DIFFICULTY_DEFS[this.difficulty];
    this.interval = Math.max(1, Math.round(this.diff.thinkEvery * sim.tickRate));
    this.rng = new Rng((sim.rng.getState() ^ Math.imul(player + 1, 0x9e3779b1)) | 0);
    const faction = sim.players.faction[player] as Faction;
    const options2 = STRATEGIES[faction];
    this.strategy = options2.find((s) => s.key === options.strategy) ?? options2[this.rng.nextInt(options2.length)];
    const free = LORDS[faction].filter((l) => !options.avoidLords?.includes(l.name));
    const lords = free.length > 0 ? free : LORDS[faction];
    this.lord = lords[this.rng.nextInt(lords.length)];
    sim.players.gatherBonus[player] = this.diff.gatherBonus;
    sim.stats.invalidate(player);
  }

  think(sim: Simulation): void {
    if (sim.players.defeated[this.player] || this.resigned) return;
    const ctx = buildContext(sim, this.player);
    if (this.hopeless(ctx)) {
      this.resigned = true;
      this.send({ type: 'resign', player: this.player });
      return;
    }
    this.memory.update(sim, this.player, ctx);
    this.reserved.clear();
    runEconomy(this, ctx);
    runMilitary(this, ctx);
    this.thinks++;
  }

  /** Sin aldeanos, sin forma de hacer más y casi sin ejército: no queda nada que defender. */
  private hopeless(ctx: AiContext): boolean {
    const sim = this.sim;
    if (ctx.villagers.length > 0 || ctx.army.length + ctx.siege.length >= 5) return false;
    const cost = sim.stats.unitCost(this.player, UnitType.Villager);
    return !ctx.buildings[BuildingType.TownCenter].some((b) => sim.entities.built[b]) || !sim.players.canAfford(this.player, cost);
  }

  send(command: Command): void {
    this.sim.schedule(command);
  }

  /** Un aldeano para construir: uno ocioso, o si no un leñador, o un recolector de comida. */
  takeWorker(ctx: AiContext): number {
    const pick = (list: number[]) => {
      for (let i = list.length - 1; i >= 0; i--) {
        const v = list[i];
        if (this.reserved.has(v)) continue;
        list.splice(i, 1);
        this.reserved.add(v);
        return v;
      }
      return 0;
    };
    return pick(ctx.idle) || pick(ctx.gatherers[1]) || pick(ctx.gatherers[3]) || pick(ctx.gatherers[0]);
  }

  /** Coloca unos cimientos en `spot` con un aldeano. Devuelve si lo intentó (había recursos y alguien). */
  build(ctx: AiContext, type: BuildingType, spot: [number, number]): boolean {
    if (!this.sim.players.canAfford(this.player, this.sim.stats.buildingCost(this.player, type))) return false;
    const v = this.takeWorker(ctx);
    if (!v) return false;
    this.send({ type: 'build', player: this.player, units: [v], buildingType: type, tileX: spot[0], tileY: spot[1], queue: false });
    return true;
  }
}
