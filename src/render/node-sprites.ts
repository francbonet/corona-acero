/**
 * Sprites de texto de fuentes de recursos, cargas, bandera de reunión e iconos del HUD.
 * Cada carácter es un píxel; '.' es transparente. T/t/d = color de equipo (claro/medio/oscuro).
 */

export const NODE_COLORS: Readonly<Record<string, string>> = {
  // hojas y bayas (verde más oscuro y azulado que la hierba, para que el arbusto destaque)
  l: '#2c6440',
  L: '#163322',
  j: '#4a8a5a',
  r: '#ef4f5f',
  R: '#8a1f2f',
  // roca y metales
  a: '#b0a898',
  A: '#8a8478',
  z: '#5e584e',
  k: '#3a3530',
  u: '#e3b23c',
  U: '#f2dc6a',
  v: '#9a7220',
  // madera y carne
  w: '#9a6c42',
  b: '#7a5232',
  B: '#3b2716',
  p: '#d98a7a',
  // lana
  W: '#ece6d6',
  V: '#b9b09c',
  q: '#2e2a26',
  // piel (icono de población)
  s: '#e0a878',
  // caza
  c: '#c08a52',
  C: '#9a6a3a',
  x: '#5c3d24',
  g: '#5a4030',
  G: '#3a2a20',
  // fuego
  f: '#ece6d6',
};

export const CARCASS = [
  '....WWWWWW......',
  '..VWWWWWWWWq....',
  '.VWWWrWWWWWqq...',
  '..VVVVVVVVq.....',
];

/** Chispa de un golpe cuerpo a cuerpo. */
export const SPARK = ['..u..', '.uUu.', 'uUfUu', '.uUu.', '..u..'];

/** Llamas de un edificio dañado (dos fotogramas). */
export const FIRE: readonly (readonly string[])[] = [
  ['..r..', '.rur.', '.ruUr', 'ruUUr', 'rUfur', '.ruu.'],
  ['.r...', '.rr..', 'rurr.', 'ruUur', 'ruUfr', '.ruu.'],
];

/** Bandera del punto de reunión: el mástil apoya en la última fila. */
export const RALLY_FLAG = [
  '.TTTTT....',
  '.TTtTTT...',
  '.tTTTTTT..',
  '.TTtTTT...',
  '.dddd.....',
  '.k........',
  '.k........',
  '.k........',
  '.k........',
  '.k........',
  '.k........',
  '.k........',
  'kkk.......',
];

/** Lo que lleva un aldeano a cuestas, por recurso (comida, madera, piedra, oro). */
export const CARRY_SPRITES: readonly (readonly string[])[] = [
  ['.rr.', 'rRrr', '.rR.'],
  ['bwwwwb', 'BbbbbB'],
  ['.aa.', 'aAaA', '.zz.'],
  ['.uU.', 'Uuuv', '.vv.'],
];
