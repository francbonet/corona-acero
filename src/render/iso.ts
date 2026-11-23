/**
 * Geometría isométrica 2:1.
 *
 * Convenciones:
 * - Coordenadas de casilla (tx, ty): el eje X baja hacia la derecha y el eje Y baja hacia la izquierda.
 * - Coordenadas de mundo: píxeles del arte sin escalar (antes de aplicar el zoom de la cámara).
 * - `tileToWorld` devuelve el vértice superior del rombo de la casilla.
 */

/** Ancho de una casilla en píxeles del mundo. */
export const TILE_W = 32;
/** Alto de una casilla en píxeles del mundo. */
export const TILE_H = 16;
export const HALF_W = TILE_W / 2;
export const HALF_H = TILE_H / 2;

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Casilla (entera o fraccionaria) → píxel del mundo. Para una casilla entera, es el vértice superior del rombo. */
export function tileToWorld(tx: number, ty: number): Point {
  return { x: (tx - ty) * HALF_W, y: (tx + ty) * HALF_H };
}

/** Centro del rombo de una casilla entera, en píxeles del mundo. Es el ancla de unidades, árboles y edificios. */
export function tileCenterToWorld(tx: number, ty: number): Point {
  const p = tileToWorld(tx, ty);
  return { x: p.x, y: p.y + HALF_H };
}

/** Píxel del mundo → coordenadas de casilla continuas (inversa exacta de `tileToWorld`). */
export function worldToTile(wx: number, wy: number): Point {
  const a = wx / HALF_W;
  const b = wy / HALF_H;
  return { x: (b + a) / 2, y: (b - a) / 2 };
}

/** Píxel del mundo → casilla entera que lo contiene. */
export function worldToTileFloor(wx: number, wy: number): Point {
  const t = worldToTile(wx, wy);
  return { x: Math.floor(t.x), y: Math.floor(t.y) };
}

/** Rectángulo que envuelve un mapa de `width`×`height` casillas, en píxeles del mundo. */
export function mapWorldBounds(width: number, height: number): Bounds {
  return {
    minX: -height * HALF_W,
    maxX: width * HALF_W,
    minY: 0,
    maxY: (width + height) * HALF_H,
  };
}

/**
 * Tramo de píxeles que ocupa la fila `row` (0..TILE_H-1) del rombo pixel art, relativo al centro horizontal.
 * Devuelve [inicio, fin), con anchos 2, 6, 10 … 30, 30 … 6, 2.
 * Con estos anchos las casillas encajan sin huecos ni solapes, y cada píxel pintado tiene su centro
 * dentro del rombo matemático, así que `worldToTileFloor` coincide con lo que se ve en pantalla.
 */
export function diamondRowSpan(row: number): [number, number] {
  const r = row < HALF_H ? row : TILE_H - 1 - row;
  const half = 2 * r + 1;
  return [-half, half];
}
