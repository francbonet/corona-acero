import { describe, expect, it } from 'vitest';
import * as sprites from '../src/render/node-sprites';

const { NODE_COLORS } = sprites;
const TEAM = new Set(['T', 't', 'd']);

function check(name: string, rows: readonly string[]): void {
  it(`${name}: filas del mismo ancho y colores válidos`, () => {
    const width = rows[0].length;
    for (const row of rows) {
      expect(row.length, `${name}: "${row}"`).toBe(width);
      for (const ch of row) if (ch !== '.') expect(ch in NODE_COLORS || TEAM.has(ch), `${name}: "${ch}"`).toBe(true);
    }
  });
}

describe('sprites de recursos, cargas e iconos', () => {
  check('oveja sacrificada', sprites.CARCASS);
  check('bandera', sprites.RALLY_FLAG);
  check('chispa', sprites.SPARK);
  sprites.FIRE.forEach((rows, i) => check(`fuego ${i}`, rows));
  sprites.CARRY_SPRITES.forEach((rows, i) => check(`carga ${i}`, rows));
});

import { ACTION_ICONS, TECH_GLYPHS } from '../src/ui/action-icons';

describe('iconos de acciones', () => {
  for (const [key, rows] of Object.entries(ACTION_ICONS)) check(`acción ${key}`, rows);
  for (const [key, rows] of Object.entries(TECH_GLYPHS)) check(`glifo ${key}`, rows);
});
