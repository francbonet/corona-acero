/// <reference types="node" />
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { UNIT_DEFS, UNIT_TYPE_COUNT, type UnitType } from '../src/data/units';
import { ANIM_TAGS, DIR_TAGS, TEAM_KEYS } from '../src/render/assets/aseprite';
import { unitModel } from '../src/render/rig/catalog';
import { BASE_RAMPS } from '../src/render/rig/materials';
import { DIRECTIONS, type Ramps, rasterize } from '../src/render/rig/raster';
import { encodePng } from './png';

/**
 * Exporta las figuras generadas como plantillas de Aseprite (`npm run plantillas`): una hoja PNG por unidad,
 * con el color de equipo en los magentas reservados, y su JSON en formato "Array" con las etiquetas
 * `<animación>/<dirección>`. Se abren en Aseprite para dibujar encima; al copiar el PNG y el JSON a
 * `assets/units/`, el juego los usa en lugar de la figura generada.
 */
const OUT = process.env.PLANTILLAS_DIR ?? 'assets/plantillas';
const hex = (c: readonly number[]) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const keys = [hex(TEAM_KEYS[3]), hex(TEAM_KEYS[2]), hex(TEAM_KEYS[1]), hex(TEAM_KEYS[0])] as const;
const RAMPS: Ramps = { ...BASE_RAMPS, team: keys, teamDark: keys };

it('exporta las plantillas de las unidades', () => {
  mkdirSync(OUT, { recursive: true });
  for (let type = 0; type < UNIT_TYPE_COUNT; type++) {
    const m = unitModel(type as UnitType);
    const key = UNIT_DEFS[type as UnitType].key;
    const perDir = m.anims.reduce((n, a) => n + a.frames, 0);
    const width = m.cell * perDir;
    const height = m.cell * DIRECTIONS.length;
    const rgba = new Uint8ClampedArray(width * height * 4);
    const frames: { frame: { x: number; y: number; w: number; h: number }; duration: number }[] = [];
    const tags: { name: string; from: number; to: number; direction: string }[] = [];
    DIRECTIONS.forEach((dir, d) => {
      let col = 0;
      for (const spec of m.anims) {
        const from = frames.length;
        for (let f = 0; f < spec.frames; f++) {
          const r = rasterize(m.pose(spec.name, f), dir, { width: m.cell, height: m.cell, originX: m.originX, originY: m.originY, ramps: RAMPS });
          for (let y = 0; y < m.cell; y++) {
            const src = y * m.cell * 4;
            const dst = ((d * m.cell + y) * width + col * m.cell) * 4;
            rgba.set(r.rgba.subarray(src, src + m.cell * 4), dst);
          }
          frames.push({ frame: { x: col * m.cell, y: d * m.cell, w: m.cell, h: m.cell }, duration: spec.frameMs });
          col++;
        }
        tags.push({ name: `${ANIM_TAGS[spec.name]}/${DIR_TAGS[dir]}`, from, to: frames.length - 1, direction: 'forward' });
      }
    });
    writeFileSync(join(OUT, `${key}.png`), encodePng(width, height, rgba));
    const slices = [{ name: 'pies', color: '#0000ffff', keys: [{ frame: 0, bounds: { x: 0, y: 0, w: m.cell, h: m.cell }, pivot: { x: m.originX, y: m.originY } }] }];
    const json = { frames, meta: { app: 'Corona y Acero (plantilla)', image: `${key}.png`, size: { w: width, h: height }, frameTags: tags, slices } };
    writeFileSync(join(OUT, `${key}.json`), JSON.stringify(json, null, 1));
  }
});
