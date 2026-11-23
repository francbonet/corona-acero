import { describe, expect, it } from 'vitest';
import { type PickTarget, pickAt, pickInRect } from '../src/game/picking';
import { Selection } from '../src/game/selection';
import { isDoubleClick } from '../src/input/pointer-controller';

const targets: PickTarget[] = [
  { id: 1, kind: 'unit', x: 0, y: 0, halfW: 6, height: 18 },
  { id: 2, kind: 'unit', x: 4, y: 6, halfW: 6, height: 18 }, // delante de la 1 y solapada
  { id: 3, kind: 'unit', x: 100, y: 50, halfW: 8, height: 15 },
];
const tree: PickTarget = { id: 4, kind: 'node', x: 2, y: 4, halfW: 10, height: 40 };
const house: PickTarget = { id: 5, kind: 'building', x: 200, y: 100, halfW: 32, height: 0, poly: [168, 100, 200, 116, 232, 100, 232, 86, 200, 70, 168, 86] };

describe('pickAt', () => {
  it('elige la unidad bajo el cursor', () => {
    expect(pickAt(targets, 100, 40)?.id).toBe(3);
    expect(pickAt(targets, 50, 50)).toBeNull();
  });

  it('si se solapan, gana la de delante', () => {
    expect(pickAt(targets, 2, -5)?.id).toBe(2);
    expect(pickAt(targets, -5, -15)?.id).toBe(1); // solo toca la de atrás
  });

  it('las unidades tienen prioridad sobre un árbol que las tapa', () => {
    expect(pickAt([tree, ...targets], 2, -5)?.id).toBe(2);
    expect(pickAt([tree, ...targets], 9, -30)?.id).toBe(4);
  });

  it('los edificios se detectan por su silueta', () => {
    expect(pickAt([house], 200, 90)?.id).toBe(5);
    expect(pickAt([house], 170, 72)).toBeNull(); // esquina vacía del lienzo, fuera del tejado
  });
});

describe('pickInRect', () => {
  it('selecciona las unidades cuyo cuerpo cae en el recuadro', () => {
    expect(pickInRect(targets, { minX: -10, minY: -20, maxX: 10, maxY: 10 })).toEqual([1, 2]);
    expect(pickInRect(targets, { minX: 90, minY: 30, maxX: 110, maxY: 60 })).toEqual([3]);
    expect(pickInRect(targets, { minX: 200, minY: 200, maxX: 300, maxY: 300 })).toEqual([]);
  });
});

describe('Selection', () => {
  it('reemplaza, añade, alterna y limpia', () => {
    const s = new Selection();
    s.replace([3, 1]);
    expect(s.values()).toEqual([1, 3]);
    s.add([2]);
    s.toggle(1);
    expect(s.values()).toEqual([2, 3]);
    s.prune((id) => id !== 3);
    expect(s.values()).toEqual([2]);
    s.clear();
    expect(s.size).toBe(0);
  });
});

describe('doble clic', () => {
  it('solo cuenta si son dos clics rápidos sobre la misma unidad', () => {
    expect(isDoubleClick({ time: 1000, id: 7 }, 7, 1200)).toBe(true);
    expect(isDoubleClick({ time: 1000, id: 7 }, 8, 1200)).toBe(false); // otra unidad del mismo tipo
    expect(isDoubleClick({ time: 1000, id: 7 }, 7, 1500)).toBe(false); // demasiado lento
  });
});

import { BuildingType } from '../src/data/buildings';
import { GameClient } from '../src/game/client';
import { GameMap } from '../src/map/game-map';
import { Simulation } from '../src/sim/simulation';

describe('panel de órdenes del aldeano', () => {
  it('Q y W abren las páginas de edificios (no entran a colocar) y V vuelve', () => {
    const sim = new Simulation({ map: new GameMap(20, 20), seed: 1, tickRate: 20 });
    sim.addPlayer(1, 0);
    const v = sim.spawnUnit(0, 1, 5 * 256 + 128, 5 * 256 + 128);
    const selection = new Selection();
    selection.replace([v]);
    const client = new GameClient(sim, selection, 1, () => {}, () => 0);
    client.pressHotkey('KeyW');
    expect(client.mode.kind).toBe('normal');
    const military = client.commandButtons();
    expect(military[0]?.icon).toEqual({ kind: 'building', type: BuildingType.Barracks });
    client.pressHotkey('KeyQ');
    expect(client.mode).toEqual({ kind: 'place', building: BuildingType.Barracks });
    client.cancelPlacement();
    client.pressHotkey('KeyV');
    expect(client.commandButtons()[1]?.icon).toEqual({ kind: 'page', page: 2 });
  });
});
