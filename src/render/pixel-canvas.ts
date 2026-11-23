/** Utilidades para dibujar pixel art en un lienzo 2D, píxel a píxel (sin suavizado). */

export type Palette = Readonly<Record<string, string>>;

export function createCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear un contexto 2D');
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

export function px(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

/**
 * Dibuja un sprite de texto con su esquina superior izquierda en (ox, oy).
 * `team` sustituye T/t/d por los tonos claro/medio/oscuro del equipo.
 */
export function drawTextSprite(
  ctx: CanvasRenderingContext2D,
  rows: readonly string[],
  ox: number,
  oy: number,
  palette: Palette,
  team?: readonly [string, string, string],
): void {
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      let color: string | undefined;
      if (team && (ch === 'T' || ch === 't' || ch === 'd')) color = team[ch === 'T' ? 2 : ch === 't' ? 1 : 0];
      else color = palette[ch];
      if (!color) throw new Error(`Carácter "${ch}" sin color en la paleta`);
      px(ctx, ox + x, oy + y, color);
    });
  });
}

/** Sprite de texto → data URL de PNG (para iconos del HUD). */
export function textSpriteDataUrl(rows: readonly string[], palette: Palette, team?: readonly [string, string, string]): string {
  const { canvas, ctx } = createCanvas(rows[0].length, rows.length);
  drawTextSprite(ctx, rows, 0, 0, palette, team);
  return canvas.toDataURL();
}

/** Media fila del rombo de `n` casillas de ancho: tramo [inicio, fin) relativo al centro, para la fila `row`. */
export function diamondSpanN(n: number, row: number): [number, number] {
  const h = 16 * n;
  const r = row < h / 2 ? row : h - 1 - row;
  const half = 2 * r + 1;
  return [-half, half];
}
