/**
 * Paleta provisional (ver docs/arte.md). Rampas de oscuro a claro.
 * Se sustituirá por la paleta definitiva de assets/palette.hex.
 */
export const PALETTE = {
  grass: ['#2f5a2a', '#3e7a35', '#58994a', '#7fb85e'],
  dirt: ['#5c3d24', '#7a5232', '#9a6c42', '#b98a58'],
  sand: ['#b8a06a', '#d4bc84', '#e8d6a2'],
  shallow: ['#33639a', '#3f74a8', '#6a9ccc'],
  deep: ['#1b2d57', '#22396b', '#2f4f8a'],
  pine: ['#1a3826', '#234a33', '#2f6040', '#3f7a4f'],
  olive: ['#3f4a28', '#5d6b3a', '#7a8a4a', '#9aa860'],
  bark: ['#3b2716', '#5c3d24', '#7a5232'],
  outline: '#1f3d1d',
  flowerRed: '#c84a3a',
  flowerCream: '#e8d6a2',
  shadow: 'rgba(18, 13, 10, 0.35)',
  ink: '#120d0a',
  gold: '#e3b23c',
} as const;

/** Rampas de color de equipo [oscuro, medio, claro]. Índice = jugador (0 = Gaia). */
export const TEAM_COLORS: readonly (readonly [string, string, string])[] = [
  ['#5a5a5a', '#8a8a8a', '#c0c0c0'], // 0 Gaia
  ['#1e3a8a', '#3a5fcd', '#7a9cf0'], // 1 azul
  ['#7a1f1f', '#c0392b', '#e8735f'], // 2 rojo
  ['#1f5a2a', '#2e9a48', '#7fd08a'], // 3 verde
  ['#8a6a12', '#d8b02a', '#f2dc6a'], // 4 amarillo
];
