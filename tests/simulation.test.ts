import { describe, expect, it } from 'vitest';
import { Stance } from '../src/data/combat';
import { UnitType } from '../src/data/units';
import { FP_ONE, fixedLength, fixedToTile, tileCenterFixed } from '../src/engine/fixed';
import { generateTestMap } from '../src/map/generator';
import { GameMap } from '../src/map/game-map';
import { Terrain } from '../src/map/terrain';
import type { Command } from '../src/sim/commands';
import { MoveState } from '../src/sim/entities';
import { Simulation } from '../src/sim/simulation';

const TICK_RATE = 20;

/** Escenario de movimiento puro: sin animales y con todas las unidades en postura "no atacar". */
function sandbox(seed = 42): { sim: Simulation; mine: number[]; theirs: number[] } {
  const map = generateTestMap({ width: 64, height: 64, seed: 'pruebas' });
  map.animals.length = 0;
  const sim = new Simulation({ map, seed, tickRate: TICK_RATE });
  const mine = [
    ...sim.spawnGroup(UnitType.Villager, 1, 32, 32, 12),
    ...sim.spawnGroup(UnitType.Militia, 1, 30, 30, 8),
    ...sim.spawnGroup(UnitType.Scout, 1, 34, 30, 4),
  ];
  const theirs = sim.spawnGroup(UnitType.Militia, 2, 35, 35, 5);
  for (const id of [...mine, ...theirs]) sim.entities.stance[id] = Stance.NoAttack;
  return { sim, mine, theirs };
}

function run(sim: Simulation, ticks: number): void {
  for (let i = 0; i < ticks; i++) sim.step();
}

const at = (x: number, y: number) => ({ x: tileCenterFixed(x), y: tileCenterFixed(y) });

describe('Simulation', () => {
  it('una unidad sola va al punto exacto', () => {
    const map = new GameMap(16, 16);
    const sim = new Simulation({ map, seed: 1, tickRate: TICK_RATE });
    const id = sim.spawnUnit(UnitType.Villager, 1, tileCenterFixed(2), tileCenterFixed(2));
    sim.schedule({ type: 'move', player: 1, units: [id], x: 10 * FP_ONE + 50, y: 12 * FP_ONE + 200 });
    run(sim, 400);
    const e = sim.entities;
    expect(e.moveState[id]).toBe(MoveState.Idle);
    expect(e.x[id]).toBe(10 * FP_ONE + 50);
    expect(e.y[id]).toBe(12 * FP_ONE + 200);
  });

  it('rodea el agua en vez de atravesarla', () => {
    const map = new GameMap(20, 20);
    for (let y = 0; y < 16; y++) map.terrain[y * 20 + 10] = Terrain.Deep;
    const sim = new Simulation({ map, seed: 1, tickRate: TICK_RATE });
    const id = sim.spawnUnit(UnitType.Scout, 1, tileCenterFixed(5), tileCenterFixed(5));
    const target = at(15, 5);
    sim.schedule({ type: 'move', player: 1, units: [id], ...target });
    const e = sim.entities;
    let maxY = 0;
    for (let i = 0; i < 600; i++) {
      sim.step();
      expect(sim.grid.passable(fixedToTile(e.x[id]), fixedToTile(e.y[id]))).toBe(true);
      maxY = Math.max(maxY, fixedToTile(e.y[id]));
    }
    expect(maxY).toBeGreaterThanOrEqual(16); // tuvo que bajar hasta el final del muro de agua
    expect(fixedLength(e.x[id] - target.x, e.y[id] - target.y)).toBeLessThan(FP_ONE);
  });

  it('un grupo llega al destino, repartido y sin pisar casillas bloqueadas', () => {
    const { sim, mine } = sandbox();
    // Un prado al otro lado de un lago (el agua no se pisa).
    const target = at(44, 46);
    sim.schedule({ type: 'move', player: 1, units: mine, ...target });
    run(sim, 900);
    const e = sim.entities;
    for (const id of mine) {
      expect(e.moveState[id]).toBe(MoveState.Idle);
      expect(sim.grid.passable(fixedToTile(e.x[id]), fixedToTile(e.y[id]))).toBe(true);
      expect(fixedLength(e.x[id] - target.x, e.y[id] - target.y)).toBeLessThan(6 * FP_ONE);
    }
    // No se amontonan: casi ninguna pareja se solapa de forma apreciable.
    let overlaps = 0;
    for (const a of mine) {
      for (const b of mine) {
        if (a >= b) continue;
        const d = fixedLength(e.x[a] - e.x[b], e.y[a] - e.y[b]);
        if (d < (e.radius[a] + e.radius[b]) / 2) overlaps++;
      }
    }
    expect(overlaps).toBeLessThanOrEqual(2);
  });

  it('ignora órdenes sobre unidades de otro jugador', () => {
    const { sim, theirs } = sandbox();
    const before = theirs.map((id) => [sim.entities.x[id], sim.entities.y[id]]);
    sim.schedule({ type: 'move', player: 1, units: theirs, ...at(10, 10) });
    run(sim, 100);
    expect(theirs.map((id) => [sim.entities.x[id], sim.entities.y[id]])).toEqual(before);
  });

  it('stop detiene a las unidades', () => {
    const { sim, mine } = sandbox();
    sim.schedule({ type: 'move', player: 1, units: mine, ...at(5, 5) });
    run(sim, 20);
    sim.schedule({ type: 'stop', player: 1, units: mine });
    run(sim, 2);
    for (const id of mine) expect(sim.entities.moveState[id]).toBe(MoveState.Idle);
  });

  it('respeta el presupuesto de caminos por tick', () => {
    const { sim, mine } = sandbox();
    sim.pathing.nodeBudget = 1;
    sim.schedule({ type: 'move', player: 1, units: mine, ...at(10, 50) });
    sim.step();
    // Con presupuesto mínimo se resuelve una petición por tick.
    expect(sim.pathing.pending).toBe(mine.length - 1);
  });

  it('es determinista: misma semilla y mismas órdenes, mismo estado en cada tick', () => {
    const script: { tick: number; command: (mine: number[]) => Command }[] = [
      { tick: 0, command: (m) => ({ type: 'move', player: 1, units: m, ...at(20, 44) }) },
      { tick: 120, command: (m) => ({ type: 'move', player: 1, units: m.slice(0, 10), ...at(45, 20) }) },
      { tick: 200, command: () => ({ type: 'debugSpawn', player: 2, unitType: UnitType.Scout, tileX: 30, tileY: 34, count: 6 }) },
      { tick: 260, command: (m) => ({ type: 'stop', player: 1, units: m.slice(5, 9) }) },
      { tick: 300, command: (m) => ({ type: 'move', player: 1, units: m, ...at(32, 32) }) },
    ];
    const play = () => {
      const { sim, mine } = sandbox(7);
      for (const s of script) sim.schedule(s.command(mine), s.tick);
      const hashes: number[] = [];
      for (let i = 0; i < 600; i++) {
        sim.step();
        hashes.push(sim.stateHash());
      }
      return { hashes, log: sim.log.length };
    };
    const a = play();
    const b = play();
    expect(a.log).toBe(script.length);
    expect(b.hashes).toEqual(a.hashes);

    // Y una orden distinta cambia el estado.
    const { sim, mine } = sandbox(7);
    sim.schedule({ type: 'move', player: 1, units: mine, ...at(21, 44) });
    run(sim, 50);
    expect(sim.stateHash()).not.toBe(a.hashes[49]);
  });
});
