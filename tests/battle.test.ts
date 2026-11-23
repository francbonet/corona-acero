import { describe, expect, it } from 'vitest';
import { Stance } from '../src/data/combat';
import { UnitType } from '../src/data/units';
import { FP_ONE, tileCenterFixed } from '../src/engine/fixed';
import { GameMap } from '../src/map/game-map';
import { meleeCapacity } from '../src/sim/combat';
import { Comp } from '../src/sim/entities';
import { formationGoals } from '../src/sim/formation';
import { Simulation } from '../src/sim/simulation';

const TICK_RATE = 20;

function arena(width = 48, height = 32): Simulation {
  return new Simulation({ map: new GameMap(width, height), seed: 9, tickRate: TICK_RATE });
}

const alive = (sim: Simulation, ids: number[]) => ids.filter((id) => sim.entities.has(id, Comp.Unit));

/** Atacantes cuerpo a cuerpo de cada objetivo en este momento. */
function meleeOn(sim: Simulation, attackers: number[]): Map<number, number> {
  const e = sim.entities;
  const count = new Map<number, number>();
  for (const id of alive(sim, attackers)) {
    const t = e.attackTarget[id];
    if (t) count.set(t, (count.get(t) ?? 0) + 1);
  }
  return count;
}

describe('batallas ordenadas', () => {
  it('un grupo que carga se reparte entre los enemigos: nadie tiene más de los que caben a su alrededor', () => {
    const sim = arena();
    const ours = sim.spawnGroup(UnitType.Militia, 1, 10, 16, 10);
    const theirs = sim.spawnGroup(UnitType.Militia, 2, 30, 16, 10);
    sim.schedule({ type: 'attackMove', player: 1, units: ours, x: tileCenterFixed(30), y: tileCenterFixed(16) });
    let worst = 0;
    let mostTargets = 0;
    for (let t = 0; t < 40 * TICK_RATE && alive(sim, theirs).length > 0 && alive(sim, ours).length > 0; t++) {
      sim.step();
      const count = meleeOn(sim, ours);
      for (const n of count.values()) worst = Math.max(worst, n);
      mostTargets = Math.max(mostTargets, count.size);
    }
    // Al entrar en combate, cada uno coge a un enemigo distinto (como mucho, los que caben alrededor de uno).
    expect(mostTargets).toBeGreaterThanOrEqual(6);
    expect(worst).toBeLessThanOrEqual(meleeCapacity(sim, theirs[0]) + 1);
  });

  it('una orden de ataque de un grupo sobre una unidad: los que no caben van a por los de al lado', () => {
    const sim = arena();
    const ours = sim.spawnGroup(UnitType.Militia, 1, 12, 16, 10);
    const theirs = sim.spawnGroup(UnitType.Spearman, 2, 20, 16, 6);
    for (const id of theirs) sim.entities.hp[id] = 400; // que aguanten, para ver el reparto
    const target = theirs[0];
    sim.schedule({ type: 'attack', player: 1, units: ours, target });
    for (let t = 0; t < 12 * TICK_RATE; t++) sim.step();
    const count = meleeOn(sim, ours);
    expect(count.get(target) ?? 0).toBeLessThanOrEqual(meleeCapacity(sim, target));
    expect(count.get(target) ?? 0).toBeGreaterThan(0);
    // Los demás pelean contra otros lanceros.
    expect(count.size).toBeGreaterThanOrEqual(3);
  });

  it('los que pegan cuerpo a cuerpo rodean a su objetivo por lados distintos', () => {
    const sim = arena();
    const ours = sim.spawnGroup(UnitType.Militia, 1, 10, 16, 4);
    const [target] = sim.spawnGroup(UnitType.Swordsman, 2, 20, 16, 1);
    sim.entities.hp[target] = 2000;
    sim.entities.stance[target] = Stance.NoAttack; // no devuelve los golpes: solo miramos dónde se ponen
    sim.schedule({ type: 'attack', player: 1, units: ours, target });
    for (let t = 0; t < 20 * TICK_RATE; t++) sim.step();
    const e = sim.entities;
    // Cada uno en un puesto distinto de los 8 de alrededor (llegan por el oeste: lo envuelven por ese lado).
    const sides = new Set(
      ours.map((id) => {
        const angle = Math.atan2(e.y[id] - e.y[target], e.x[id] - e.x[target]);
        return Math.round((angle / (Math.PI / 4) + 8) % 8) % 8;
      }),
    );
    expect(sides.size).toBe(ours.length);
    for (const id of ours) expect(e.attackTarget[id]).toBe(target);
  });

  it('un ejército marcha en formación: el cuerpo a cuerpo delante, los arqueros detrás, al paso del más lento', () => {
    const sim = arena();
    const militia = sim.spawnGroup(UnitType.Militia, 1, 8, 16, 6);
    const archers = sim.spawnGroup(UnitType.Archer, 1, 8, 12, 4);
    const knights = sim.spawnGroup(UnitType.Knight, 1, 8, 20, 2);
    const all = [...militia, ...archers, ...knights];
    const goals = formationGoals(sim, all, tileCenterFixed(36), tileCenterFixed(16));
    expect(goals).not.toBeNull();
    const at = new Map(goals?.map((g) => [g.id, g.x]));
    // Marcha hacia el este: delante = más al este.
    const front = Math.min(...[...militia, ...knights].map((id) => at.get(id) ?? 0));
    const back = Math.max(...archers.map((id) => at.get(id) ?? 0));
    expect(back).toBeLessThan(front);

    sim.schedule({ type: 'move', player: 1, units: all, x: tileCenterFixed(36), y: tileCenterFixed(16) });
    sim.step();
    const e = sim.entities;
    // Los caballeros, más rápidos, van al paso de los arqueros y las milicias.
    expect(e.speedCap[knights[0]]).toBe(Math.min(...all.map((id) => e.speed[id])));
    for (let t = 0; t < 10 * TICK_RATE; t++) sim.step();
    const xs = all.map((id) => e.x[id]);
    // Siguen juntos: la caballería no se ha adelantado.
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(5 * FP_ONE);
  });

  it('un grupo pequeño o que ya está en su sitio no forma: se reparte como siempre', () => {
    const sim = arena();
    const few = sim.spawnGroup(UnitType.Militia, 1, 8, 16, 3);
    expect(formationGoals(sim, few, tileCenterFixed(30), tileCenterFixed(16))).toBeNull();
    const many = sim.spawnGroup(UnitType.Militia, 1, 20, 16, 8);
    expect(formationGoals(sim, many, tileCenterFixed(21), tileCenterFixed(16))).toBeNull();
    const villagers = sim.spawnGroup(UnitType.Villager, 1, 8, 24, 8);
    expect(formationGoals(sim, villagers, tileCenterFixed(30), tileCenterFixed(24))).toBeNull();
  });
});
