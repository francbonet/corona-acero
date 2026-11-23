import { UNIT_DEFS, UNIT_TYPE_COUNT, type UnitType } from '../../data/units';
import { type AsepriteSheet, parseAseprite } from './aseprite';

/** Arte dibujado a mano que sustituye a la figura generada de una unidad. */
export interface UnitOverride {
  readonly sheet: AsepriteSheet;
  /** Píxeles de la hoja PNG entera. */
  readonly pixels: ImageData;
}

// Vite reúne aquí las hojas que haya en assets/units/ (`<clave de la unidad>.png` + `.json`).
const JSONS = import.meta.glob('/assets/units/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const PNGS = import.meta.glob('/assets/units/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar ${url}`));
    img.src = url;
  });
}

/**
 * Carga las hojas de Aseprite de `assets/units/` (por ejemplo `assets/units/aldeano.png` y `aldeano.json`).
 * Las unidades sin hoja siguen usando su figura generada. Una hoja mal formada se avisa en la consola y se ignora.
 */
export async function loadUnitOverrides(): Promise<Map<UnitType, UnitOverride>> {
  const out = new Map<UnitType, UnitOverride>();
  for (let type = 0; type < UNIT_TYPE_COUNT; type++) {
    const key = UNIT_DEFS[type as UnitType].key;
    const json = JSONS[`/assets/units/${key}.json`];
    const png = PNGS[`/assets/units/${key}.png`];
    if (!json || !png) continue;
    try {
      const sheet = parseAseprite(json);
      const img = await loadImage(png);
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.drawImage(img, 0, 0);
      out.set(type as UnitType, { sheet, pixels: ctx.getImageData(0, 0, img.width, img.height) });
    } catch (err) {
      console.warn(`Hoja de sprites de "${key}" ignorada:`, err);
    }
  }
  return out;
}
