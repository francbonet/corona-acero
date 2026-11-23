import { describe, expect, it } from 'vitest';
import { UnitType } from '../src/data/units';
import { FP_SHIFT, tileCenterFixed } from '../src/engine/fixed';
import { GameMap } from '../src/map/game-map';
import { FACTION_COUNT, type Faction } from '../src/data/factions';
import { generateEuropeMap } from '../src/map/europe';
import { connectLand, generateMatchMap, landRegions } from '../src/map/generator';
import { Deposit, TERRAIN_INFO, Terrain, TreeKind } from '../src/map/terrain';
import { Simulation } from '../src/sim/simulation';

/** Mapa de prueba: hierba con un lago en medio (agua profunda rodeada de somera). */
function lakeMap(): GameMap {
  const map = new GameMap(30, 20);
  for (let y = 0; y < 20; y++) {
    for (let x = 8; x < 22; x++) {
      const deep = x >= 10 && x < 20 && y >= 2 && y < 18;
      map.terrain[y * 30 + x] = deep ? Terrain.Deep : y < 1 || y > 18 ? Terrain.Grass : Terrain.Shallow;
    }
  }
  return map;
}

describe('agua', () => {
  it('el agua no se pisa, ni la somera ni la profunda; los vados sí (pero no se construye en ellos)', () => {
    expect(TERRAIN_INFO[Terrain.Shallow].walkable).toBe(false);
    expect(TERRAIN_INFO[Terrain.Deep].walkable).toBe(false);
    expect(TERRAIN_INFO[Terrain.Ford].walkable).toBe(true);
    expect(TERRAIN_INFO[Terrain.Ford].buildable).toBe(false);
  });

  it('una unidad mandada al otro lado del lago lo rodea por tierra y nunca pisa el agua', () => {
    const sim = new Simulation({ map: lakeMap(), seed: 1, tickRate: 20 });
    const [id] = sim.spawnGroup(UnitType.Scout, 1, 4, 10, 1);
    sim.schedule({ type: 'move', player: 1, units: [id], x: tileCenterFixed(26), y: tileCenterFixed(10) });
    const e = sim.entities;
    let arrived = false;
    for (let t = 0; t < 20 * 60 && !arrived; t++) {
      sim.step();
      const terrain = sim.map.terrainAt(e.x[id] >> FP_SHIFT, e.y[id] >> FP_SHIFT);
      expect(TERRAIN_INFO[terrain].walkable, `tick ${t}`).toBe(true);
      arrived = Math.abs((e.x[id] >> FP_SHIFT) - 26) <= 1 && Math.abs((e.y[id] >> FP_SHIFT) - 10) <= 1;
    }
    expect(arrived).toBe(true);
  });

  it('dos tierras separadas por agua se unen con un vado; un islote pequeño se queda como está', () => {
    const map = new GameMap(30, 20);
    map.terrain.fill(Terrain.Shallow);
    for (let y = 2; y < 18; y++) {
      for (let x = 1; x < 10; x++) map.terrain[y * 30 + x] = Terrain.Grass;
      for (let x = 15; x < 28; x++) map.terrain[y * 30 + x] = Terrain.Grass;
    }
    map.terrain[19 * 30 + 12] = Terrain.Grass; // islote de una casilla, lejos del camino más corto
    const starts = [
      { x: 5, y: 10 },
      { x: 20, y: 10 },
    ];
    expect(connectLand(map, starts)).toBe(1);
    const { region } = landRegions(map);
    expect(region[10 * 30 + 5]).toBe(region[10 * 30 + 20]);
    expect(region[19 * 30 + 12]).not.toBe(region[10 * 30 + 5]);
    let fords = 0;
    for (const t of map.terrain) if (t === Terrain.Ford) fords++;
    // El camino más corto: 5 casillas de agua, de dos de ancho.
    expect(fords).toBeGreaterThanOrEqual(5);
    expect(fords).toBeLessThanOrEqual(12);
  });

  it('en los mapas de partida todas las posiciones iniciales están unidas por tierra (o vados)', () => {
    for (const seed of ['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho']) {
      for (const [players, size] of [
        [2, 96],
        [3, 96],
        [4, 120],
      ] as const) {
        const map = generateMatchMap({ width: size, height: size, seed, players });
        const { region, sizes } = landRegions(map);
        const home = region[map.starts[0].y * size + map.starts[0].x];
        expect(home, `${seed}/${players}`).toBeGreaterThan(0);
        for (const s of map.starts) expect(region[s.y * size + s.x], `${seed}/${players}`).toBe(home);
        // Y no queda ninguna tierra grande aislada.
        for (let r = 1; r < sizes.length; r++) if (r !== home) expect(sizes[r], `${seed}/${players} región ${r}`).toBeLessThan(40);
      }
    }
  });

  it('ni los bosques ni las minas dejan aislada ninguna posición inicial (tampoco en Europa, por el vado de Calais y los Pirineos)', () => {
    /** Casillas libres (sin agua, árbol ni yacimiento) a las que se llega desde la primera posición. */
    const freeReach = (map: GameMap) => {
      const w = map.width;
      const seen = new Uint8Array(w * map.height);
      const free = (i: number) => TERRAIN_INFO[map.terrain[i] as Terrain].walkable && map.trees[i] === TreeKind.None && map.deposits[i] === Deposit.None;
      const s0 = map.starts[0].y * w + map.starts[0].x;
      const stack = [s0];
      seen[s0] = 1;
      while (stack.length > 0) {
        const i = stack.pop() as number;
        const x = i % w;
        for (const j of [i - w, i + w, x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1]) {
          if (j < 0 || j >= seen.length || seen[j] || !free(j)) continue;
          seen[j] = 1;
          stack.push(j);
        }
      }
      return map.starts.every((st) => seen[st.y * w + st.x] === 1);
    };
    const all = Array.from({ length: FACTION_COUNT }, (_, f) => f as Faction);
    for (const seed of ['uno', 'dos', 'tres', 'calais', 'pirineos']) {
      expect(freeReach(generateEuropeMap({ seed, factions: all })), `Europa ${seed}`).toBe(true);
      expect(freeReach(generateMatchMap({ width: 120, height: 120, seed, players: 4 })), `generado ${seed}`).toBe(true);
    }
  }, 30_000);
});
