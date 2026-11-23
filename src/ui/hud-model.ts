import { BUILDING_DEFS, BuildingType } from '../data/buildings';
import { STANCE_NAMES, type Stance } from '../data/combat';
import { ERA_DEFS } from '../data/eras';
import { FACTION_DEFS, type Faction } from '../data/factions';
import { TECH_DEFS, type TechType } from '../data/techs';
import { WONDER_MINUTES } from '../data/buildings';
import { RESOURCE_NAMES, type Resource } from '../data/resources';
import { UNIT_DEFS, UnitType } from '../data/units';
import type { DemolishView, GameClient, IconRef } from '../game/client';
import { Comp } from '../sim/entities';
import { trainTicks } from '../sim/systems/production';
import { TECH_BASE, isTechItem, researchTicks } from '../sim/tech';
import { TEAM_COLORS } from '../render/palette';
import type { TutorialView } from '../game/tutorial';
import type { Icons } from './icons';

/** Todo lo que muestra el HUD, calculado a partir de la simulación y la selección. Sin Preact ni DOM. */
export interface HudSnapshot {
  readonly resources: readonly { readonly name: string; readonly amount: number; readonly icon: string }[];
  readonly pop: { readonly used: number; readonly cap: number; readonly icon: string };
  readonly era: string;
  /** Nombre corto de la era (para pantallas estrechas). */
  readonly eraShort: string;
  readonly clock: string;
  readonly idle: number;
  readonly selection: SelectionView | null;
  readonly buttons: readonly (ButtonView | null)[];
  readonly notices: readonly string[];
  /** Indicación del modo actual (colocar edificio, ataque-mover). */
  readonly hint: string | null;
  readonly faction: string;
  /** Escudo de tu corona. */
  readonly shield: string;
  /** Música y sonido activados (botones de la barra superior). */
  readonly audio: { readonly music: boolean; readonly sound: boolean };
  /** Rivales con nombre: señor, "facción · dificultad", su color y si ya ha caído. */
  readonly rivals: readonly { readonly name: string; readonly detail: string; readonly color: string; readonly shield: string; readonly defeated: boolean }[];
  /** Color del jugador local (para el panel de reinos). */
  readonly color: string;
  /** Cuenta atrás de las Catedrales en pie. */
  readonly wonders: readonly string[];
  /** Fin de la partida (o null si sigue). */
  readonly gameOver: { readonly won: boolean; readonly title: string; readonly text: string } | null;
  /** Paso del tutorial (solo en el tutorial). */
  readonly tutorial?: TutorialView | null;
}

/** Lo que el HUD recibe además de la partida: el tutorial y qué botones resalta. */
export interface SnapshotExtra {
  readonly tutorial?: TutorialView | null;
  readonly hint?: (ref: IconRef) => boolean;
}

export interface ButtonView {
  readonly slot: number;
  readonly hotkey: string;
  readonly label: string;
  readonly description: string;
  readonly icon: string;
  readonly cost: readonly { readonly icon: string; readonly amount: number; readonly missing: boolean }[];
  readonly enabled: boolean;
  readonly reason?: string;
  readonly active?: boolean;
  readonly badge?: string;
  /** Resaltado por el tutorial (el botón que hay que pulsar). */
  readonly hint?: boolean;
  /** Categoría, para el color del borde (docs/arte.md §7): económico, militar, tecnología o ninguna. */
  readonly category: ButtonCategory;
}

export type ButtonCategory = 'eco' | 'mil' | 'tech' | 'none';

const ECO_BUILDINGS: ReadonlySet<BuildingType> = new Set([
  BuildingType.TownCenter,
  BuildingType.House,
  BuildingType.Mill,
  BuildingType.LumberCamp,
  BuildingType.MiningCamp,
  BuildingType.Farm,
  BuildingType.Market,
]);
const TECH_BUILDINGS: ReadonlySet<BuildingType> = new Set([BuildingType.University, BuildingType.Monastery, BuildingType.Cathedral]);

/** Categoría de un botón según lo que hace. */
export function categoryOf(ref: IconRef): ButtonCategory {
  switch (ref.kind) {
    case 'unit':
      return ref.type === UnitType.Villager || ref.type === UnitType.TradeCart ? 'eco' : 'mil';
    case 'building':
      return ECO_BUILDINGS.has(ref.type) ? 'eco' : TECH_BUILDINGS.has(ref.type) ? 'tech' : 'mil';
    case 'tech':
      return 'tech';
    case 'market':
      return 'eco';
    case 'page':
      return ref.page === 1 ? 'eco' : 'mil';
    case 'action':
      return 'none';
  }
}

/** Dato de la selección que se muestra con su icono (ataque, alcance, armadura…). */
export type StatKind = 'attack' | 'range' | 'armor' | 'speed' | 'pop' | 'garrison';

export interface SelectionStat {
  readonly kind: StatKind;
  readonly value: string;
  /** Explicación (al pasar el ratón). */
  readonly title: string;
}

export interface SelectionView {
  readonly icon: string;
  readonly title: string;
  readonly owner?: string;
  readonly lines: readonly string[];
  readonly stats?: readonly SelectionStat[];
  readonly hp?: { readonly cur: number; readonly max: number };
  readonly progress?: { readonly label: string; readonly value: number };
  readonly queue?: readonly { readonly icon: string; readonly name: string; readonly progress: number }[];
  /** Qué se está haciendo con la cola: "Entrenando: Aldeano", "Investigando: …" o "Esperando: faltan casas". */
  readonly queueStatus?: string;
  readonly groups?: readonly { readonly icon: string; readonly name: string; readonly ids: readonly number[] }[];
  /** Botón de derribar (edificios propios), con su icono para cuando no cabe el texto. */
  readonly demolish?: DemolishView & { readonly icon: string };
}

export function buildSnapshot(client: GameClient, icons: Icons, audio = { music: true, sound: true }, extra: SnapshotExtra = {}): HudSnapshot {
  const sim = client.sim;
  const P = client.player;
  const seconds = Math.floor(sim.tick / sim.tickRate);
  const buttons = client.commandButtons().map((b): ButtonView | null =>
    b
      ? {
          slot: b.slot,
          hotkey: b.hotkey,
          label: b.label,
          description: b.description,
          icon: icons.of(b.icon, P),
          hint: extra.hint?.(b.icon) ?? false,
          cost: (b.cost ?? [])
            .map((amount, r) => ({ icon: icons.resource(r), amount, missing: sim.players.get(P, r as Resource) < amount }))
            .filter((c) => c.amount > 0),
          enabled: b.enabled,
          reason: b.reason,
          active: b.active,
          badge: b.badge,
          category: categoryOf(b.icon),
        }
      : null,
  );
  return {
    resources: [0, 1, 2, 3].map((r) => ({
      name: RESOURCE_NAMES[r as Resource],
      amount: sim.players.get(P, r as Resource),
      icon: icons.resource(r),
    })),
    pop: { used: sim.players.popUsed[P], cap: Math.min(200, sim.players.popCap[P]), icon: icons.resource('pop', P) },
    era: ERA_DEFS[sim.players.era[P]].title,
    eraShort: ERA_DEFS[sim.players.era[P]].name,
    faction: FACTION_DEFS[sim.players.faction[P] as Faction].name,
    shield: icons.shield?.(sim.players.faction[P] as Faction) ?? '',
    audio,
    rivals: client.rivals.map((r) => ({
      name: r.name,
      detail: r.detail,
      color: TEAM_COLORS[r.player]?.[1] ?? '#888',
      shield: icons.shield?.(sim.players.faction[r.player] as Faction) ?? '',
      defeated: sim.players.defeated[r.player] === 1,
    })),
    color: TEAM_COLORS[P]?.[1] ?? '#888',
    wonders: wonderCountdowns(client),
    gameOver: gameOverView(client),
    tutorial: extra.tutorial ?? null,
    clock: `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`,
    idle: client.idleVillagers().length,
    selection: selectionView(client, icons),
    buttons,
    notices: client.activeNotices(),
    hint:
      client.mode.kind === 'place'
        ? `Colocando ${BUILDING_DEFS[client.mode.building].name.toLowerCase()} · clic para construir · Shift para varios · clic derecho o Esc para cancelar`
        : client.mode.kind === 'attackMove'
          ? 'Ataque-mover · clic en el destino o en un enemigo · clic derecho o Esc para cancelar'
          : client.mode.kind === 'repair'
            ? 'Reparar · clic en un edificio tuyo dañado · Shift para varios · clic derecho o Esc para cancelar'
            : null,
  };
}

function ownerLabel(owner: number, player: number): string | undefined {
  if (owner === player) return undefined;
  return owner === 0 ? 'Naturaleza' : `Jugador ${owner}`;
}

function selectionView(client: GameClient, icons: Icons): SelectionView | null {
  const sim = client.sim;
  const e = sim.entities;
  const P = client.player;
  const ids = client.selection.values().filter((id) => e.isAlive(id));
  if (ids.length === 0) return null;

  if (ids.length > 1) {
    const byType = new Map<number, number[]>();
    for (const id of ids) if (e.has(id, Comp.Unit)) (byType.get(e.unitType[id]) ?? byType.set(e.unitType[id], []).get(e.unitType[id])!).push(id);
    const first = ids[0];
    return {
      icon: icons.unit(e.unitType[first] as UnitType, e.owner[first]),
      title: `${ids.length} unidades`,
      lines: [],
      groups: [...byType].map(([type, list]) => ({
        icon: icons.unit(type as UnitType, e.owner[list[0]]),
        name: `${list.length} × ${UNIT_DEFS[type as UnitType].name}`,
        ids: list,
      })),
    };
  }

  const id = ids[0];
  const owner = e.owner[id];
  if (e.has(id, Comp.Unit)) {
    const type = e.unitType[id] as UnitType;
    const lines: string[] = [];
    if (e.has(id, Comp.Worker)) {
      lines.push(client.describeTask(id));
      if (e.carryAmount[id] > 0) lines.push(`Lleva ${e.carryAmount[id]} de ${RESOURCE_NAMES[e.carryKind[id] as Resource].toLowerCase()}`);
    }
    if (e.has(id, Comp.Resource)) lines.push(`Comida: ${e.resAmount[id]}`);
    const attack = sim.stats.unit(owner, type).attack;
    if (attack && !e.has(id, Comp.Worker) && owner === P) lines.push(`Postura: ${STANCE_NAMES[e.stance[id] as Stance].toLowerCase()}`);
    const us = sim.stats.unit(owner, type);
    const stats: SelectionStat[] = [];
    if (attack) {
      const ranged = attack.range > 0;
      stats.push({ kind: 'attack', value: String(attack.melee + attack.pierce), title: ranged ? 'Ataque a distancia' : 'Ataque cuerpo a cuerpo' });
      if (ranged) stats.push({ kind: 'range', value: String(Math.round(attack.range / 256)), title: 'Alcance (casillas)' });
    }
    stats.push({ kind: 'armor', value: `${us.armor.melee}/${us.armor.pierce}`, title: 'Armadura cuerpo a cuerpo / a distancia' });
    stats.push({ kind: 'speed', value: (UNIT_DEFS[type].speed).toFixed(1).replace('.', ','), title: 'Velocidad (casillas por segundo)' });
    return {
      icon: icons.unit(type, owner),
      title: UNIT_DEFS[type].name,
      owner: ownerLabel(owner, P),
      lines,
      stats,
      hp: { cur: e.hp[id], max: e.maxHp[id] },
    };
  }

  if (e.has(id, Comp.Building)) {
    const type = e.buildingType[id] as BuildingType;
    const def = BUILDING_DEFS[type];
    const lines: string[] = [];
    const stats: SelectionStat[] = [];
    let progress: SelectionView['progress'];
    let queue: SelectionView['queue'];
    let queueStatus: string | undefined;
    if (!e.built[id]) {
      const total = def.buildTime * sim.tickRate * 256;
      progress = { label: 'En construcción', value: e.buildProgress[id] / total };
    } else {
      if (def.food) lines.push(`Comida restante: ${e.resAmount[id]}`);
      if (def.dropsite.length > 0 && def.dropsite.length < 4) {
        lines.push(`Acepta: ${def.dropsite.map((r) => RESOURCE_NAMES[r].toLowerCase()).join(' y ')}`);
      }
      if (def.pop > 0) stats.push({ kind: 'pop', value: `+${def.pop}`, title: 'Población que da' });
      if (def.garrison) stats.push({ kind: 'garrison', value: `${sim.garrisonCount.get(id) ?? 0}/${def.garrison}`, title: 'Guarnición' });
      const q = e.queue[id] ?? [];
      if (q.length > 0) {
        queue = q.map((item, i) => {
          if (isTechItem(item)) {
            const tech = (item - TECH_BASE) as TechType;
            return { icon: icons.tech(tech, owner), name: TECH_DEFS[tech].name, progress: i === 0 ? e.trainProgress[id] / researchTicks(sim, tech) : 0 };
          }
          const unit = sim.stats.trainedType(owner, item as UnitType);
          return { icon: icons.unit(item as UnitType, owner), name: UNIT_DEFS[unit].name, progress: i === 0 ? e.trainProgress[id] / trainTicks(sim, unit) : 0 };
        });
        if (isTechItem(q[0])) queueStatus = `Investigando: ${queue[0].name}`;
        else if (!e.trainStarted[id] && !sim.players.hasRoom(owner, UNIT_DEFS[q[0] as UnitType].pop)) queueStatus = 'Esperando: faltan casas';
        else queueStatus = `Entrenando: ${queue[0].name}`;
      }
    }
    return {
      icon: icons.building(type, owner),
      title: def.name,
      owner: ownerLabel(owner, P),
      lines,
      stats,
      hp: { cur: e.hp[id], max: e.maxHp[id] },
      progress,
      queue,
      queueStatus,
      demolish: demolishOf(client, icons),
    };
  }

  // Fuente de recursos.
  const kind = e.resKind[id] as Resource;
  return {
    icon: icons.resource(kind),
    title: client.nodeName(id),
    lines: [`${RESOURCE_NAMES[kind]}: ${e.resAmount[id]}`],
  };
}

function demolishOf(client: GameClient, icons: Icons): SelectionView['demolish'] {
  const view = client.demolishView();
  return view ? { ...view, icon: icons.of({ kind: 'action', action: 'demolish' }, client.player) } : undefined;
}

function wonderCountdowns(client: GameClient): string[] {
  const sim = client.sim;
  const out: string[] = [];
  const total = WONDER_MINUTES * 60 * sim.tickRate;
  sim.players.wonderTicks.forEach((ticks, p) => {
    if (ticks <= 0) return;
    const left = Math.max(0, Math.ceil((total - ticks) / sim.tickRate));
    const who = p === client.player ? 'Tu Catedral' : `Catedral del jugador ${p}`;
    out.push(`${who}: ${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`);
  });
  return out;
}

function gameOverView(client: GameClient): HudSnapshot['gameOver'] {
  const sim = client.sim;
  if (client.gameOverDismissed) return null;
  const P = client.player;
  if (sim.winner !== 0) {
    const won = sim.winner === P;
    const how = sim.winReason === 'wonder' ? 'la Catedral resistió diez minutos en pie' : 'no queda nadie en pie que le haga frente';
    const beaten = client.rivals.map((r) => r.name).join(', ');
    return won
      ? {
          won,
          title: '¡Victoria!',
          text:
            sim.winReason === 'wonder'
              ? 'Tu Catedral ha resistido diez minutos: el reino es tuyo.'
              : beaten
                ? `Has vencido a ${beaten}.`
                : 'Has conquistado a todos tus rivales.',
        }
      : { won, title: 'Derrota', text: `${client.nameOf(sim.winner)} ha ganado: ${how}.` };
  }
  if (sim.players.defeated[P]) return { won: false, title: 'Derrota', text: 'Has perdido todas tus unidades y edificios.' };
  return null;
}
