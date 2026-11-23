import { UnitType } from '../../data/units';
import type { Prim } from './raster';
import {
  type BeastLook,
  type BeastPose,
  HORSE,
  type HumanLook,
  type HumanPose,
  type Weapon,
  beast,
  bombard,
  human,
  ram,
  rider,
  tradeCart,
  trebuchet,
} from './models';

/**
 * Catálogo de unidades: aspecto de cada tipo y sus animaciones (docs/arte.md §4). Cada animación es una lista
 * de poses; el generador de texturas la pinta en las 5 direcciones.
 */

export type AnimName = 'idle' | 'walk' | 'attack' | 'die' | 'chop' | 'mine' | 'farm' | 'build' | 'deploy' | 'ready';

export interface AnimSpec {
  readonly name: AnimName;
  readonly frames: number;
  /** Duración de cada fotograma (las de ataque se ajustan a la cadencia de la unidad). */
  readonly frameMs: number;
}

/** Oficios de los aldeanos: cada uno lleva su herramienta al andar y en reposo. */
export const Job = { None: 0, Wood: 1, Mine: 2, Farm: 3, Forage: 4, Build: 5 } as const;
export type Job = (typeof Job)[keyof typeof Job];
export const JOB_NAMES: readonly string[] = ['Sin oficio', 'Leñador', 'Minero', 'Granjero', 'Recolector', 'Constructor'];

export interface UnitModel {
  /** Lado de la celda de cada fotograma y punto de los pies dentro de ella. */
  readonly cell: number;
  readonly originX: number;
  readonly originY: number;
  readonly anims: readonly AnimSpec[];
  /** Anillo de selección grande (caballería, asedio). */
  readonly bigRing: boolean;
  /**
   * Giro (grados) de las vistas de frente y de espaldas: los cuadrúpedos vistos justo de frente se quedan
   * en una columna, así que se giran un poco para que se les vea el costado.
   */
  readonly turn?: number;
  /** Aspectos distintos de la misma unidad (aldeanos y aldeanas), con su nombre. */
  readonly looks?: readonly string[];
  /** Lleva la herramienta de su oficio al andar y en reposo (aldeanos). */
  readonly jobs?: boolean;
  /**
   * Casillas que avanza en un ciclo entero de la animación de andar: el ciclo va con la distancia recorrida, no
   * con el reloj, para que los pies no patinen.
   */
  readonly stride?: number;
  pose(anim: AnimName, frame: number, look?: number, job?: Job): Prim[];
}

/** Escala una figura entera desde los pies (animales más grandes sin rehacer sus medidas). */
function scaled(prims: Prim[], k: number): Prim[] {
  return prims.map((p) => ({ ...p, center: [p.center[0] * k, p.center[1] * k, p.center[2] * k] as const, half: [p.half[0] * k, p.half[1] * k, p.half[2] * k] as const }));
}

// Celda con margen para las armas levantadas, las lanzas y los cuerpos tendidos.
const SMALL = { cell: 40, originX: 20, originY: 35 } as const;
const LARGE = { cell: 48, originX: 24, originY: 42 } as const;

/** Fotogramas de un ciclo de andar (dos pasos). */
export const WALK_FRAMES = 8;

const HUMAN_ANIMS: readonly AnimSpec[] = [
  { name: 'idle', frames: 2, frameMs: 600 },
  { name: 'walk', frames: WALK_FRAMES, frameMs: 85 },
  { name: 'attack', frames: 4, frameMs: 150 },
  { name: 'die', frames: 5, frameMs: 100 },
];
const VILLAGER_ANIMS: readonly AnimSpec[] = [
  ...HUMAN_ANIMS,
  { name: 'chop', frames: 4, frameMs: 130 },
  { name: 'mine', frames: 4, frameMs: 130 },
  { name: 'farm', frames: 4, frameMs: 170 },
  { name: 'build', frames: 4, frameMs: 110 },
];

type Style = 'melee' | 'thrust' | 'bow' | 'crossbow' | 'gun' | 'staff' | 'throw' | 'couch';

function styleOf(w: Weapon): Style {
  switch (w) {
    case 'spear':
    case 'pike':
      return 'thrust';
    case 'lance':
      return 'couch';
    case 'bow':
    case 'longbow':
      return 'bow';
    case 'crossbow':
      return 'crossbow';
    case 'arquebus':
      return 'gun';
    case 'staff':
      return 'staff';
    case 'javelin':
      return 'throw';
    default:
      return 'melee';
  }
}

/** Postura de reposo de los brazos según el arma. */
function rest(style: Style): HumanPose {
  switch (style) {
    case 'thrust':
      return { armR: 18, tool: 155, armL: 10 };
    case 'couch':
      return { armR: 40, tool: 60, armL: 30 };
    case 'bow':
      return { armR: 8, armL: 14 };
    case 'crossbow':
      return { armR: 42, armL: 48 };
    case 'gun':
      return { armR: 36, armL: 52 };
    case 'staff':
      return { armR: 22, armL: 8 };
    case 'throw':
      return { armR: 30, tool: 120, armL: 20 };
    default:
      return { armR: 14, tool: 55, armL: 12 };
  }
}

const ATTACKS: Readonly<Record<Style, readonly HumanPose[]>> = {
  melee: [
    { armR: 155, tool: -25, armL: 35, lean: -4 },
    { armR: 100, tool: 30, armL: 40, lean: 10 },
    { armR: 50, tool: 50, armL: 40, lean: 12 },
    { armR: 22, tool: 55, armL: 30, lean: 4 },
  ],
  thrust: [
    { armR: 45, tool: 45, armL: 40, thrust: -3, lean: -3 },
    { armR: 55, tool: 35, armL: 50, thrust: 0.8, lean: 6 },
    { armR: 52, tool: 38, armL: 48, thrust: 0, lean: 4 },
    { armR: 45, tool: 45, armL: 40, thrust: -1.2, lean: 2 },
  ],
  couch: [
    { armR: 70, tool: 20, armL: 30, thrust: -2.5 },
    { armR: 80, tool: 10, armL: 30, thrust: 1.5 },
    { armR: 75, tool: 15, armL: 30, thrust: 0.8 },
    { armR: 70, tool: 20, armL: 30, thrust: 0 },
  ],
  bow: [
    { armL: 88, armR: 80, drawn: false },
    { armL: 90, armR: 88, armROut: 2, drawn: true },
    { armL: 88, armR: 70, drawn: false },
    { armL: 60, armR: 40, drawn: false },
  ],
  crossbow: [
    { armR: 78, armL: 84 },
    { armR: 82, armL: 88, lean: -5 },
    { armR: 60, armL: 70 },
    { armR: 40, armL: 50, lean: 8 },
  ],
  gun: [
    { armR: 82, armL: 86, drawn: true },
    { armR: 84, armL: 88, drawn: true, lean: -6 },
    { armR: 50, armL: 60 },
    { armR: 30, armL: 70, lean: 6 },
  ],
  staff: [
    { armR: 60, armL: 20 },
    { armR: 120, armL: 50 },
    { armR: 150, armL: 70 },
    { armR: 95, armL: 35 },
  ],
  throw: [
    { armR: 165, tool: 10, armL: 40, lean: -6 },
    { armR: 140, tool: 20, armL: 50, lean: -2 },
    { armR: 80, tool: 50, armL: 40, lean: 8 },
    { armR: 40, tool: 80, armL: 25, lean: 3 },
  ],
};

const WORK: Readonly<Record<'chop' | 'mine' | 'farm' | 'build', { readonly weapon: Weapon; readonly poses: readonly HumanPose[] }>> = {
  chop: {
    weapon: 'axe',
    poses: [
      { armR: 150, armL: 140, tool: 10, lean: -6 },
      { armR: 115, armL: 105, tool: 30, lean: 4 },
      { armR: 70, armL: 62, tool: 45, lean: 16 },
      { armR: 40, armL: 36, tool: 40, lean: 10 },
    ],
  },
  mine: {
    weapon: 'pick',
    poses: [
      { armR: 170, armL: 160, tool: 0, lean: -8 },
      { armR: 125, armL: 115, tool: 25, lean: 4 },
      { armR: 70, armL: 64, tool: 45, lean: 18 },
      { armR: 45, armL: 40, tool: 40, lean: 12 },
    ],
  },
  farm: {
    weapon: 'hoe',
    poses: [
      { armR: 75, armL: 60, tool: 30, lean: 18 },
      { armR: 92, armL: 78, tool: 20, lean: 14 },
      { armR: 58, armL: 50, tool: 40, lean: 24 },
      { armR: 45, armL: 40, tool: 45, lean: 22 },
    ],
  },
  build: {
    weapon: 'hammer',
    poses: [
      { armR: 125, armL: 50, tool: 40, lean: 14 },
      { armR: 85, armL: 50, tool: 40, lean: 16 },
      { armR: 45, armL: 50, tool: 40, lean: 20 },
      { armR: 95, armL: 50, tool: 40, lean: 15 },
    ],
  },
};

/** Cómo lleva cada oficio su herramienta al andar y en reposo, y con qué mano. */
const JOB_CARRY: Readonly<Record<Exclude<Job, 0>, { readonly weapon: Weapon; readonly pose: HumanPose; readonly hand: 'R' | 'L' }>> = {
  // Hacha, pico y azada, cruzados sobre el pecho; el martillo, en alto delante; la cesta, colgada del antebrazo.
  [Job.Wood]: { weapon: 'axe', pose: { armR: 15, elbowR: 80, tool: 75, toolRoll: 38 }, hand: 'R' },
  [Job.Mine]: { weapon: 'pick', pose: { armR: 15, elbowR: 80, tool: 75, toolRoll: 38 }, hand: 'R' },
  [Job.Farm]: { weapon: 'hoe', pose: { armR: 15, elbowR: 80, tool: 78, toolRoll: 30 }, hand: 'R' },
  [Job.Forage]: { weapon: 'basket', pose: { armL: 8, elbowL: 80 }, hand: 'L' },
  [Job.Build]: { weapon: 'hammer', pose: { armR: 12, elbowR: 75, tool: 75, toolRoll: 8 }, hand: 'R' },
};

/** Poses de una persona (a pie o montada) para una animación. */
function humanPose(look: HumanLook, anim: AnimName, f: number, job: Job = Job.None): HumanPose {
  const style = styleOf(look.weapon);
  const carried = job !== Job.None && (anim === 'idle' || anim === 'walk') ? JOB_CARRY[job] : null;
  const base: HumanPose = carried ? { ...rest(style), ...carried.pose, weapon: carried.weapon } : rest(style);
  switch (anim) {
    case 'idle': {
      // Sin arma, los codos algo doblados: los brazos dejan de parecer palos.
      const relaxed = look.weapon === 'none' ? { elbowL: base.elbowL ?? 14, elbowR: base.elbowR ?? 14 } : {};
      return { ...base, ...relaxed, armL: (base.armL ?? 0) + f * 3, armR: (base.armR ?? 0) + (style === 'melee' && !carried ? f * 2 : 0) };
    }
    case 'walk': {
      // Medio paso de desfase: así los fotogramas son poses distintas. La pierna que avanza dobla mucho la
      // rodilla al pasar bajo el cuerpo (el pie se levanta) y la de apoyo va casi recta; la cadera baja al
      // apoyar con las piernas abiertas, el cuerpo se inclina un poco y los brazos van al contrario que las piernas.
      const phase = (2 * Math.PI * (f + 0.5)) / WALK_FRAMES;
      const s = Math.sin(phase);
      const c = Math.cos(phase);
      const swingR = carried?.hand === 'R' ? 4 : style === 'melee' || style === 'staff' || style === 'bow' ? 18 : 6;
      const swingL = carried?.hand === 'L' ? 4 : 18;
      const knee = (k: number) => 1.9 * Math.max(0, k) ** 1.3 + 0.25 * Math.max(0, -k);
      return {
        ...base,
        bob: -0.8 * s * s,
        lean: (base.lean ?? 0) + 3,
        legL: 24 * s,
        legR: -24 * s,
        kneeL: knee(c),
        kneeR: knee(-c),
        armL: (base.armL ?? 0) - swingL * s,
        armR: (base.armR ?? 0) + swingR * s,
        ...(look.weapon === 'none' ? { elbowL: base.elbowL ?? 12 + 16 * Math.max(0, -s), elbowR: base.elbowR ?? 12 + 16 * Math.max(0, s) } : {}),
      };
    }
    case 'attack':
      return look.weapon === 'none' ? { ...ATTACKS.melee[f], weapon: 'knife' } : ATTACKS[style][f];
    case 'die':
      // Suelta el arma al caer.
      return { fall: [0, 24, 50, 74, 90][f], armR: [20, 60, 110, 150, 160][f], armL: [20, 50, 100, 140, 150][f], legL: [0, -10, -15, -5, 0][f], weapon: 'none' };
    case 'chop':
    case 'mine':
    case 'farm':
    case 'build':
      return { ...WORK[anim].poses[f], weapon: WORK[anim].weapon };
    default:
      return base;
  }
}

function infantry(look: HumanLook, anims: readonly AnimSpec[] = HUMAN_ANIMS): UnitModel {
  return { ...SMALL, anims, bigRing: false, stride: HUMAN_STRIDE, pose: (anim, f) => human(look, humanPose(look, anim, f)) };
}

/** Casillas por ciclo de andar de una persona (dos pasos). */
const HUMAN_STRIDE = 0.7;

function cavalry(look: HumanLook, horse: BeastLook = HORSE): UnitModel {
  return {
    // Celda grande: el caballo, más largo, cabe también cuando cae de lado.
    ...LARGE,
    anims: HUMAN_ANIMS,
    bigRing: true,
    turn: 28,
    // Un ciclo del paso del caballo avanza lo que recorren sus cascos (unas 0,7 casillas).
    stride: 0.75,
    pose: (anim, f) => {
      const hp = humanPose(look, anim === 'die' ? 'idle' : anim, anim === 'die' ? 0 : f);
      const bp: BeastPose =
        anim === 'walk'
          ? { gait: (2 * Math.PI * f) / WALK_FRAMES, stride: 26, bob: -0.2 * (1 - Math.cos((4 * Math.PI * f) / WALK_FRAMES)) }
          : anim === 'die'
            ? { fall: [0, 22, 50, 76, 90][f] }
            : anim === 'attack'
              ? { headDown: [0, 8, 4, 0][f] }
              : { headDown: f * 6 };
      return rider(look, horse, hp, bp);
    },
  };
}

const BEAST_ANIMS: readonly AnimSpec[] = [
  { name: 'idle', frames: 2, frameMs: 900 },
  { name: 'walk', frames: WALK_FRAMES, frameMs: 85 },
  { name: 'attack', frames: 4, frameMs: 150 },
  { name: 'die', frames: 5, frameMs: 100 },
];

function animal(look: BeastLook, grazes: boolean, size = 1.35): UnitModel {
  const pose = (anim: AnimName, f: number): Prim[] => {
    if (anim === 'walk') return beast(look, { gait: (2 * Math.PI * f) / WALK_FRAMES, stride: 30, bob: -0.15 * (1 - Math.cos((4 * Math.PI * f) / WALK_FRAMES)) });
    if (anim === 'attack') return beast(look, { headDown: [-10, 28, 12, 0][f], bob: [0, -0.5, 0, 0][f] });
    if (anim === 'die') return beast(look, { fall: [0, 22, 50, 76, 90][f] });
    return beast(look, { headDown: grazes && f === 1 ? 40 : 0 });
  };
  // Cuanto más largas las patas, más avanza en cada ciclo (lo que recorren las pezuñas).
  return { ...SMALL, anims: BEAST_ANIMS, bigRing: false, turn: 34, stride: (look.legLen * size) / 15, pose: (anim, f) => scaled(pose(anim, f), size) };
}

const SIEGE_ANIMS: readonly AnimSpec[] = [
  { name: 'idle', frames: 1, frameMs: 1000 },
  { name: 'walk', frames: 2, frameMs: 160 },
  { name: 'attack', frames: 4, frameMs: 150 },
  { name: 'die', frames: 3, frameMs: 130 },
];

function siege(build: (anim: AnimName, f: number) => Prim[], anims: readonly AnimSpec[] = SIEGE_ANIMS): UnitModel {
  return { ...LARGE, anims, bigRing: true, stride: anims.find((a) => a.name === 'walk')?.frames === WALK_FRAMES ? 0.4 : 0.5, pose: build };
}

/** Tumba un poco la máquina al destruirse. */
function wreck(prims: Prim[], f: number): Prim[] {
  const k = [0, 0.5, 1][f] ?? 1;
  return prims.map((p) => ({ ...p, center: [p.center[0], p.center[1] * (1 - 0.35 * k), p.center[2]] as const }));
}

// ── Aspectos ──

/** Aldeanos y aldeanas: cada aldeano de la partida lleva uno de estos aspectos. */
const VILLAGERS: readonly { readonly name: string; readonly look: HumanLook }[] = [
  { name: 'Campesino', look: { tunic: 'team', sleeves: 'linen', legs: 'pants', head: 'straw', weapon: 'none', belt: true, skirt: true, pouch: true, beard: true } },
  { name: 'Campesina', look: { tunic: 'team', sleeves: 'linen', head: 'kerchief', weapon: 'none', dress: true, apron: 'linen', hairMat: 'hairBlond', skin: 'skinPale' } },
  { name: 'Mozo', look: { tunic: 'team', sleeves: 'brown', legs: 'pants', head: 'felt', weapon: 'none', belt: true, skirt: true, hairMat: 'hairRed', skin: 'skinPale' } },
  { name: 'Moza', look: { tunic: 'team', sleeves: 'brown', head: 'linenCoif', weapon: 'none', dress: true, apron: 'wool', hair: 'bun', skin: 'skinDark' } },
];
const villager = VILLAGERS[0].look;

function villagers(): UnitModel {
  return {
    ...SMALL,
    anims: VILLAGER_ANIMS,
    bigRing: false,
    looks: VILLAGERS.map((v) => v.name),
    jobs: true,
    stride: HUMAN_STRIDE,
    pose: (anim, f, look = 0, job = Job.None) => {
      const l = VILLAGERS[((look % VILLAGERS.length) + VILLAGERS.length) % VILLAGERS.length].look;
      return human(l, humanPose(l, anim, f, job));
    },
  };
}

function make(type: UnitType): UnitModel {
  switch (type) {
    case UnitType.Villager:
      return villagers();
    case UnitType.Militia:
      return infantry({ tunic: 'team', sleeves: 'linen', head: 'cap', headMat: 'leather', weapon: 'sword', shield: 'round', belt: true });
    case UnitType.ManAtArms:
      return infantry({ tunic: 'team', sleeves: 'mail', head: 'nasal', weapon: 'sword', shield: 'kite', belt: true });
    case UnitType.Swordsman:
      return infantry({ tunic: 'team', sleeves: 'mail', legs: 'mail', head: 'kettle', weapon: 'bigSword', shield: 'kite', belt: true });
    case UnitType.VeteranSwordsman:
      return infantry({ tunic: 'steel', sleeves: 'steel', legs: 'mail', head: 'sallet', weapon: 'bigSword', sash: true });
    case UnitType.Spearman:
      return infantry({ tunic: 'team', sleeves: 'leather', head: 'cap', headMat: 'leather', weapon: 'spear', belt: true });
    case UnitType.Pikeman:
      return infantry({ tunic: 'team', sleeves: 'mail', head: 'kettle', weapon: 'pike', belt: true });
    case UnitType.Halberdier:
      return infantry({ tunic: 'team', sleeves: 'steel', legs: 'mail', head: 'sallet', weapon: 'halberd', belt: true });
    case UnitType.Archer:
      return infantry({ tunic: 'team', sleeves: 'linen', head: 'cap', headMat: 'brown', weapon: 'bow', belt: true });
    case UnitType.Crossbowman:
      return infantry({ tunic: 'team', sleeves: 'leather', head: 'kettle', weapon: 'crossbow', belt: true });
    case UnitType.Paveser:
      return infantry({ tunic: 'team', sleeves: 'mail', head: 'kettle', weapon: 'crossbow', shield: 'pavise', belt: true });
    case UnitType.Arquebusier:
      return infantry({ tunic: 'team', sleeves: 'linen', head: 'sallet', headMat: 'iron', weapon: 'arquebus', belt: true });
    case UnitType.Almogavar:
      // Almogàver: sin armadura, pellissa de piel blanca, gorro rojo, capa corta y azcona.
      return infantry({ tunic: 'team', sleeves: 'wool', legs: 'pants', head: 'cap', headMat: 'berry', weapon: 'spear', belt: true, pouch: true, beard: true, cloak: 'teamDark' });
    case UnitType.Gazi:
      // Gazí: turbante, túnica corta, adarga de cuero y espada; sin armadura.
      return infantry({ tunic: 'team', sleeves: 'linen', legs: 'pants', head: 'turban', headMat: 'wool', weapon: 'sword', shield: 'adarga', belt: true, beard: true, skin: 'skinDark' });
    case UnitType.Besteiro:
      // Besteiro do conto: milicia de concejo con gorro de fieltro, jubón de cuero, capa y ballesta.
      return infantry({ tunic: 'team', sleeves: 'leather', head: 'felt', weapon: 'crossbow', belt: true, pouch: true, cloak: 'teamDark' });
    case UnitType.Schiltron:
      // Schiltron: piquero escocés con bacinete, jubón acolchado, rodela y pica larga.
      return infantry({ tunic: 'team', sleeves: 'wool', legs: 'pants', head: 'nasal', weapon: 'pike', shield: 'round', belt: true, beard: true, hairMat: 'hairRed' });
    case UnitType.Longbowman:
      return infantry({ tunic: 'team', sleeves: 'linen', head: 'coif', headMat: 'linen', weapon: 'longbow', belt: true, hairMat: 'hairBlond' });
    case UnitType.Monk:
      return infantry({ tunic: 'monk', head: 'hood', weapon: 'staff', robe: true, belt: false });
    case UnitType.Scout:
      // Batidor: jinete ligero con chaperón de paño, capa y una lanza corta, sobre un rocín bayo.
      return cavalry(
        { tunic: 'team', sleeves: 'linen', head: 'chaperon', headMat: 'brown', weapon: 'spear', belt: true, cloak: 'teamDark', hairMat: 'hairBlond' },
        { ...HORSE, coat: 'horseDun', body: [4.2, 4.4, 11.6], legThick: 1.15 },
      );
    case UnitType.LightCavalry:
      return cavalry({ tunic: 'team', sleeves: 'mail', head: 'nasal', weapon: 'sword', shield: 'round' });
    case UnitType.VeteranLightCavalry:
      return cavalry({ tunic: 'team', sleeves: 'mail', head: 'kettle', weapon: 'sword', shield: 'kite' }, { ...HORSE, coat: 'horseDark' });
    case UnitType.Jinete:
      return cavalry({ tunic: 'team', sleeves: 'linen', head: 'turban', weapon: 'javelin', shield: 'adarga' }, { ...HORSE, coat: 'horseGrey' });
    case UnitType.Gendarme:
      // Gendarme: arnés blanco completo, celada y lanza, sobre un caballo oscuro con barda.
      return cavalry({ tunic: 'steel', sleeves: 'steel', legs: 'steel', head: 'sallet', weapon: 'lance', sash: true }, { ...HORSE, coat: 'horseDark', barding: true });
    case UnitType.Knight:
      return cavalry({ tunic: 'team', sleeves: 'mail', head: 'great', weapon: 'lance', shield: 'kite' }, { ...HORSE, coat: 'horseGrey' });
    case UnitType.HeavyKnight:
      return cavalry({ tunic: 'steel', sleeves: 'steel', head: 'great', weapon: 'bigSword', shield: 'kite', sash: true }, { ...HORSE, coat: 'horseGrey', barding: true });
    case UnitType.Sheep:
      return animal(
        { coat: 'sheepWool', dark: 'sheepFace', body: [3.4, 3, 5.2], legLen: 2.4, legThick: 0.85, socks: 1, neck: { len: 1.8, angle: 50, thick: 1.6 }, head: [1.8, 2, 2.6], headAngle: 105, muzzle: 0.75, ears: 0.8, tail: 1.2, extra: 'wool' },
        true,
        1.5,
      );
    case UnitType.Wolf:
      return animal(
        { coat: 'wolf', dark: 'sheepFace', body: [2.4, 2.6, 6.6], legLen: 3.6, legThick: 0.85, neck: { len: 2, angle: 60, thick: 2 }, head: [1.8, 1.8, 3.4], headAngle: 100, muzzle: 0.5, ears: 1.2, tail: 3.4, tailThick: 1.2 },
        false,
        1.35,
      );
    case UnitType.Deer:
      return animal(
        { coat: 'deer', dark: 'hide', body: [2.8, 3.2, 6.6], legLen: 5.2, legThick: 0.8, neck: { len: 3.2, angle: 30, thick: 1.6 }, head: [1.6, 1.8, 3], headAngle: 115, muzzle: 0.6, ears: 1, tail: 1.2, extra: 'antlers' },
        true,
        1.25,
      );
    case UnitType.Boar:
      return animal(
        { coat: 'boar', dark: 'sheepFace', body: [3.6, 3.6, 6.8], legLen: 2.4, legThick: 1, neck: { len: 1.2, angle: 80, thick: 3 }, head: [2.6, 2.6, 3.4], headAngle: 105, muzzle: 0.75, ears: 0.9, tail: 1.6, extra: 'tusks' },
        false,
        1.4,
      );
    case UnitType.Ram:
      return siege((anim, f) => {
        if (anim === 'attack') return ram([-1.5, 2.5, 1.2, 0][f]);
        if (anim === 'walk') return ram(0, f * 0.5);
        if (anim === 'die') return wreck(ram(0), f);
        return ram(0);
      });
    case UnitType.Trebuchet:
      return siege(
        (anim, f) => {
          if (anim === 'walk') return trebuchet(0, 0, f * 0.5);
          if (anim === 'deploy') return trebuchet((f + 1) / 4, 0);
          if (anim === 'ready') return trebuchet(1, 0);
          if (anim === 'attack') return trebuchet(1, [0, 70, 130, 50][f]);
          if (anim === 'die') return wreck(trebuchet(1, 0), f);
          return trebuchet(0, 0);
        },
        [...SIEGE_ANIMS, { name: 'deploy', frames: 4, frameMs: 200 }, { name: 'ready', frames: 1, frameMs: 1000 }],
      );
    case UnitType.Bombard:
      return siege((anim, f) => {
        if (anim === 'attack') return bombard([0, 2.2, 1.2, 0.4][f]);
        if (anim === 'walk') return bombard(0, f * 0.5);
        if (anim === 'die') return wreck(bombard(0), f);
        return bombard(0);
      });
    case UnitType.TradeCart:
      return siege(
        (anim, f) => {
          if (anim === 'walk') return tradeCart({ gait: (2 * Math.PI * f) / WALK_FRAMES, stride: 24 });
          if (anim === 'die') return wreck(tradeCart({}), f);
          return tradeCart({});
        },
        [
          { name: 'idle', frames: 1, frameMs: 1000 },
          { name: 'walk', frames: WALK_FRAMES, frameMs: 95 },
          { name: 'die', frames: 3, frameMs: 130 },
        ],
      );
    default:
      return infantry(villager);
  }
}

const cache = new Map<UnitType, UnitModel>();

/** Modelo de un tipo de unidad. */
export function unitModel(type: UnitType): UnitModel {
  let m = cache.get(type);
  if (!m) {
    m = make(type);
    cache.set(type, m);
  }
  return m;
}
