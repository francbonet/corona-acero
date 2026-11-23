/**
 * Tarjetas de los iconos del HUD (docs/arte.md §7): cuadrados de 44×44 píxeles que el icono llena entero, con un
 * fondo pintado en pixel art. Las unidades y los edificios van sobre un paisaje (cielo, lomas lejanas y hierba);
 * las tecnologías y las acciones, sobre un fondo oscuro con su glifo a doble tamaño. Todo es puro (píxeles
 * RGBA), así que se prueba en Node; el HUD lo pasa a data URLs.
 */

export const ICON_SIZE = 44;

export type Backdrop = 'field' | 'dark';

export interface CardImage {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
}

type RGB = readonly [number, number, number];
const hex = (h: string): RGB => {
  const n = Number.parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const SKY = ['#5f8fbf', '#7aa6cf', '#9cc0dd', '#c3d8e6', '#e3e6d6'].map(hex);
const HILLS = ['#4f7a66', '#628a72'].map(hex);
const GRASS = ['#2f6a2c', '#3e7a35', '#4f8a3c', '#64a04a'].map(hex);
const DARK = ['#120c08', '#1e140c', '#2b1d14', '#3b2716', '#4a3220'].map(hex);

/** Ruido fijo de 0 a 1 por píxel. */
function noise(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

/** Tono tramado entre los de una rampa para un valor continuo de 0 a 1. */
function ramp(colors: readonly RGB[], t: number, x: number, y: number): RGB {
  const v = Math.max(0, Math.min(1, t)) * (colors.length - 1);
  const i = Math.floor(v);
  const f = v - i;
  return colors[Math.min(colors.length - 1, f > BAYER[(y & 3) * 4 + (x & 3)] ? i + 1 : i)];
}

/** Fondo de una tarjeta. `horizon` es la fila donde empieza la hierba (para apoyar ahí los edificios). */
export function backdrop(kind: Backdrop, horizon = 32): CardImage {
  const S = ICON_SIZE;
  const rgba = new Uint8ClampedArray(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let c: RGB;
      if (kind === 'dark') {
        // Fondo oscuro con un halo cálido en el centro.
        const d = Math.hypot(x + 0.5 - S / 2, y + 0.5 - S / 2) / (S * 0.62);
        c = ramp(DARK, 1 - d, x, y);
      } else {
        // Lomas lejanas con el perfil ondulado, cielo que se aclara hacia ellas y hierba con motas.
        const hill = horizon - 5 + Math.round(Math.sin(x * 0.23) * 1.5 + Math.sin(x * 0.61 + 1) * 1);
        if (y >= horizon) {
          const t = 1 - (y - horizon) / Math.max(1, S - horizon);
          c = ramp(GRASS, 0.35 + t * 0.55 + (noise(x, y) - 0.5) * 0.35, x, y);
        } else if (y >= hill) {
          c = HILLS[y - hill < 2 ? 1 : 0];
        } else {
          c = ramp(SKY, y / Math.max(1, hill), x, y);
        }
        // Las esquinas algo más oscuras (viñeta), para centrar la vista.
        const corner = Math.hypot((x + 0.5) / S - 0.5, (y + 0.5) / S - 0.5);
        if (corner > 0.6 && BAYER[(y & 3) * 4 + (x & 3)] < (corner - 0.6) * 4) c = [c[0] * 0.8, c[1] * 0.8, c[2] * 0.8];
      }
      const k = (y * S + x) * 4;
      rgba[k] = c[0];
      rgba[k + 1] = c[1];
      rgba[k + 2] = c[2];
      rgba[k + 3] = 255;
    }
  }
  return { width: S, height: S, rgba };
}

/** Pinta `img` sobre la tarjeta en (ox, oy), recortando lo que se sale. Mezcla los semitransparentes. */
export function stamp(card: CardImage, img: CardImage, ox: number, oy: number, scale = 1): void {
  const S = card.width;
  for (let y = 0; y < img.height * scale; y++) {
    const ty = oy + y;
    if (ty < 0 || ty >= card.height) continue;
    for (let x = 0; x < img.width * scale; x++) {
      const tx = ox + x;
      if (tx < 0 || tx >= S) continue;
      const s = (Math.floor(y / scale) * img.width + Math.floor(x / scale)) * 4;
      const a = img.rgba[s + 3] / 255;
      if (a === 0) continue;
      const d = (ty * S + tx) * 4;
      for (let c = 0; c < 3; c++) card.rgba[d + c] = Math.round(img.rgba[s + c] * a + card.rgba[d + c] * (1 - a));
      card.rgba[d + 3] = 255;
    }
  }
}

/** Una imagen sobre fondo oscuro a doble tamaño, centrada (glifos de tecnologías y acciones de 16×16). */
export function glyphCard(img: CardImage): CardImage {
  const card = backdrop('dark');
  const scale = img.width * 2 <= ICON_SIZE - 6 && img.height * 2 <= ICON_SIZE - 6 ? 2 : 1;
  stamp(card, img, Math.floor((ICON_SIZE - img.width * scale) / 2), Math.floor((ICON_SIZE - img.height * scale) / 2), scale);
  return card;
}
