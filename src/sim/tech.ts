import { BUILDING_DEFS, type BuildingType } from '../data/buildings';
import { BUILDINGS_TO_ADVANCE, ERA_DEFS } from '../data/eras';
import { TECH_COUNT, TECH_DEFS, type TechType } from '../data/techs';
import { UNIT_DEFS, type UnitType } from '../data/units';
import { toFixed } from '../engine/fixed';
import { Comp } from './entities';
import type { Simulation } from './simulation';

/** Prefijo de las tecnologías en las colas de producción (las unidades van tal cual: 0..999). */
export const TECH_BASE = 1000;

export function isTechItem(item: number): boolean {
  return item >= TECH_BASE;
}

/** Ticks de investigación. */
export function researchTicks(sim: Simulation, tech: TechType): number {
  return Math.max(1, Math.round(TECH_DEFS[tech].time * sim.tickRate));
}

/** Tipos de edificio terminados del jugador que cuentan para avanzar desde su era actual. */
export function eraBuildings(sim: Simulation, player: number): Set<BuildingType> {
  const e = sim.entities;
  const era = sim.players.era[player];
  const out = new Set<BuildingType>();
  for (const b of sim.buildingIds) {
    if (!e.isAlive(b) || e.owner[b] !== player || !e.built[b]) continue;
    const def = BUILDING_DEFS[e.buildingType[b] as BuildingType];
    if (def.countsForEra && (def.era ?? 0) === era) out.add(e.buildingType[b] as BuildingType);
  }
  return out;
}

/**
 * ¿Puede investigar esta tecnología? Devuelve el motivo si no (o null si sí; el coste se comprueba aparte).
 * Para la Era de la Pólvora basta con tener un castillo.
 */
export function researchBlocker(sim: Simulation, player: number, tech: TechType): string | null {
  const def = TECH_DEFS[tech];
  const players = sim.players;
  if (players.hasTech(player, tech)) return 'Ya investigada';
  if (players.isResearching(player, tech)) return 'Ya se está investigando';
  if (def.faction !== undefined && def.faction !== players.faction[player]) return 'De otra facción';
  if (players.era[player] < def.era) return `Requiere: ${ERA_DEFS[def.era].title}`;
  for (const r of def.requires ?? []) if (!players.hasTech(player, r)) return `Requiere: ${TECH_DEFS[r].name}`;
  if (def.advance !== undefined) {
    const have = eraBuildings(sim, player);
    const castle = [...have].some((t) => t === 18);
    if (!(def.advance === 3 && castle) && have.size < BUILDINGS_TO_ADVANCE) {
      return `Requiere ${BUILDINGS_TO_ADVANCE} edificios distintos de la ${ERA_DEFS[players.era[player]].title.toLowerCase()} (tienes ${have.size})`;
    }
  }
  return null;
}

/** Tecnologías que se investigan en un tipo de edificio para este jugador (sin las de otras facciones). */
export function techsAt(sim: Simulation, player: number, building: BuildingType): TechType[] {
  const out: TechType[] = [];
  for (let t = 0; t < TECH_COUNT; t++) {
    const def = TECH_DEFS[t as TechType];
    if (def.building !== building) continue;
    if (def.faction !== undefined && def.faction !== sim.players.faction[player]) continue;
    out.push(t as TechType);
  }
  return out;
}

/** Termina una investigación: avanza de era o aplica sus efectos a todo lo que ya existe. */
export function completeResearch(sim: Simulation, player: number, tech: TechType): void {
  const players = sim.players;
  players.researched[player * TECH_COUNT + tech] = 1;
  players.researching[player * TECH_COUNT + tech] = 0;
  const def = TECH_DEFS[tech];
  if (def.advance !== undefined) players.era[player] = def.advance;
  sim.stats.invalidate(player);
  refreshPlayerEntities(sim, player);
  sim.emit({ kind: 'research', player, tech });
}

/**
 * Lleva a las entidades existentes del jugador las estadísticas nuevas: mejoras de línea (cambian de tipo),
 * vida máxima (se suma la diferencia), velocidad y visión.
 */
export function refreshPlayerEntities(sim: Simulation, player: number): void {
  const e = sim.entities;
  const stats = sim.stats;
  for (let id = 1; id < e.highWater; id++) {
    if (e.owner[id] !== player) continue;
    const mask = e.mask[id];
    if (mask & Comp.Unit) {
      const type = e.unitType[id] as UnitType;
      const upgraded = stats.trainedType(player, type);
      if (upgraded !== type) {
        e.unitType[id] = upgraded;
        e.radius[id] = toFixed(UNIT_DEFS[upgraded].radius);
      }
      const s = stats.unit(player, e.unitType[id] as UnitType);
      if (s.hp !== e.maxHp[id]) {
        e.hp[id] = Math.max(1, e.hp[id] + (s.hp - e.maxHp[id]));
        e.maxHp[id] = s.hp;
      }
      e.speed[id] = s.speed;
      e.los[id] = s.los;
    } else if (mask & Comp.Building) {
      const s = stats.building(player, e.buildingType[id] as BuildingType);
      if (s.hp !== e.maxHp[id]) {
        e.hp[id] = Math.max(1, Math.round((e.hp[id] * s.hp) / e.maxHp[id]));
        e.maxHp[id] = s.hp;
      }
    }
  }
}
