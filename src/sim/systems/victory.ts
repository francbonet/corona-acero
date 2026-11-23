import { BUILDING_DEFS, WONDER_MINUTES, type BuildingType } from '../../data/buildings';
import { UNIT_DEFS, type UnitType } from '../../data/units';
import { MAX_PLAYERS } from '../players';
import type { Simulation } from '../simulation';

/** Cada cuántos ticks se comprueba la victoria. */
export const VICTORY_EVERY = 20;

/**
 * Condiciones de victoria (GDD §11):
 * - Derrota: un jugador sin unidades (que ocupen población) ni edificios (sin contar muros) queda eliminado.
 * - Conquista: gana el último que quede.
 * - Catedral: si una Catedral terminada aguanta en pie WONDER_MINUTES minutos, su dueño gana.
 */
export function checkVictory(sim: Simulation): void {
  if (sim.tick % VICTORY_EVERY !== 0) return;
  const e = sim.entities;
  const players = sim.players;
  const alive = new Uint8Array(MAX_PLAYERS);
  const wonder = new Uint8Array(MAX_PLAYERS);
  for (const id of sim.unitIds) {
    if (e.isAlive(id) && UNIT_DEFS[e.unitType[id] as UnitType].pop > 0) alive[e.owner[id]] = 1;
  }
  for (const id of sim.buildingIds) {
    if (!e.isAlive(id) || !e.built[id]) continue;
    const def = BUILDING_DEFS[e.buildingType[id] as BuildingType];
    if (!def.wall) alive[e.owner[id]] = 1;
    if (def.wonder) wonder[e.owner[id]] = 1;
  }

  for (let p = 1; p < MAX_PLAYERS; p++) {
    if (!players.active[p] || players.defeated[p]) continue;
    if (!alive[p]) {
      players.defeated[p] = 1;
      sim.emit({ kind: 'defeat', player: p });
    }
    players.wonderTicks[p] = wonder[p] ? players.wonderTicks[p] + VICTORY_EVERY : 0;
    if (sim.winner === 0 && players.wonderTicks[p] >= WONDER_MINUTES * 60 * sim.tickRate) sim.declareWinner(p, 'wonder');
  }

  if (sim.winner !== 0) return;
  let participants = 0;
  let last = 0;
  let remaining = 0;
  for (let p = 1; p < MAX_PLAYERS; p++) {
    if (!players.active[p]) continue;
    participants++;
    if (!players.defeated[p]) {
      remaining++;
      last = p;
    }
  }
  if (participants >= 2 && remaining === 1) sim.declareWinner(last, 'conquest');
}
