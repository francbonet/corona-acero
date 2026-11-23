import type { Ramps } from './raster';

/**
 * Rampas de 4 tonos (oscuro → claro) de los materiales de las figuras, con la gama de manuscrito iluminado
 * de la biblia de arte: tierras saturadas, bermellón, lapislázuli y oro.
 */
export const BASE_RAMPS: Ramps = {
  skin: ['#7a4a30', '#b97a50', '#e0a878', '#f2c9a0'],
  skinDark: ['#4a2c1c', '#7a4a30', '#a86c46', '#c98a5c'],
  hair: ['#2b1d14', '#3b2716', '#5c3d24', '#7a5232'],
  hairBlond: ['#6a4a1c', '#9a7a32', '#c8a24a', '#e0c070'],
  hairRed: ['#4a1c10', '#7a321a', '#a84e26', '#cc6e38'],
  hairGrey: ['#4a4640', '#7a756c', '#a8a296', '#d0cabe'],
  skinPale: ['#8a5a40', '#c89070', '#e8b896', '#f8d8bc'],
  felt: ['#24261c', '#383a2a', '#4e5238', '#686c4a'],
  berry: ['#4a1220', '#8a2434', '#c0394a', '#e8735f'],
  sheepCurl: ['#8a8274', '#b8b0a0', '#d8d2c2', '#ece6d6'],
  eye: ['#120d0a', '#120d0a', '#120d0a', '#2b1d14'],
  straw: ['#7a6232', '#b8a06a', '#d4bc84', '#ece0b0'],
  linen: ['#7a7060', '#b9b09c', '#d8d0bc', '#ece6d6'],
  wool: ['#8a8478', '#c8c0b0', '#e2dccc', '#f4f0e6'],
  brown: ['#3b2716', '#5c3d24', '#7a5232', '#9a6c42'],
  pants: ['#2e2418', '#4a3a26', '#5e4a32', '#76603e'],
  leather: ['#3b2412', '#6a4224', '#8a5a32', '#a87444'],
  boot: ['#1e140c', '#2b1d14', '#3b2716', '#4f3420'],
  wood: ['#4a2e16', '#7a5232', '#9a6c42', '#b98a58'],
  woodDark: ['#2b1d14', '#4a3018', '#5c3d24', '#74502e'],
  steel: ['#3a3e4a', '#6a7080', '#a0a8b8', '#dfe4ec'],
  iron: ['#24262c', '#3e424c', '#5a5f6c', '#7c8290'],
  mail: ['#33363e', '#5a5f6c', '#7f8594', '#a8aebc'],
  gold: ['#6a4a12', '#a8782a', '#e3b23c', '#f6dc7a'],
  string: ['#b9b09c', '#d8d0bc', '#ece6d6', '#ffffff'],
  monk: ['#3a2a1c', '#5c4430', '#7a5c40', '#96785a'],
  rope: ['#6a5a3a', '#9a8a5a', '#b8a878', '#d4c89a'],
  horse: ['#3a2212', '#5c3a20', '#8a5a34', '#a8784a'],
  horseGrey: ['#4a4846', '#7a7874', '#a8a6a0', '#d0cec8'],
  horseDark: ['#1e140c', '#2b1d14', '#3b2716', '#4f3420'],
  horseDun: ['#5c4428', '#8e6e40', '#b8945c', '#d4b47c'],
  hoof: ['#120d0a', '#1e140c', '#2b1d14', '#3b2716'],
  sheepWool: ['#9a9284', '#cfc8b8', '#ece6d6', '#fbf8f0'],
  sheepFace: ['#1a1714', '#2e2a26', '#46403a', '#5c554c'],
  wolf: ['#3a3a38', '#5e5e5a', '#8a8a84', '#b0b0a8'],
  deer: ['#5c3a1c', '#8a5a32', '#b07a48', '#cc9a62'],
  antler: ['#6a5a40', '#9a8a68', '#c8b890', '#e8dcb8'],
  boar: ['#24180f', '#3a2a20', '#5a4030', '#74543e'],
  tusk: ['#b9b09c', '#d8d0bc', '#ece6d6', '#ffffff'],
  hide: ['#4a3420', '#6e5034', '#8e6a46', '#ac8658'],
  smoke: ['#3a3836', '#5a5856', '#7a7876', '#9a9896'],
};

/** Rampa de equipo de 4 tonos a partir de los 3 de la paleta del jugador [oscuro, medio, claro]. */
export function teamRamp(team: readonly [string, string, string]): readonly [string, string, string, string] {
  return [shade(team[0], 0.6), team[0], team[1], team[2]];
}

/** Oscurece un color #rrggbb. */
export function shade(hex: string, k: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)))
    .toString(16)
    .padStart(2, '0');
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
}

/** Rampas completas de un jugador: las base más 'team' (su color) y 'teamDark' (algo más oscuro, para ribetes). */
export function rampsFor(team: readonly [string, string, string]): Ramps {
  const t = teamRamp(team);
  return { ...BASE_RAMPS, team: t, teamDark: [shade(t[0], 0.8), shade(t[0], 1.0), t[1], t[2]] };
}
