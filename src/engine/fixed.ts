/**
 * Punto fijo de la simulación: 1 casilla = 256 unidades enteras.
 * Dentro de la simulación las posiciones, velocidades y radios son siempre enteros,
 * así el resultado es idéntico en cualquier navegador o máquina.
 */
export const FP_SHIFT = 8;
export const FP_ONE = 1 << FP_SHIFT;
export const FP_HALF = FP_ONE >> 1;

/** Casillas (p. ej. un valor de los datos) → punto fijo. Para preparar datos, no para el bucle de simulación. */
export function toFixed(tiles: number): number {
  return Math.round(tiles * FP_ONE);
}

/** Punto fijo → casillas, para el render. */
export function fromFixed(value: number): number {
  return value / FP_ONE;
}

/** Casilla entera que contiene una coordenada en punto fijo (suelo, también con negativos). */
export function fixedToTile(value: number): number {
  return value >> FP_SHIFT;
}

/** Centro de una casilla entera, en punto fijo. */
export function tileCenterFixed(tile: number): number {
  return (tile << FP_SHIFT) + FP_HALF;
}

/** Raíz cuadrada entera exacta: floor(√n), para 0 ≤ n < 2^52. */
export function isqrt(n: number): number {
  if (n <= 0) return 0;
  let r = Math.floor(Math.sqrt(n));
  while (r * r > n) r--;
  while ((r + 1) * (r + 1) <= n) r++;
  return r;
}

/** Longitud entera de un vector en punto fijo. */
export function fixedLength(dx: number, dy: number): number {
  return isqrt(dx * dx + dy * dy);
}

/** División entera truncada hacia cero. */
export function idiv(a: number, b: number): number {
  return Math.trunc(a / b);
}
