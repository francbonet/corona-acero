import { BASE_RAMPS, rampsFor } from '../rig/materials';
import type { IsoRamps } from './iso-raster';

/**
 * Rampas (oscuro → claro) de los materiales de edificios, suelo y recursos. El tono 0 queda para contornos,
 * juntas y huecos: las caras al sol usan el 3, las de la izquierda el 2 y las de la derecha el 1.
 */
export const ARCH_RAMPS: IsoRamps = {
  // Piedra gris cálida (Castilla, muros y castillos) y piedra gris fría (gótico inglés).
  stone: ['#3e3a33', '#7a7264', '#a39b8b', '#c6bead'],
  stoneDark: ['#2e2a26', '#5e584e', '#7e7668', '#9e9686'],
  ashlar: ['#34383e', '#686d74', '#9297a0', '#b9bdc4'],
  sandstone: ['#4e3a24', '#8f7049', '#bb9868', '#dcbf8e'],
  // Caliza clara (gótico francés), caliza blanca lioz (Portugal) y granito gris (Escocia).
  limestone: ['#4e4634', '#948a6c', '#bdb393', '#ddd4b4'],
  lioz: ['#56544c', '#a6a294', '#cfcbbd', '#eeece3'],
  granite: ['#2c2e30', '#5a5c5e', '#7e8080', '#a0a2a0'],
  // Tapial nazarí (tierra apisonada rojiza) y enlucido escocés.
  tapial: ['#5a3020', '#a4643f', '#c88660', '#e2a882'],
  harling: ['#363a3c', '#6c7072', '#8e9294', '#aeb2b2'],
  // Ladrillo mudéjar y su argamasa clara.
  brick: ['#4a2016', '#86422c', '#ad5d40', '#cc7a58'],
  mortar: ['#6e6250', '#a89a80', '#cdbf9f', '#e4d8bc'],
  // Encalado, revoco del entramado y vigas.
  whitewash: ['#6e685a', '#bdb5a2', '#dcd5c2', '#f2ede0'],
  adobe: ['#4e3620', '#8e6a44', '#ae865a', '#caa274'],
  plaster: ['#6e6048', '#bba882', '#d8c8a0', '#ece0c0'],
  timber: ['#160e08', '#2f1f12', '#45301c', '#5e4228'],
  // Madera de tablas, troncos y astillas.
  plank: ['#2f1f12', '#62442a', '#83603c', '#a37a4c'],
  log: ['#2b1d14', '#5c3d24', '#7a5232', '#9a6c42'],
  logEnd: ['#5c4428', '#b08a5a', '#d4b080', '#ecd0a0'],
  // Cubiertas.
  thatch: ['#4e3a1c', '#86662e', '#ad8a44', '#cfaa5c'],
  tiles: ['#4e1e14', '#8a3626', '#b4503a', '#d26e52'],
  slate: ['#1e232c', '#3e4654', '#566070', '#74808f'],
  slateBlue: ['#161e32', '#2c3c5c', '#42587e', '#6480a4'],
  slateDark: ['#141618', '#2a2e32', '#3c4248', '#545b62'],
  tilesGreen: ['#10301e', '#1c5434', '#2c7a4c', '#4ea06c'],
  shingle: ['#2b1d14', '#55391f', '#73502e', '#93683e'],
  lead: ['#2a2e34', '#4e545c', '#6c727a', '#8e949a'],
  copper: ['#1e4a3e', '#2e6e5a', '#4a947a', '#78bc9e'],
  // Huecos, cristal, azulejo, tela.
  void: ['#0e0a08', '#1a120c', '#24180f', '#2e2016'],
  glass: ['#121a2c', '#1e2c4c', '#2f4a7e', '#5a86bc'],
  azulejo: ['#163e32', '#24644e', '#3a8c6a', '#6cbc94'],
  azulejoBlue: ['#121e4a', '#1e3478', '#3256a8', '#6a8cd2'],
  cloth: ['#6e6048', '#bba882', '#dccaa0', '#f2e6c4'],
  // Suelos.
  dirt: ['#3e2816', '#634228', '#7e5636', '#9a6e46'],
  soil: ['#2e1e10', '#4a3018', '#5e3e22', '#74502e'],
  paving: ['#3e3a33', '#6a6458', '#887f70', '#a39a8a'],
  sandGround: ['#7a6a46', '#b09a6a', '#cdb684', '#e2cea0'],
  // Cultivos.
  wheat: ['#6a4a14', '#a8822a', '#d0aa44', '#ecd070'],
  crop: ['#24481e', '#3e7030', '#58963e', '#7ab85a'],
  stubble: ['#5a4422', '#8a6e3a', '#a8884a', '#c4a462'],
  hay: ['#6a5428', '#a88c4a', '#cdb064', '#e6cc86'],
  // Lo que brilla (fragua, horno): se usa con tono fijo.
  glow: ['#8a2a10', '#d8601a', '#f2a03a', '#ffe08a'],
  water: ['#1b2d57', '#22396b', '#2f4f8a', '#6a9ccc'],
  // Recursos.
  rock: ['#2e2a26', '#5e584e', '#8a8478', '#b0a898'],
  goldOre: ['#5a3c0c', '#a8782a', '#e3b23c', '#f6dc7a'],
  ochre: ['#4a3a1c', '#7a5e30', '#9a7a44', '#b89458'],
};

/** Rampas para pintar un edificio de un jugador: las de arquitectura, las de las figuras y el color de equipo. */
export function archRampsFor(team: readonly [string, string, string]): IsoRamps {
  return { ...BASE_RAMPS, ...ARCH_RAMPS, ...rampsFor(team) };
}

export const NEUTRAL_RAMPS: IsoRamps = { ...BASE_RAMPS, ...ARCH_RAMPS, ...rampsFor(['#5a5a5a', '#8a8a8a', '#c0c0c0']) };
