import { BUILDING_DEFS, BuildingType } from '../data/buildings';
import { STANCE_NAMES, Stance } from '../data/combat';
import { ERA_DEFS } from '../data/eras';
import { TECH_DEFS, type TechType } from '../data/techs';
import { NODE_DEFS, NodeType } from '../data/nodes';
import { type Cost, RESOURCE_NAMES, Resource, cost as makeCost } from '../data/resources';
import { UNIT_DEFS, type UnitType } from '../data/units';
import { attackOf, garrisonCapacity, isAttackable, isHostile } from '../sim/combat';
import type { Command } from '../sim/commands';
import type { SimEvent } from '../sim/events';
import { trainBlocker } from '../sim/orders';
import { researchBlocker, techsAt } from '../sim/tech';
import { Comp, MoveState, Task } from '../sim/entities';
import type { Simulation } from '../sim/simulation';
import { MAX_QUEUE } from '../sim/systems/production';
import { needsBuilder } from '../sim/systems/workers';
import { canPlaceBuilding, hasBuilt, isDropsite } from '../sim/world';
import type { Feedback } from '../audio/director';
import type { PickTarget } from './picking';
import type { Selection } from './selection';

/** Teclas de la rejilla de órdenes (4 × 3), por `KeyboardEvent.code`. */
export const HOTKEY_CODES = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyZ', 'KeyX', 'KeyC', 'KeyV'] as const;
export const HOTKEY_LABELS = ['Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F', 'Z', 'X', 'C', 'V'] as const;
export const SLOT_COUNT = HOTKEY_CODES.length;
const STOP_SLOT = 11;
const BELL_SLOT = 10;
const UNGARRISON_SLOT = 11;
/** Radio (casillas) en el que el toque a rebato llama a los aldeanos. */
const BELL_RADIUS = 14;

/** Edificios del aldeano, en dos páginas de la rejilla (como en los RTS clásicos: Q económicos, W militares). */
const ECONOMIC_BUILDINGS: readonly BuildingType[] = [
  BuildingType.House,
  BuildingType.Mill,
  BuildingType.LumberCamp,
  BuildingType.MiningCamp,
  BuildingType.Farm,
  BuildingType.Market,
  BuildingType.Blacksmith,
  BuildingType.University,
  BuildingType.Monastery,
  BuildingType.TownCenter,
  BuildingType.Cathedral,
];
const MILITARY_BUILDINGS: readonly BuildingType[] = [
  BuildingType.Barracks,
  BuildingType.ArcheryRange,
  BuildingType.Stable,
  BuildingType.SiegeWorkshop,
  BuildingType.Palisade,
  BuildingType.StoneWall,
  BuildingType.Gate,
  BuildingType.WatchTower,
  BuildingType.Castle,
  BuildingType.Foundry,
];
const BACK_SLOT = 11;
/** Casillas del mercado: compra (Q W E), venta (A S D), carro (Z) y tecnologías (X C). */
const MARKET_TRADE_SLOT = 8;

/** Posturas en la fila central del panel militar (A S D F). */
const STANCE_SLOTS: readonly Stance[] = [Stance.Aggressive, Stance.Defensive, Stance.StandGround, Stance.NoAttack];
const STANCE_DESCRIPTIONS: Readonly<Record<Stance, string>> = {
  [Stance.Aggressive]: 'Ataca a los enemigos que vea y los persigue.',
  [Stance.Defensive]: 'Ataca a los enemigos que vea sin alejarse mucho de su sitio.',
  [Stance.StandGround]: 'Solo ataca lo que tenga al alcance; no se mueve.',
  [Stance.NoAttack]: 'No ataca por su cuenta.',
};

export type Mode =
  | { readonly kind: 'normal' }
  | { readonly kind: 'place'; readonly building: BuildingType }
  | { readonly kind: 'attackMove' }
  /** Elegir con un clic el edificio que han de reparar los aldeanos seleccionados. */
  | { readonly kind: 'repair' };

export type ActionIcon = 'stop' | 'attackMove' | 'ungarrison' | 'bell' | 'back' | 'repair' | 'demolish' | `stance${Stance}`;

/** El botón de derribar del edificio seleccionado. */
export interface DemolishView {
  readonly label: string;
  readonly title: string;
  /** Ya se ha pulsado una vez: la siguiente lo derriba. */
  readonly armed: boolean;
}

export type IconRef =
  | { readonly kind: 'unit'; readonly type: UnitType }
  | { readonly kind: 'building'; readonly type: BuildingType }
  | { readonly kind: 'tech'; readonly tech: TechType }
  | { readonly kind: 'market'; readonly resource: number; readonly buy: boolean }
  | { readonly kind: 'page'; readonly page: 1 | 2 }
  | { readonly kind: 'action'; readonly action: ActionIcon };

export interface CommandButton {
  readonly slot: number;
  readonly hotkey: string;
  readonly label: string;
  readonly description: string;
  readonly icon: IconRef;
  readonly cost?: Cost;
  readonly enabled: boolean;
  /** Por qué no se puede usar ahora. */
  readonly reason?: string;
  /** Opción activa (la postura actual). */
  readonly active?: boolean;
  /** Texto corto sobre el icono (p. ej. "+100" en el mercado). */
  readonly badge?: string;
}

/** Cursor que corresponde a lo que hay bajo el ratón (lo que haría un clic derecho). */
export type CursorKind = 'hand' | 'sword' | 'axe' | 'pick' | 'sickle' | 'hammer';

/** Qué ha pasado tras un clic derecho, para dar respuesta visual. */
export type RightClickResult = 'move' | 'work' | 'attack' | 'rally' | 'none';

const NOTICE_MS = 3000;
/** Tiempo para confirmar el derribo con una segunda pulsación. */
const DEMOLISH_CONFIRM_MS = 3000;
const DEMOLISH_NOTICE = 'Vuelve a pulsar para derribar';
const REPAIR_SLOT = 2;
/** Segundos de juego entre dos avisos de "¡Nos atacan!". */
const ATTACK_NOTICE_SECONDS = 20;

/** Un rival en la partida (para el HUD y los avisos). */
export interface RivalInfo {
  readonly player: number;
  /** Nombre del señor que lo dirige, p. ej. "Eduardo III de Windsor". */
  readonly name: string;
  /** Facción y dificultad, p. ej. "Inglaterra · Media". */
  readonly detail: string;
}

/**
 * Lógica del jugador local entre la entrada (ratón, teclado, HUD) y la simulación:
 * qué botones hay, qué hace un clic derecho según lo que haya debajo, colocación de edificios y avisos.
 * Solo lee la simulación; todo cambio sale como orden por `send`.
 */
export class GameClient {
  mode: Mode = { kind: 'normal' };
  /** Ver todo el mapa (depuración). */
  revealAll = false;
  private readonly notices: { text: string; until: number }[] = [];
  private lastIdle = 0;
  /** Grupos de control 1–9. */
  private readonly groups: number[][] = Array.from({ length: 10 }, () => []);
  /** Página de edificios del aldeano (0 = raíz, 1 = económicos, 2 = militares). */
  private buildPage: 0 | 1 | 2 = 0;
  private selectionKey = '';
  /** El jugador ya ha cerrado la pantalla de fin de partida. */
  gameOverDismissed = false;
  /** Rivales con nombre (los demás se llaman "el jugador N"). */
  readonly rivals: RivalInfo[] = [];
  /** Respuestas para el audio (voces, clics), que se recogen cada fotograma. */
  private readonly feedback: Feedback[] = [];
  private voiceKey = '';
  /** Último ataque recibido (punto fijo) y cuándo se avisó. */
  lastAttack: { x: number; y: number } | null = null;
  private lastAttackNotice = -Infinity;
  /** Edificio que se derriba si se vuelve a pulsar antes de `until`. */
  private demolishArmed: { id: number; until: number } | null = null;

  constructor(
    readonly sim: Simulation,
    readonly selection: Selection,
    readonly player: number,
    private readonly send: (command: Command) => void,
    private readonly now: () => number = () => performance.now(),
  ) {}

  // ── Selección ──

  /** Unidades propias seleccionadas. */
  ownUnits(): number[] {
    const e = this.sim.entities;
    return this.selection.values().filter((id) => e.has(id, Comp.Unit) && e.owner[id] === this.player);
  }

  workers(): number[] {
    const e = this.sim.entities;
    return this.ownUnits().filter((id) => e.has(id, Comp.Worker));
  }

  /** El edificio seleccionado, si la selección es un único edificio. */
  selectedBuilding(): number {
    const ids = this.selection.values();
    return ids.length === 1 && this.sim.entities.has(ids[0], Comp.Building) ? ids[0] : 0;
  }

  // ── Panel de órdenes ──

  commandButtons(): (CommandButton | null)[] {
    const slots: (CommandButton | null)[] = new Array(SLOT_COUNT).fill(null);
    const e = this.sim.entities;
    const P = this.player;
    const stock = this.sim.players;
    const building = this.selectedBuilding();

    const key = this.selection.values().join(',');
    if (key !== this.selectionKey) {
      this.selectionKey = key;
      this.buildPage = 0;
    }

    if (this.workers().length > 0) {
      if (this.buildPage === 0) {
        slots[0] = this.pageButton(0, 1, 'Edificios económicos', 'Casas, molino, campamentos, mercado, herrería, universidad, monasterio, centro de la villa, Catedral.');
        slots[1] = this.pageButton(1, 2, 'Edificios militares', 'Cuartel, galería de tiro, caballeriza, taller de asedio, murallas, puertas, torres, castillo, fundición.');
        slots[REPAIR_SLOT] = {
          slot: REPAIR_SLOT,
          hotkey: HOTKEY_LABELS[REPAIR_SLOT],
          label: 'Reparar',
          description: `Haz clic en un edificio tuyo dañado y los aldeanos lo arreglan. Reparar un edificio entero cuesta la mitad de lo que costó, en proporción a la vida que le falte. También con clic derecho sobre él.`,
          icon: { kind: 'action', action: 'repair' },
          enabled: true,
        };
      } else {
        const list = this.buildPage === 1 ? ECONOMIC_BUILDINGS : MILITARY_BUILDINGS;
        list.forEach((type, slot) => (slots[slot] = this.buildingButton(slot, type)));
        slots[BACK_SLOT] = {
          slot: BACK_SLOT,
          hotkey: HOTKEY_LABELS[BACK_SLOT],
          label: 'Volver',
          description: 'Vuelve al panel del aldeano.',
          icon: { kind: 'action', action: 'back' },
          enabled: true,
        };
        return slots;
      }
    } else if (building && e.owner[building] === P && e.built[building] && e.has(building, Comp.Producer)) {
      const type = e.buildingType[building] as BuildingType;
      let next = 0;
      if (type === BuildingType.Market) {
        [0, 1, 2].forEach((r) => {
          slots[r] = this.marketButton(r, r, true);
          slots[4 + r] = this.marketButton(4 + r, r, false);
        });
        next = MARKET_TRADE_SLOT;
      }
      for (const unit of this.sim.stats.trainsFor(P, type)) {
        if (next > 9) break;
        slots[next] = this.unitButton(next, building, unit);
        next++;
      }
      // Tecnologías aún no investigadas (el avance de era, solo el siguiente).
      const techs = techsAt(this.sim, P, type).filter((t) => {
        const def = TECH_DEFS[t];
        if (stock.hasTech(P, t)) return false;
        return def.advance === undefined || def.advance === stock.era[P] + 1;
      });
      for (const tech of techs) {
        if (next > 9) break;
        slots[next] = this.techButton(next, tech);
        next++;
      }
    }
    // Edificio con guarnición: toque a rebato (centro de la villa) y expulsar.
    if (building && e.owner[building] === P && garrisonCapacity(this.sim, building) > 0) {
      if (e.buildingType[building] === BuildingType.TownCenter) {
        slots[BELL_SLOT] = {
          slot: BELL_SLOT,
          hotkey: HOTKEY_LABELS[BELL_SLOT],
          label: 'Tocar a rebato',
          description: `Los aldeanos cercanos (${BELL_RADIUS} casillas) se refugian aquí y disparan desde dentro.`,
          icon: { kind: 'action', action: 'bell' },
          enabled: true,
        };
      }
      const inside = this.sim.garrisonCount.get(building) ?? 0;
      slots[UNGARRISON_SLOT] = {
        slot: UNGARRISON_SLOT,
        hotkey: HOTKEY_LABELS[UNGARRISON_SLOT],
        label: 'Expulsar guarnición',
        description: 'Saca a todas las unidades guarecidas.',
        icon: { kind: 'action', action: 'ungarrison' },
        enabled: inside > 0,
        reason: inside > 0 ? undefined : 'No hay nadie dentro',
      };
    }
    const units = this.ownUnits();
    const fighters = units.filter((id) => attackOf(this.sim, id) !== null);
    if (units.length > 0 && this.workers().length === 0 && fighters.length > 0) {
      slots[0] = {
        slot: 0,
        hotkey: HOTKEY_LABELS[0],
        label: 'Ataque-mover',
        description: 'Avanzan hacia el punto que marques atacando a los enemigos que encuentren.',
        icon: { kind: 'action', action: 'attackMove' },
        enabled: true,
      };
      const current = e.stance[fighters[0]];
      const same = fighters.every((id) => e.stance[id] === current);
      STANCE_SLOTS.forEach((stance, i) => {
        const slot = 4 + i;
        slots[slot] = {
          slot,
          hotkey: HOTKEY_LABELS[slot],
          label: `Postura ${STANCE_NAMES[stance].toLowerCase()}`,
          description: STANCE_DESCRIPTIONS[stance],
          icon: { kind: 'action', action: `stance${stance}` },
          enabled: true,
          active: same && current === stance,
        };
      });
    }
    if (units.length > 0) {
      slots[STOP_SLOT] = {
        slot: STOP_SLOT,
        hotkey: HOTKEY_LABELS[STOP_SLOT],
        label: 'Detener',
        description: 'Las unidades dejan lo que estén haciendo.',
        icon: { kind: 'action', action: 'stop' },
        enabled: true,
      };
    }
    return slots;
  }

  private pageButton(slot: number, page: 1 | 2, label: string, description: string): CommandButton {
    return { slot, hotkey: HOTKEY_LABELS[slot], label, description, icon: { kind: 'page', page }, enabled: true };
  }

  private buildingButton(slot: number, type: BuildingType): CommandButton {
    const def = BUILDING_DEFS[type];
    const P = this.player;
    const price = this.sim.stats.buildingCost(P, type);
    let reason: string | undefined;
    if (this.sim.players.era[P] < (def.era ?? 0)) reason = `Requiere: ${ERA_DEFS[def.era ?? 0].title}`;
    else if (def.requires !== undefined && !hasBuilt(this.sim, P, def.requires)) reason = `Requiere: ${BUILDING_DEFS[def.requires].name}`;
    else if (!this.sim.players.canAfford(P, price)) reason = this.missing(price);
    return {
      slot,
      hotkey: HOTKEY_LABELS[slot],
      label: def.name,
      description: def.description,
      icon: { kind: 'building', type },
      cost: price,
      enabled: reason === undefined,
      reason,
    };
  }

  private unitButton(slot: number, building: number, base: UnitType): CommandButton {
    const P = this.player;
    const type = this.sim.stats.trainedType(P, base);
    const def = UNIT_DEFS[type];
    const price = this.sim.stats.unitCost(P, type);
    const queueFull = (this.sim.entities.queue[building]?.length ?? 0) >= MAX_QUEUE;
    const reason = trainBlocker(this.sim, P, base) ?? (queueFull ? 'Cola llena' : this.sim.players.canAfford(P, price) ? undefined : this.missing(price));
    return {
      slot,
      hotkey: HOTKEY_LABELS[slot],
      label: `Entrenar ${def.name.toLowerCase()}`,
      description: def.description,
      icon: { kind: 'unit', type: base },
      cost: price,
      enabled: reason === undefined,
      reason,
    };
  }

  private techButton(slot: number, tech: TechType): CommandButton {
    const P = this.player;
    const def = TECH_DEFS[tech];
    const reason = researchBlocker(this.sim, P, tech) ?? (this.sim.players.canAfford(P, def.cost) ? undefined : this.missing(def.cost));
    return {
      slot,
      hotkey: HOTKEY_LABELS[slot],
      label: def.name,
      description: def.description,
      icon: { kind: 'tech', tech },
      cost: def.cost,
      enabled: reason === undefined,
      reason,
      active: def.advance !== undefined,
    };
  }

  private marketButton(slot: number, resource: number, buy: boolean): CommandButton {
    const P = this.player;
    const players = this.sim.players;
    const price = players.prices[P * 3 + resource];
    const name = RESOURCE_NAMES[resource as Resource].toLowerCase();
    const gain = Math.floor((price * this.sim.stats.sellPct(P)) / 100);
    let reason: string | undefined;
    if (buy && players.get(P, Resource.Gold) < price) reason = 'Falta oro';
    if (!buy && players.get(P, resource as Resource) < 100) reason = `Falta ${name}`;
    return {
      slot,
      hotkey: HOTKEY_LABELS[slot],
      label: buy ? `Comprar 100 de ${name}` : `Vender 100 de ${name}`,
      description: buy ? `Cuesta ${price} de oro. Cada compra sube el precio.` : `Te dan ${gain} de oro. Cada venta baja el precio.`,
      icon: { kind: 'market', resource, buy },
      cost: buy ? makeCost({ gold: price }) : undefined,
      enabled: reason === undefined,
      reason,
      badge: buy ? '+100' : '−100',
    };
  }

  /** Nombre con el que se menciona a un jugador. */
  nameOf(player: number): string {
    return this.rivals.find((r) => r.player === player)?.name ?? `El jugador ${player}`;
  }

  /** Avisos a partir de los sucesos de la simulación (investigaciones, eras, ataques, derrotas…). */
  handleEvents(events: readonly SimEvent[]): void {
    for (const ev of events) {
      if (ev.kind === 'research' && ev.player === this.player) {
        const def = TECH_DEFS[ev.tech as TechType];
        this.notify(def.advance !== undefined ? `¡Has alcanzado la ${ERA_DEFS[def.advance].title}!` : `Investigado: ${def.name}`);
      } else if (ev.kind === 'attacked' && ev.player === this.player) {
        this.lastAttack = { x: ev.x, y: ev.y };
        if (this.sim.tick - this.lastAttackNotice >= ATTACK_NOTICE_SECONDS * this.sim.tickRate) {
          this.lastAttackNotice = this.sim.tick;
          this.notify('¡Nos atacan! (Espacio para ir allí)');
        }
      } else if (ev.kind === 'defeat') {
        const verb = ev.resigned ? 'se ha rendido' : 'ha sido derrotado';
        this.notify(ev.player === this.player ? 'Has sido derrotado' : `${this.nameOf(ev.player)} ${verb}`);
      } else if (ev.kind === 'repairBlocked' && ev.player === this.player) {
        this.notify('Faltan recursos para reparar');
      } else if (ev.kind === 'convert' && (ev.from === this.player || ev.to === this.player)) {
        this.notify(ev.to === this.player ? 'Un monje ha convertido una unidad enemiga' : 'Han convertido una de tus unidades');
      }
    }
  }

  /** Coloca un tramo de muro (casillas en orden). Con `keep` (Shift) sigue en modo colocación. */
  placeWall(tiles: readonly { x: number; y: number }[], keep: boolean): void {
    if (this.mode.kind !== 'place') return;
    const type = this.mode.building;
    const workers = this.workers();
    const valid = tiles.filter((t) => this.canPlace(type, t.x, t.y));
    if (workers.length === 0 || valid.length === 0) {
      if (valid.length === 0) this.notify('No se puede construir ahí');
      return;
    }
    const price = this.sim.stats.buildingCost(this.player, type);
    const stock = [0, 1, 2, 3].map((r) => this.sim.players.get(this.player, r as Resource));
    let placed = 0;
    for (const t of valid) {
      if (price.some((c, r) => stock[r] < c)) break;
      price.forEach((c, r) => (stock[r] -= c));
      this.send({ type: 'build', player: this.player, units: workers, buildingType: type, tileX: t.x, tileY: t.y, queue: keep || placed > 0 });
      placed++;
    }
    if (placed < valid.length) this.notify(this.missing(price) || 'No hay recursos para todo el tramo');
    if (!keep) this.cancelPlacement();
  }

  /** Pulsa el botón de una casilla de la rejilla (por clic o atajo). */
  press(slot: number): void {
    const button = this.commandButtons()[slot];
    if (!button) return;
    if (!button.enabled) {
      if (button.reason) this.notify(button.reason);
      this.feedback.push({ kind: 'denied' });
      return;
    }
    this.feedback.push({ kind: 'click' });
    const icon = button.icon;
    if (icon.kind === 'building') {
      this.mode = { kind: 'place', building: icon.type };
    } else if (icon.kind === 'page') {
      this.buildPage = icon.page;
    } else if (icon.kind === 'unit') {
      const building = this.selectedBuilding();
      if (!this.sim.players.hasRoom(this.player, UNIT_DEFS[icon.type].pop)) this.notify('Necesitas más casas');
      this.send({ type: 'train', player: this.player, building, unitType: icon.type });
    } else if (icon.kind === 'tech') {
      this.send({ type: 'research', player: this.player, building: this.selectedBuilding(), tech: icon.tech });
    } else if (icon.kind === 'market') {
      this.send({ type: 'market', player: this.player, resource: icon.resource, buy: icon.buy });
    } else if (icon.action === 'back') {
      this.buildPage = 0;
    } else if (icon.action === 'attackMove') {
      this.mode = { kind: 'attackMove' };
    } else if (icon.action === 'repair') {
      this.mode = { kind: 'repair' };
    } else if (icon.action === 'ungarrison') {
      this.send({ type: 'ungarrison', player: this.player, buildings: [this.selectedBuilding()] });
    } else if (icon.action === 'bell') {
      this.ringBell(this.selectedBuilding());
    } else if (icon.action.startsWith('stance')) {
      this.send({ type: 'stance', player: this.player, units: this.ownUnits(), stance: Number(icon.action.slice(6)) });
    } else {
      this.send({ type: 'stop', player: this.player, units: this.ownUnits() });
    }
  }

  /** Atajo de teclado de la rejilla. Devuelve `true` si lo ha usado. */
  /** Grupos de control (para guardar la partida). */
  exportGroups(): number[][] {
    return this.groups.map((g) => [...g]);
  }

  /** Recupera los grupos de control de una partida guardada. */
  importGroups(groups: readonly (readonly number[])[]): void {
    groups.forEach((g, i) => {
      if (i < this.groups.length) this.groups[i] = g.filter((id) => this.sim.entities.isAlive(id));
    });
  }

  pressHotkey(code: string): boolean {
    const slot = (HOTKEY_CODES as readonly string[]).indexOf(code);
    if (slot < 0 || !this.commandButtons()[slot]) return false;
    this.press(slot);
    return true;
  }

  /** Cancela una unidad de la cola del edificio seleccionado. */
  cancelQueued(index: number): void {
    const building = this.selectedBuilding();
    if (building) this.send({ type: 'cancelTrain', player: this.player, building, index });
  }

  // ── Colocación de edificios ──

  /** Esquina de la huella si el cursor está sobre la casilla (tx, ty): el edificio queda centrado en el cursor. */
  placementOrigin(type: BuildingType, tx: number, ty: number): { x: number; y: number } {
    const size = BUILDING_DEFS[type].size;
    return { x: tx - ((size - 1) >> 1), y: ty - ((size - 1) >> 1) };
  }

  canPlace(type: BuildingType, ox: number, oy: number): boolean {
    return canPlaceBuilding(this.sim, type, ox, oy);
  }

  /** Coloca los cimientos. Con `keep` (Shift) sigue en modo colocación y encola la obra. */
  place(ox: number, oy: number, keep: boolean): void {
    if (this.mode.kind !== 'place') return;
    const type = this.mode.building;
    const workers = this.workers();
    if (workers.length === 0) {
      this.cancelPlacement();
      return;
    }
    if (!this.canPlace(type, ox, oy)) {
      this.notify('No se puede construir ahí');
      this.feedback.push({ kind: 'denied' });
      return;
    }
    const price = this.sim.stats.buildingCost(this.player, type);
    if (!this.sim.players.canAfford(this.player, price)) {
      this.notify(this.missing(price));
      this.feedback.push({ kind: 'denied' });
      this.cancelPlacement();
      return;
    }
    this.send({ type: 'build', player: this.player, units: workers, buildingType: type, tileX: ox, tileY: oy, queue: keep });
    this.feedback.push({ kind: 'place' });
    if (!keep) this.cancelPlacement();
  }

  cancelPlacement(): void {
    this.mode = { kind: 'normal' };
  }

  /** En modo reparar: clic sobre un edificio propio dañado. Con `keep` (Shift) se encola y sigue en el modo. */
  repairAt(target: PickTarget | null, keep: boolean): RightClickResult {
    const workers = this.workers();
    if (!keep || workers.length === 0) this.mode = { kind: 'normal' };
    if (workers.length === 0) return 'none';
    const e = this.sim.entities;
    const id = target?.id ?? 0;
    if (!id || !e.has(id, Comp.Building) || e.owner[id] !== this.player) {
      this.notify('Elige un edificio tuyo');
      this.feedback.push({ kind: 'denied' });
      return 'none';
    }
    if (!needsBuilder(this.sim, id)) {
      this.notify(e.nodeType[id] === NodeType.Farm ? 'Las granjas no se reparan' : 'No está dañado');
      this.feedback.push({ kind: 'denied' });
      return 'none';
    }
    this.send({ type: 'construct', player: this.player, units: workers, target: id, queue: keep });
    return this.acknowledge('work');
  }

  // ── Derribar ──

  /** El botón de derribar del edificio seleccionado, o null si no es tuyo. */
  demolishView(): DemolishView | null {
    const b = this.selectedBuilding();
    const e = this.sim.entities;
    if (!b || e.owner[b] !== this.player || !e.has(b, Comp.Position)) return null;
    if (!e.built[b]) return { label: 'Cancelar obra', title: 'Cancelar la obra (Supr): se recupera lo que aún no se ha gastado', armed: false };
    const armed = this.demolishArmed?.id === b && this.now() < this.demolishArmed.until;
    return armed
      ? { label: '¿Derribar?', title: 'Vuelve a pulsar (o Supr) para derribarlo', armed: true }
      : { label: 'Derribar', title: 'Derribar el edificio (Supr). Pide confirmación; no se recupera nada', armed: false };
  }

  /**
   * Derriba el edificio seleccionado. Si está terminado, la primera pulsación solo pide confirmación;
   * unos cimientos se cancelan al momento.
   */
  demolishSelected(): boolean {
    const b = this.selectedBuilding();
    const e = this.sim.entities;
    if (!b || e.owner[b] !== this.player || !e.has(b, Comp.Position)) return false;
    const name = BUILDING_DEFS[e.buildingType[b] as BuildingType].name;
    const now = this.now();
    // El aviso de "vuelve a pulsar" de otro edificio (o de este, si ya se confirma) sobra.
    for (let i = this.notices.length - 1; i >= 0; i--) if (this.notices[i].text.startsWith(DEMOLISH_NOTICE)) this.notices.splice(i, 1);
    if (e.built[b] && !(this.demolishArmed?.id === b && now < this.demolishArmed.until)) {
      this.demolishArmed = { id: b, until: now + DEMOLISH_CONFIRM_MS };
      this.notify(`${DEMOLISH_NOTICE}: ${name.toLowerCase()}`);
      this.feedback.push({ kind: 'click' });
      return true;
    }
    this.demolishArmed = null;
    this.send({ type: 'demolish', player: this.player, buildings: [b] });
    if (!e.built[b]) this.notify('Obra cancelada');
    return true;
  }

  /** En modo ataque-mover: clic sobre un enemigo = atacarlo; sobre el suelo = avanzar atacando. */
  attackMoveAt(target: PickTarget | null, x: number, y: number, keep: boolean): RightClickResult {
    return this.acknowledge(this.attackMoveInner(target, x, y, keep));
  }

  private attackMoveInner(target: PickTarget | null, x: number, y: number, keep: boolean): RightClickResult {
    const units = this.ownUnits();
    if (!keep) this.mode = { kind: 'normal' };
    if (units.length === 0) return 'none';
    const P = this.player;
    if (target && isAttackable(this.sim, units[0], target.id) && this.sim.entities.owner[target.id] !== 0) {
      this.send({ type: 'attack', player: P, units, target: target.id });
      return 'attack';
    }
    this.send({ type: 'attackMove', player: P, units, x, y });
    return 'attack';
  }

  /** Toque a rebato: los aldeanos cercanos al centro de la villa se refugian dentro. */
  ringBell(townCenter: number): void {
    if (!townCenter) return;
    const e = this.sim.entities;
    const room = garrisonCapacity(this.sim, townCenter) - (this.sim.garrisonCount.get(townCenter) ?? 0);
    const maxD = BELL_RADIUS * 256;
    const near = this.sim.unitIds
      .filter((id) => e.has(id, Comp.Worker | Comp.Position) && e.owner[id] === this.player)
      .map((id) => ({ id, d: Math.hypot(e.x[id] - e.x[townCenter], e.y[id] - e.y[townCenter]) }))
      .filter((v) => v.d <= maxD)
      .sort((a, b) => a.d - b.d || a.id - b.id)
      .slice(0, Math.max(0, room))
      .map((v) => v.id);
    if (near.length === 0) {
      this.notify('No hay aldeanos cerca');
      return;
    }
    this.send({ type: 'garrison', player: this.player, units: near, target: townCenter });
    this.feedback.push({ kind: 'bell' });
  }

  // ── Grupos de control ──

  assignGroup(n: number): void {
    this.groups[n] = this.ownUnits();
    if (this.groups[n].length === 0) {
      const b = this.selectedBuilding();
      if (b && this.sim.entities.owner[b] === this.player) this.groups[n] = [b];
    }
  }

  /** Selecciona el grupo; devuelve sus ids vivos (vacío si no hay nada). */
  selectGroup(n: number): number[] {
    const e = this.sim.entities;
    const ids = this.groups[n].filter((id) => e.isAlive(id) && e.has(id, Comp.Position) && e.owner[id] === this.player);
    this.groups[n] = ids;
    if (ids.length > 0) this.selection.replace(ids);
    return ids;
  }

  // ── Clic derecho ──

  /**
   * Orden contextual sobre `target` (o sobre el suelo en x, y en punto fijo).
   * Con `alt` sobre un edificio propio con guarnición, las unidades entran en él.
   */
  rightClick(target: PickTarget | null, x: number, y: number, alt = false): RightClickResult {
    return this.acknowledge(this.rightClickInner(target, x, y, alt));
  }

  /** Voz de confirmación de una orden (la de la primera unidad propia seleccionada). */
  private acknowledge(result: RightClickResult): RightClickResult {
    const unit = this.ownUnits()[0];
    if (result === 'rally') this.feedback.push({ kind: 'click' });
    else if (result !== 'none' && unit) this.feedback.push({ kind: 'order', unitType: this.sim.entities.unitType[unit], unit, attack: result === 'attack' });
    return result;
  }

  /** Lo que el audio tiene que responder desde el último fotograma (y una voz si la selección ha cambiado). */
  drainFeedback(): Feedback[] {
    const own = this.ownUnits();
    const key = own.length > 0 ? `${own.length}:${own[0]}` : '';
    if (key !== this.voiceKey) {
      this.voiceKey = key;
      if (own.length > 0) this.feedback.push({ kind: 'select', unitType: this.sim.entities.unitType[own[0]], unit: own[0] });
    }
    return this.feedback.splice(0);
  }

  /** Cursor para lo que hay bajo el ratón: atacar, talar, minar, recoger, construir o el de siempre. */
  cursorFor(target: PickTarget | null): CursorKind {
    if (this.mode.kind === 'place' || this.mode.kind === 'repair') return 'hammer';
    if (this.mode.kind === 'attackMove') return 'sword';
    const units = this.ownUnits();
    if (units.length === 0 || !target) return 'hand';
    const e = this.sim.entities;
    const P = this.player;
    const id = target.id;
    if (!e.isAlive(id)) return 'hand';
    const workers = units.some((u) => e.has(u, Comp.Worker));
    if (e.has(id, Comp.Building) && e.owner[id] === P) return workers && needsBuilder(this.sim, id) ? 'hammer' : 'hand';
    if (workers && e.has(id, Comp.Resource) && e.resAmount[id] > 0) {
      const t = e.nodeType[id];
      if (t === NodeType.Tree) return 'axe';
      if (t === NodeType.Gold || t === NodeType.Stone) return 'pick';
      if (t !== NodeType.Sheep || e.owner[id] === P || e.owner[id] === 0) return 'sickle';
    }
    const enemy = e.owner[id] !== P && (e.owner[id] !== 0 || isHostile(this.sim, units[0], id));
    if (enemy && (target.kind === 'unit' || target.kind === 'building')) return 'sword';
    return 'hand';
  }

  private rightClickInner(target: PickTarget | null, x: number, y: number, alt = false): RightClickResult {
    const e = this.sim.entities;
    const P = this.player;
    const building = this.selectedBuilding();
    const id0 = target?.id ?? 0;
    if (alt && id0 && e.has(id0, Comp.Building) && e.owner[id0] === P && garrisonCapacity(this.sim, id0) > 0) {
      const units = this.ownUnits();
      if (units.length > 0) {
        this.send({ type: 'garrison', player: P, units, target: id0 });
        return 'work';
      }
    }
    if (building && e.owner[building] === P && e.has(building, Comp.Producer)) {
      const t = target && target.kind !== 'unit' ? target.id : 0;
      this.send({ type: 'rally', player: P, buildings: [building], x, y, target: t });
      return 'rally';
    }
    const units = this.ownUnits();
    if (units.length === 0) return 'none';
    const workers = units.filter((id) => e.has(id, Comp.Worker));
    const others = units.filter((id) => !e.has(id, Comp.Worker));
    const id = target?.id ?? 0;

    // Enemigos (y lobos): atacar. Los aldeanos sobre un ciervo o un jabalí, en cambio, cazan.
    if (id && (target?.kind === 'unit' || target?.kind === 'building')) {
      const huntable = e.has(id, Comp.Resource) && e.owner[id] === 0;
      const enemy = e.owner[id] !== P && (isHostile(this.sim, units[0], id) || e.owner[id] !== 0 || huntable);
      if (enemy) {
        const fighters = units.filter(
          (u) => attackOf(this.sim, u) !== null || (UNIT_DEFS[e.unitType[u] as UnitType].monk === true && target?.kind === 'unit' && e.owner[id] !== 0),
        );
        const hunters = huntable ? workers : [];
        if (hunters.length > 0) this.send({ type: 'gather', player: P, units: hunters, target: id });
        const attackers = fighters.filter((u) => !hunters.includes(u));
        if (attackers.length > 0) this.send({ type: 'attack', player: P, units: attackers, target: id });
        if (hunters.length > 0 || attackers.length > 0) return hunters.length > 0 ? 'work' : 'attack';
      }
    }

    // Carros de comercio sobre un mercado propio: ruta de comercio.
    if (id && e.has(id, Comp.Building) && e.owner[id] === P && e.buildingType[id] === BuildingType.Market) {
      const carts = units.filter((u) => UNIT_DEFS[e.unitType[u] as UnitType].trader === true);
      if (carts.length > 0) {
        this.send({ type: 'trade', player: P, units: carts, target: id });
        const rest = units.filter((u) => !carts.includes(u));
        if (rest.length > 0) this.send({ type: 'move', player: P, units: rest, x, y });
        return 'work';
      }
    }

    if (workers.length > 0 && id && target) {
      const isResource = e.has(id, Comp.Resource) && e.resAmount[id] > 0;
      const isOwnBuilding = e.has(id, Comp.Building) && e.owner[id] === P;
      let ordered = false;
      if (isOwnBuilding && !e.built[id]) {
        this.send({ type: 'construct', player: P, units: workers, target: id, queue: false });
        ordered = true;
      } else if (isResource && (e.nodeType[id] !== NodeType.Farm || isOwnBuilding) && (e.nodeType[id] !== NodeType.Sheep || e.owner[id] === P)) {
        this.send({ type: 'gather', player: P, units: workers, target: id });
        ordered = true;
      } else if (isOwnBuilding) {
        // Los que llevan algo que se entrega aquí, lo entregan; los demás reparan si está dañado.
        const carrying = workers.filter((w) => e.carryAmount[w] > 0 && isDropsite(this.sim, id, P, e.carryKind[w]));
        const rest = workers.filter((w) => !carrying.includes(w));
        if (carrying.length > 0) this.send({ type: 'deliver', player: P, units: carrying, target: id });
        if (rest.length > 0 && needsBuilder(this.sim, id)) {
          this.send({ type: 'construct', player: P, units: rest, target: id, queue: false });
          ordered = true;
        } else {
          ordered = carrying.length > 0 && rest.length === 0;
        }
      }
      if (ordered) {
        if (others.length > 0) this.send({ type: 'move', player: P, units: others, x, y });
        return 'work';
      }
    }
    this.send({ type: 'move', player: P, units, x, y });
    return 'move';
  }

  // ── Aldeanos ociosos ──

  idleVillagers(): number[] {
    const e = this.sim.entities;
    const out: number[] = [];
    for (let id = 1; id < e.highWater; id++) {
      // Los guarecidos (sin Position) no cuentan: están a salvo, no ociosos.
      if (
        e.has(id, Comp.Worker | Comp.Position) &&
        e.owner[id] === this.player &&
        e.task[id] === Task.None &&
        e.moveState[id] === MoveState.Idle &&
        e.attackTarget[id] === 0
      ) {
        out.push(id);
      }
    }
    return out;
  }

  /** Selecciona el siguiente aldeano ocioso (rotando). Devuelve su id o 0. */
  selectNextIdle(): number {
    const idle = this.idleVillagers();
    if (idle.length === 0) return 0;
    const next = idle.find((id) => id > this.lastIdle) ?? idle[0];
    this.lastIdle = next;
    this.selection.replace([next]);
    return next;
  }

  /** Primer centro de la villa propio, o 0. */
  townCenter(): number {
    const e = this.sim.entities;
    for (let id = 1; id < e.highWater; id++) {
      if (e.has(id, Comp.Building) && e.owner[id] === this.player && e.buildingType[id] === BuildingType.TownCenter) return id;
    }
    return 0;
  }

  // ── Avisos ──

  notify(text: string): void {
    const now = this.now();
    const existing = this.notices.find((n) => n.text === text);
    if (existing) existing.until = now + NOTICE_MS;
    else this.notices.push({ text, until: now + NOTICE_MS });
  }

  activeNotices(): string[] {
    const now = this.now();
    for (let i = this.notices.length - 1; i >= 0; i--) if (this.notices[i].until <= now) this.notices.splice(i, 1);
    return this.notices.map((n) => n.text);
  }

  /** Texto "Falta madera y oro" para un coste que no se puede pagar. */
  missing(cost: Cost): string {
    const lacking: string[] = [];
    cost.forEach((amount, r) => {
      if (this.sim.players.get(this.player, r as Resource) < amount) lacking.push(RESOURCE_NAMES[r as Resource].toLowerCase());
    });
    return lacking.length ? `Falta ${lacking.join(' y ')}` : '';
  }

  /** Qué está haciendo un aldeano, en palabras. */
  describeTask(id: number): string {
    const e = this.sim.entities;
    switch (e.task[id]) {
      case Task.Gather:
        return GATHER_VERBS[e.homeType[id]] ?? 'Recolectando';
      case Task.Deliver:
        return `Llevando ${RESOURCE_NAMES[e.carryKind[id] as Resource].toLowerCase()}`;
      case Task.Build:
        return this.sim.entities.built[e.taskTarget[id]] ? 'Reparando' : 'Construyendo';
      default:
        return e.moveState[id] === MoveState.Idle ? 'Ocioso' : 'Caminando';
    }
  }

  /** Nombre visible de una fuente de recursos. */
  nodeName(id: number): string {
    const type = this.sim.entities.nodeType[id] as NodeType;
    return type === NodeType.None ? '' : NODE_DEFS[type].name;
  }
}

const GATHER_VERBS: Readonly<Record<number, string>> = {
  [NodeType.Tree]: 'Talando',
  [NodeType.Berries]: 'Recogiendo bayas',
  [NodeType.Gold]: 'Extrayendo oro',
  [NodeType.Stone]: 'Extrayendo piedra',
  [NodeType.Carcass]: 'Recogiendo carne',
  [NodeType.Farm]: 'Cultivando',
};
