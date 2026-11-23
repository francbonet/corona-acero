import { type Cost, POP_LIMIT, RESOURCE_COUNT, type Resource } from '../data/resources';
import { TECH_COUNT } from '../data/techs';

/** Precio inicial en el mercado, en oro por cada 100 unidades. */
export const MARKET_START_PRICE = 100;

/** Jugadores posibles: 0 = Gaia (naturaleza) y 1..8. */
export const MAX_PLAYERS = 9;

/** Recursos y población de cada jugador. */
export class Players {
  /** stock[jugador * 4 + recurso] */
  readonly stock = new Int32Array(MAX_PLAYERS * RESOURCE_COUNT);
  /** Población ocupada (unidades vivas + las que se están entrenando). */
  readonly popUsed = new Int32Array(MAX_PLAYERS);
  /** Población máxima (casas, centro de la villa…), con tope POP_LIMIT. */
  readonly popCap = new Int32Array(MAX_PLAYERS);
  readonly faction = new Uint8Array(MAX_PLAYERS);
  /** Era actual (0 = Señorío). */
  readonly era = new Uint8Array(MAX_PLAYERS);
  /** researched[jugador * TECH_COUNT + tecnología] */
  readonly researched = new Uint8Array(MAX_PLAYERS * TECH_COUNT);
  /** En cola o investigándose (para no repetirla en dos edificios). */
  readonly researching = new Uint8Array(MAX_PLAYERS * TECH_COUNT);
  /** Precio en el mercado de comida, madera y piedra (oro por 100 unidades). */
  readonly prices = new Int32Array(MAX_PLAYERS * 3).fill(MARKET_START_PRICE);
  /** Jugadores que participan en la partida. */
  readonly active = new Uint8Array(MAX_PLAYERS);
  readonly defeated = new Uint8Array(MAX_PLAYERS);
  /** Bonus de recolección en % (dificultad de la IA). */
  readonly gatherBonus = new Int16Array(MAX_PLAYERS);
  /** Ticks que lleva en pie la Catedral terminada de cada jugador (0 = no tiene). */
  readonly wonderTicks = new Int32Array(MAX_PLAYERS);

  hasTech(player: number, tech: number): boolean {
    return this.researched[player * TECH_COUNT + tech] === 1;
  }

  /**
   * Partidas guardadas cuando había menos tecnologías: rehace las tablas por jugador con el número actual (las
   * nuevas quedan sin investigar). Se llama al restaurar una partida.
   */
  fitTechCount(): void {
    const old = this.researched.length / MAX_PLAYERS;
    if (old === TECH_COUNT) return;
    const self = this as unknown as Record<'researched' | 'researching', Uint8Array>;
    for (const key of ['researched', 'researching'] as const) {
      const from = self[key];
      const to = new Uint8Array(MAX_PLAYERS * TECH_COUNT);
      for (let p = 0; p < MAX_PLAYERS; p++) to.set(from.subarray(p * old, p * old + Math.min(old, TECH_COUNT)), p * TECH_COUNT);
      self[key] = to;
    }
  }

  isResearching(player: number, tech: number): boolean {
    return this.researching[player * TECH_COUNT + tech] === 1;
  }

  get(player: number, resource: Resource): number {
    return this.stock[player * RESOURCE_COUNT + resource];
  }

  add(player: number, resource: Resource, amount: number): void {
    this.stock[player * RESOURCE_COUNT + resource] += amount;
  }

  set(player: number, cost: Cost): void {
    for (let r = 0; r < RESOURCE_COUNT; r++) this.stock[player * RESOURCE_COUNT + r] = cost[r];
  }

  canAfford(player: number, cost: Cost): boolean {
    for (let r = 0; r < RESOURCE_COUNT; r++) if (this.stock[player * RESOURCE_COUNT + r] < cost[r]) return false;
    return true;
  }

  /** Cobra si puede; devuelve si se cobró. */
  pay(player: number, cost: Cost): boolean {
    if (!this.canAfford(player, cost)) return false;
    for (let r = 0; r < RESOURCE_COUNT; r++) this.stock[player * RESOURCE_COUNT + r] -= cost[r];
    return true;
  }

  refund(player: number, cost: Cost): void {
    for (let r = 0; r < RESOURCE_COUNT; r++) this.stock[player * RESOURCE_COUNT + r] += cost[r];
  }

  /** Hay hueco para `pop` más. */
  hasRoom(player: number, pop: number): boolean {
    return this.popUsed[player] + pop <= Math.min(POP_LIMIT, this.popCap[player]);
  }
}
