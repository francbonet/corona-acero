import { Faction } from '../data/factions';

/**
 * Escudos de las coronas (docs/GDD.md §8), en pixel art de 20 × 22 y sin DOM: la UI los convierte en imagen
 * y los tests comparan los píxeles. Los colores son los esmaltes de la heráldica con la gama de la biblia de
 * arte (oro, gules, azur, plata, púrpura).
 */

export const SHIELD_W = 20;
export const SHIELD_H = 22;

export interface ShieldImage {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
}

const TINCTURES: Readonly<Record<string, string>> = {
  // Contorno y sombra.
  k: '#1a120c',
  // Oro, con su tono oscuro para los perfiles.
  O: '#e3b23c',
  o: '#a8782a',
  // Gules.
  R: '#b8262a',
  r: '#7a1418',
  // Azur.
  B: '#2f4fa8',
  b: '#1c2f6e',
  // Plata.
  W: '#ece6d6',
  w: '#c8c0b0',
  // Púrpura.
  P: '#7a2a7a',
  // Gris (al azar).
  G: '#7a756c',
  g: '#a8a296',
};

/** Filas rectas antes de que los costados empiecen a curvarse. */
const STRAIGHT = 4;

/**
 * Medio ancho del escudo en la fila `y`: escudo de punta clásico, con cada costado como un arco de radio igual
 * al ancho, centrado en el costado contrario; los dos arcos se juntan en la punta.
 */
function halfWidth(y: number): number {
  const dy = y - STRAIGHT;
  if (dy <= 0) return SHIELD_W / 2;
  const w = SHIELD_W;
  return Math.max(0, Math.sqrt(Math.max(0, w * w - dy * dy)) - w / 2);
}

function inside(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= SHIELD_W || y >= SHIELD_H) return false;
  return Math.abs(x + 0.5 - SHIELD_W / 2) < halfWidth(y + 0.5);
}

/** Distancia (en píxeles, por la rejilla) al borde del escudo: 0 en el contorno. */
function depth(x: number, y: number): number {
  for (let d = 0; d < 6; d++) {
    for (let dy = -d - 1; dy <= d + 1; dy++) {
      for (let dx = -d - 1; dx <= d + 1; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === d + 1 && !inside(x + dx, y + dy)) return d;
      }
    }
  }
  return 6;
}

// ── Muebles (figuras) ──────────────────────────────────────────────────

const CASTLE = ['O.O.O', 'OOOOO', '.OOO.', '.OkO.', 'OOOOO'];
const LION_SMALL = ['.PP..', 'PPP.P', '.PPP.', '.P.P.', 'PP.PP'];
const LION_PASSANT = ['.OO......O.', 'OOkO....O..', '.OOOOOOOO..', '..OOOOOOO..', '..O.O..O.O.'];
const LIS = ['..O..', '.OOO.', 'O.O.O', 'OOOOO', '..O..', '.OOO.', '.O.O.'];
const QUINA = ['BBB', 'BWB', 'BBB', '.B.'];
const PT_CASTLE = ['O.O', 'OOO'];
const LION_RAMPANT = [
  '...RR....',
  '..RRRR...',
  '.RkRRR.R.',
  '..RRRR.RR',
  '...RRRRR.',
  '...RRRR..',
  '..RRRRR..',
  '..RRRRRR.',
  '..RR..RR.',
  '.RR...RR.',
  'RRR..RRR.',
];
const QUESTION = ['.OOO.', 'O...O', '...O.', '..O..', '..O..', '.....', '..O..'];

type Grid = (string | null)[][];

function stamp(grid: Grid, sprite: readonly string[], x0: number, y0: number): void {
  sprite.forEach((row, dy) => {
    [...row].forEach((c, dx) => {
      const x = x0 + dx;
      const y = y0 + dy;
      if (c !== '.' && inside(x, y) && depth(x, y) > 0) grid[y][x] = c;
    });
  });
}

/** Campo del escudo: la función da el esmalte de cada píxel interior. */
function field(grid: Grid, at: (x: number, y: number, d: number) => string): void {
  for (let y = 0; y < SHIELD_H; y++) {
    for (let x = 0; x < SHIELD_W; x++) {
      if (!inside(x, y)) continue;
      const d = depth(x, y);
      grid[y][x] = d === 0 ? 'k' : at(x, y, d);
    }
  }
}

function paint(faction: Faction | 'random', grid: Grid): void {
  switch (faction) {
    case Faction.Castilla:
      // Cuartelado: castillo de oro en gules y león de púrpura en plata.
      field(grid, (x, y) => ((x < 10) === (y < 11) ? 'R' : 'W'));
      stamp(grid, CASTLE, 2, 3);
      stamp(grid, LION_SMALL, 12, 3);
      stamp(grid, LION_SMALL, 3, 13);
      stamp(grid, CASTLE, 11, 13);
      break;
    case Faction.Inglaterra:
      // De gules, tres leones pasantes de oro.
      field(grid, () => 'R');
      stamp(grid, LION_PASSANT, 4, 2);
      stamp(grid, LION_PASSANT, 4, 7);
      stamp(grid, LION_PASSANT, 5, 12);
      break;
    case Faction.Aragon:
      // De oro, cuatro palos de gules (la señal real).
      field(grid, (x) => (Math.floor((x - 1) / 2) % 2 === 1 ? 'R' : 'O'));
      break;
    case Faction.Francia:
      // De azur, tres flores de lis de oro.
      field(grid, () => 'B');
      stamp(grid, LIS, 3, 3);
      stamp(grid, LIS, 12, 3);
      stamp(grid, LIS, 7, 11);
      break;
    case Faction.Nazari:
      // De gules, una banda de oro con el lema escrito.
      field(grid, (x, y) => {
        const c = x - y * 0.95;
        if (Math.abs(c) < 0.6) return (x + y) % 3 === 0 ? 'k' : 'O';
        if (Math.abs(c) < 2.1) return 'O';
        if (Math.abs(c) < 2.8) return 'o';
        return 'R';
      });
      break;
    case Faction.Portugal:
      // De plata, cinco escudetes de azur en cruz; bordura de gules con siete castillos de oro.
      field(grid, (_x, _y, d) => (d <= 3 ? 'R' : 'W'));
      for (const [x, y] of [
        [3, 1],
        [8, 1],
        [14, 1],
        [1, 7],
        [1, 12],
        [16, 7],
        [16, 12],
      ] as const) {
        stamp(grid, PT_CASTLE, x, y);
      }
      stamp(grid, QUINA, 8, 4);
      stamp(grid, QUINA, 4, 9);
      stamp(grid, QUINA, 8, 9);
      stamp(grid, QUINA, 12, 9);
      stamp(grid, QUINA, 8, 14);
      break;
    case Faction.Escocia:
      // De oro, un león rampante de gules dentro de un doble trechor.
      field(grid, (_x, _y, d) => (d === 2 || d === 4 ? 'R' : 'O'));
      stamp(grid, LION_RAMPANT, 5, 5);
      break;
    default:
      // Al azar: campo gris con una interrogación.
      field(grid, (_x, _y, d) => (d === 1 ? 'g' : 'G'));
      stamp(grid, QUESTION, 7, 6);
  }
}

/** Píxeles del escudo de una corona (o el de «al azar»). */
export function renderShield(faction: Faction | 'random'): ShieldImage {
  const grid: Grid = Array.from({ length: SHIELD_H }, () => new Array<string | null>(SHIELD_W).fill(null));
  paint(faction, grid);
  const rgba = new Uint8ClampedArray(SHIELD_W * SHIELD_H * 4);
  for (let y = 0; y < SHIELD_H; y++) {
    for (let x = 0; x < SHIELD_W; x++) {
      const c = grid[y][x];
      if (!c) continue;
      const hex = TINCTURES[c] ?? '#ff00ff';
      const i = (y * SHIELD_W + x) * 4;
      rgba[i] = Number.parseInt(hex.slice(1, 3), 16);
      rgba[i + 1] = Number.parseInt(hex.slice(3, 5), 16);
      rgba[i + 2] = Number.parseInt(hex.slice(5, 7), 16);
      rgba[i + 3] = 255;
    }
  }
  return { width: SHIELD_W, height: SHIELD_H, rgba };
}
