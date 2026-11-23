import { describe, expect, it } from 'vitest';
import { Difficulty } from '../src/ai/difficulty';
import { BuildingType } from '../src/data/buildings';
import { FACTION_COUNT, Faction } from '../src/data/factions';
import { createMatch, normalizeMatch, resolveFactions } from '../src/game/match';
import { EUROPE_SIZE, capitalTile, generateEuropeMap, landAt, projectLonLat, reachable } from '../src/map/europe';
import { Deposit, Terrain } from '../src/map/terrain';
import { renderShield } from '../src/render/heraldry';
import { Comp } from '../src/sim/entities';

const ALL = Array.from({ length: FACTION_COUNT }, (_, f) => f as Faction);

/** (e, n) de una casilla: e de oeste a este y n de sur a norte, como se ve en pantalla. */
const screen = (t: { x: number; y: number }) => ({ e: t.x - t.y, n: -(t.x + t.y) });

describe('mapa de Europa', () => {
  const map = generateEuropeMap({ seed: 'prueba', factions: ALL });

  it('cada corona sale de su capital, en tierra, y todas se alcanzan a pie (Gran Bretaña, por el vado de Calais)', () => {
    expect(map.width).toBe(EUROPE_SIZE);
    expect(map.starts).toEqual(ALL.map((f) => capitalTile(f)));
    const reach = reachable(map, map.starts[0]);
    for (const s of map.starts) {
      expect(map.terrainAt(s.x, s.y)).not.toBe(Terrain.Deep);
      expect(map.terrainAt(s.x, s.y)).not.toBe(Terrain.Shallow);
      expect(reach[s.y * map.width + s.x], `salida ${s.x},${s.y}`).toBe(1);
    }
  });

  it('las capitales están donde toca: de norte a sur y de oeste a este', () => {
    const at = (f: Faction) => screen(capitalTile(f));
    // Norte arriba: Escocia > Inglaterra > Francia > Castilla > Reino Nazarí.
    const northToSouth = [Faction.Escocia, Faction.Inglaterra, Faction.Francia, Faction.Castilla, Faction.Nazari];
    for (let i = 0; i + 1 < northToSouth.length; i++) expect(at(northToSouth[i]).n).toBeGreaterThan(at(northToSouth[i + 1]).n);
    // Oeste a la izquierda: Portugal < Castilla < Corona de Aragón.
    expect(at(Faction.Portugal).e).toBeLessThan(at(Faction.Castilla).e);
    expect(at(Faction.Castilla).e).toBeLessThan(at(Faction.Aragon).e);
    // Y separadas lo bastante para que quepan sus aldeas (al menos 25 casillas entre dos cualesquiera).
    for (const a of ALL) {
      for (const b of ALL) {
        if (a >= b) continue;
        const ta = capitalTile(a);
        const tb = capitalTile(b);
        expect(Math.hypot(ta.x - tb.x, ta.y - tb.y), `${a}-${b}`).toBeGreaterThanOrEqual(25);
      }
    }
  });

  it('Irlanda, las Baleares y África se ven pero no se alcanzan', () => {
    const reach = reachable(map, map.starts[0]);
    const tileOf = (lon: number, lat: number) => {
      const [e, n] = projectLonLat(lon, lat);
      return { x: Math.round((EUROPE_SIZE * (1 - n + e) - 1) / 2), y: Math.round((EUROPE_SIZE * (1 - n - e) - 1) / 2) };
    };
    for (const [name, lon, lat] of [
      ['Irlanda', -8, 53],
      ['Mallorca', 2.9, 39.65],
      ['África', 0, 34.5],
    ] as const) {
      expect(landAt(lon, lat), name).toBeGreaterThan(0);
      const t = tileOf(lon, lat);
      expect(reach[t.y * map.width + t.x], name).toBe(0);
    }
  });

  it('cada salida tiene sus recursos cerca, en tierra a la que se llega', () => {
    const reach = reachable(map, map.starts[0]);
    for (const s of map.starts) {
      const near = { gold: 0, stone: 0, berries: 0 };
      for (let y = s.y - 14; y <= s.y + 14; y++) {
        for (let x = s.x - 14; x <= s.x + 14; x++) {
          if (!map.inBounds(x, y) || !reach[y * map.width + x]) continue;
          const d = map.depositAt(x, y);
          if (d === Deposit.Gold) near.gold++;
          else if (d === Deposit.Stone) near.stone++;
          else if (d === Deposit.Berries) near.berries++;
        }
      }
      expect(near.gold, `oro en ${s.x},${s.y}`).toBeGreaterThanOrEqual(5);
      expect(near.stone, `piedra en ${s.x},${s.y}`).toBeGreaterThanOrEqual(3);
      expect(near.berries, `bayas en ${s.x},${s.y}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('la misma semilla da el mismo mapa; otra cambia los bosques pero no las costas', () => {
    const again = generateEuropeMap({ seed: 'prueba', factions: ALL });
    expect(again.trees).toEqual(map.trees);
    expect(again.deposits).toEqual(map.deposits);
    const other = generateEuropeMap({ seed: 'otra', factions: ALL });
    expect(other.trees).not.toEqual(map.trees);
    let differentCoast = 0;
    for (let i = 0; i < map.terrain.length; i++) if ((map.terrain[i] === Terrain.Deep) !== (other.terrain[i] === Terrain.Deep)) differentCoast++;
    // Solo cambian las casillas de la costa irregular.
    expect(differentCoast).toBeLessThan(map.terrain.length * 0.03);
  });
});

describe('partida en Europa', () => {
  it('no deja repetir corona: el repetido pasa a ir al azar, y el azar elige entre las libres', () => {
    const c = normalizeMatch({
      seed: 'x',
      mapSize: 'europe',
      faction: Faction.Castilla,
      rivals: [
        { faction: Faction.Castilla, difficulty: Difficulty.Medium },
        { faction: Faction.Francia, difficulty: Difficulty.Medium },
        { faction: Faction.Francia, difficulty: Difficulty.Medium },
      ],
    });
    expect(c.rivals.map((r) => r.faction)).toEqual(['random', Faction.Francia, 'random']);
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const f = resolveFactions({ ...c, seed });
      expect(new Set(f).size).toBe(4);
      expect(f[0]).toBe(Faction.Castilla);
      expect(f[2]).toBe(Faction.Francia);
    }
  });

  it('cada jugador empieza en la capital de su corona y las IA hacen crecer su economía', () => {
    const m = createMatch({
      seed: 'europa',
      mapSize: 'europe',
      faction: Faction.Aragon,
      rivals: [
        { faction: Faction.Escocia, difficulty: Difficulty.Medium },
        { faction: Faction.Nazari, difficulty: Difficulty.Medium },
        { faction: Faction.Francia, difficulty: Difficulty.Medium },
      ],
    });
    expect(m.factions).toEqual([Faction.Aragon, Faction.Escocia, Faction.Nazari, Faction.Francia]);
    const e = m.sim.entities;
    m.factions.forEach((f, i) => {
      const tc = m.starts[i].townCenter;
      expect(e.buildingType[tc]).toBe(BuildingType.TownCenter);
      const cap = capitalTile(f);
      expect(Math.abs(e.tileX[tc] + 2 - cap.x) + Math.abs(e.tileY[tc] + 2 - cap.y)).toBeLessThanOrEqual(1);
    });
    const villagers = (p: number) => {
      let n = 0;
      for (const id of m.sim.unitIds) if (e.isAlive(id) && e.owner[id] === p && (e.mask[id] & Comp.Worker) !== 0) n++;
      return n;
    };
    for (let i = 0; i < 20 * 150; i++) m.sim.step();
    for (const p of [2, 3, 4]) expect(villagers(p), `jugador ${p}`).toBeGreaterThan(7);
  }, 30_000);
});

describe('escudos', () => {
  it('cada corona tiene el suyo, distinto de los demás', () => {
    const images = [...ALL, 'random' as const].map((f) => renderShield(f));
    const keys = images.map((i) => i.rgba.join(','));
    expect(new Set(keys).size).toBe(images.length);
    for (const img of images) {
      let opaque = 0;
      for (let i = 3; i < img.rgba.length; i += 4) if (img.rgba[i]) opaque++;
      // La silueta del escudo es la misma y es simétrica.
      expect(opaque).toBeGreaterThan(300);
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          const a = img.rgba[(y * img.width + x) * 4 + 3];
          const b = img.rgba[(y * img.width + (img.width - 1 - x)) * 4 + 3];
          expect(a > 0).toBe(b > 0);
        }
      }
    }
  });
});
