/** Lo que se ve en pantalla, en píxeles de mundo: centro y semiancho/semialto. */
export interface ViewRect {
  readonly cx: number;
  readonly cy: number;
  readonly halfW: number;
  readonly halfH: number;
}

/**
 * Volumen y panorama de un sonido según dónde ocurre respecto a la pantalla: a tope dentro de la vista
 * (algo menos hacia los bordes), apagándose fuera de ella y en silencio a más de una pantalla de distancia.
 * Devuelve `null` si no se oye.
 */
export function spatialize(wx: number, wy: number, view: ViewRect): { pan: number; gain: number } | null {
  const nx = (wx - view.cx) / Math.max(1, view.halfW);
  const ny = (wy - view.cy) / Math.max(1, view.halfH);
  const d = Math.max(Math.abs(nx), Math.abs(ny));
  const gain = d <= 1 ? 1 - 0.3 * d : 0.7 * (1 - (d - 1));
  if (gain <= 0.02) return null;
  return { pan: Math.max(-0.85, Math.min(0.85, nx * 0.75)), gain };
}
