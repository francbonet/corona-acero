/**
 * Icono de la versión de escritorio (`npm run icono`): la corona del icono de la pestaña, al triple, en pixel art
 * sobre una rejilla de 64 × 64 con marco dorado, ampliada a 1024 × 1024 sin suavizar. Escribe `build/icon.png` (del que
 * electron-builder saca los iconos de macOS, Windows y Linux) y `electron/icon.png` (el de la ventana).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GRID = 64;
/** Cada píxel de la corona ocupa 3 × 3 celdas. */
const CROWN_SCALE = 3;

const hex = (h) => [Number.parseInt(h.slice(1, 3), 16), Number.parseInt(h.slice(3, 5), 16), Number.parseInt(h.slice(5, 7), 16), 255];

/** La corona del icono de la pestaña (index.html), en su rejilla de 16: [x, y, ancho, alto, color]. */
const CROWN = [
  [2, 4, 2, 3, '#e3b23c'],
  [7, 2, 2, 5, '#e3b23c'],
  [12, 4, 2, 3, '#e3b23c'],
  [2, 3, 2, 1, '#f6dc7a'],
  [7, 1, 2, 1, '#f6dc7a'],
  [12, 3, 2, 1, '#f6dc7a'],
  [2, 7, 12, 4, '#e3b23c'],
  [4, 6, 2, 1, '#e3b23c'],
  [10, 6, 2, 1, '#e3b23c'],
  [6, 5, 1, 2, '#e3b23c'],
  [9, 5, 1, 2, '#e3b23c'],
  [2, 11, 12, 2, '#c08a2c'],
  [2, 13, 12, 1, '#7a5420'],
  [3, 7, 1, 3, '#f6dc7a'],
  [5, 8, 2, 2, '#c0392b'],
  [9, 8, 2, 2, '#c0392b'],
  [7, 8, 2, 2, '#3a5fcd'],
];

/** Píxeles de la rejilla de 32 (null = transparente). */
function pixels() {
  const grid = Array.from({ length: GRID }, () => new Array(GRID).fill(null));
  // Cuadrado redondeado (esquinas en escalera): contorno oscuro, marco dorado, filete y fondo de madera.
  const inside = (x, y, inset) => {
    const lo = 2 + inset;
    const hi = GRID - 3 - inset;
    if (x < lo || y < lo || x > hi || y > hi) return false;
    const cut = Math.max(0, 9 - inset);
    const dx = Math.max(0, lo + cut - x, x - (hi - cut));
    const dy = Math.max(0, lo + cut - y, y - (hi - cut));
    return dx * dx + dy * dy <= cut * cut;
  };
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (!inside(x, y, 0)) continue;
      if (!inside(x, y, 2)) grid[y][x] = '#140d08';
      else if (!inside(x, y, 3)) grid[y][x] = '#f2dc6a';
      else if (!inside(x, y, 5)) grid[y][x] = '#a8782a';
      else if (!inside(x, y, 7)) grid[y][x] = '#5c3d24';
      else {
        // Fondo con un claro en el centro, tramado en el borde.
        const d = (x - 31.5) ** 2 + (y - 30.5) ** 2;
        grid[y][x] = d < 300 || (d < 460 && (x + y) % 2 === 0) ? '#3b2716' : '#24180f';
      }
    }
  }
  // La corona al triple, centrada (ocupa x 2–13 e y 1–13 de su rejilla de 16), con su sombra.
  const k = CROWN_SCALE;
  const ox = Math.floor((GRID - 12 * k) / 2);
  const oy = Math.floor((GRID - 13 * k) / 2);
  const cell = (fx, fy) => [(fx - 2) * k + ox, (fy - 1) * k + oy];
  for (const shadow of [true, false]) {
    for (const [x0, y0, w, h, color] of CROWN) {
      for (let fy = y0; fy < y0 + h; fy++) {
        for (let fx = x0; fx < x0 + w; fx++) {
          const [cx, cy] = cell(fx, fy);
          for (let dy = 0; dy < k; dy++) {
            for (let dx = 0; dx < k; dx++) {
              const x = cx + dx + (shadow ? 2 : 0);
              const y = cy + dy + (shadow ? 2 : 0);
              grid[y][x] = shadow ? '#0c0806' : color;
            }
          }
        }
      }
    }
  }
  return grid;
}

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function png(size) {
  const grid = pixels();
  const scale = size / GRID;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const c = grid[Math.floor(y / scale)][Math.floor(x / scale)];
      if (!c) continue;
      const [r, g, b, a] = hex(c);
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

for (const [file, size] of [
  ['build/icon.png', 1024],
  ['electron/icon.png', 512],
]) {
  const out = join(ROOT, file);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, png(size));
  console.log(`${file}: ${size} × ${size}`);
}
