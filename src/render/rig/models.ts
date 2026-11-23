import { type Prim, type Vec3, add, box, cross, disc, ell, normalize, pitch, roll, scale, segment, shaped, transformPrims } from './raster';

/**
 * Modelos de las figuras: personas (con su ropa, casco, arma y escudo), caballos con jinete, animales y
 * máquinas de asedio, construidos con piezas en el espacio del modelo (x a la derecha de la figura,
 * y arriba, z hacia delante; 1 unidad = 1 píxel; los pies en el origen). Cabezas, miembros y cuerpos son
 * redondos (elipsoides y cilindros que se estrechan); las cajas quedan para las armas y los objetos.
 */

export type Weapon =
  | 'none'
  | 'sword'
  | 'bigSword'
  | 'spear'
  | 'pike'
  | 'halberd'
  | 'lance'
  | 'bow'
  | 'longbow'
  | 'crossbow'
  | 'arquebus'
  | 'staff'
  | 'javelin'
  | 'axe'
  | 'pick'
  | 'hoe'
  | 'hammer'
  | 'knife'
  | 'basket';

export type Headgear =
  | 'hair'
  | 'straw'
  | 'cap'
  | 'coif'
  | 'kettle'
  | 'nasal'
  | 'great'
  | 'sallet'
  | 'hood'
  | 'turban'
  | 'kerchief'
  | 'chaperon'
  | 'linenCoif'
  | 'felt';

export type HairStyle = 'short' | 'long' | 'bun';

export interface HumanLook {
  /** Material del torso (la túnica, el sobreveste o el corpiño). */
  readonly tunic: string;
  readonly sleeves?: string;
  readonly legs?: string;
  readonly head: Headgear;
  /** Material del casco o el gorro (por defecto acero o tela según el tipo). */
  readonly headMat?: string;
  readonly weapon: Weapon;
  readonly shield?: 'round' | 'kite' | 'pavise' | 'adarga';
  /** Hábito hasta los pies (monje). */
  readonly robe?: boolean;
  /** Vestido hasta los pies (aldeanas). */
  readonly dress?: boolean;
  /** Faldón de la túnica por debajo del cinturón, hasta medio muslo. */
  readonly skirt?: boolean;
  /** Delantal (su material) sobre el vestido o el faldón. */
  readonly apron?: string;
  /** Cinturón de cuero. */
  readonly belt?: boolean;
  /** Bolsa colgada del cinturón. */
  readonly pouch?: boolean;
  /** Banda del color del jugador sobre una armadura de placas. */
  readonly sash?: boolean;
  /** Capa a la espalda (su material). */
  readonly cloak?: string;
  readonly hairMat?: string;
  readonly hair?: HairStyle;
  readonly beard?: boolean;
  /** Material de la piel (por defecto 'skin'). */
  readonly skin?: string;
}

export interface HumanPose {
  readonly bob?: number;
  readonly legL?: number;
  readonly legR?: number;
  /** Brazos: 0 = colgando, 90 = hacia delante, 180 = arriba. */
  readonly armL?: number;
  readonly armR?: number;
  /** Abrir el brazo hacia fuera (grados). */
  readonly armLOut?: number;
  readonly armROut?: number;
  /** Codo: cuánto se dobla el antebrazo hacia delante (0 = brazo recto). */
  readonly elbowL?: number;
  readonly elbowR?: number;
  /** Ángulo del arma respecto al antebrazo (positivo = hacia delante). */
  readonly tool?: number;
  /**
   * Inclina el arma hacia el lado izquierdo de la figura (grados): una herramienta llevada en diagonal sobre el
   * pecho. Entonces su cabeza se pone de cara, para que se vea de frente.
   */
  readonly toolRoll?: number;
  /** Desplazamiento del arma a lo largo de su eje (estocada, cuerda tensa). */
  readonly thrust?: number;
  /** Inclinación del torso hacia delante. */
  readonly lean?: number;
  /** Caída al morir (0–90). */
  readonly fall?: number;
  /** Rodilla doblada al dar el paso (cuánto se acorta cada pierna). */
  readonly kneeL?: number;
  readonly kneeR?: number;
  /** Montado: piernas abiertas a los lados y cadera a la altura de la silla. */
  readonly seatY?: number;
  /** Arma distinta de la del aspecto (las herramientas de los aldeanos). */
  readonly weapon?: Weapon;
  /** El arco o la ballesta, tensos. */
  readonly drawn?: boolean;
}

/** Gira "hacia delante": de −y hacia +z (un brazo que cuelga y se levanta). */
export function fwd(v: Vec3, deg: number): Vec3 {
  return pitch(v, -deg);
}

const DOWN: Vec3 = [0, -1, 0];
const UP: Vec3 = [0, 1, 0];

/** Altura de la cadera de pie, largo del brazo y altura del centro de la cabeza sobre la cadera. */
const HIP = 9.4;
const ARM = 6.4;
const THIGH = 4.7;
const SHIN = 4.6;
const HEAD_ABOVE_HIP = 9.7;
/** Cabeza: algo más pequeña que antes, para unas proporciones de unas 5,4 cabezas. */
const HEAD: Vec3 = [3.5, 3.9, 3.6];
/** Altura de lo alto de la cabeza de una persona de pie (para encuadrar los retratos). */
export const HEAD_TOP = HIP + HEAD_ABOVE_HIP + HEAD[1] / 2;

/** Dirección de un miembro que cuelga, levantado `a` grados hacia delante y abierto `out` hacia su lado. */
function limb(a: number, out: number, side: number): Vec3 {
  return roll(fwd(DOWN, a), side * out);
}

/** Cilindro que se estrecha hacia la punta (brazos, piernas, cuellos). */
function cyl(from: Vec3, dir: Vec3, len: number, thick: number, depth: number, mat: string, taper: number, paint?: Prim['paint'], group?: string): Prim {
  return { ...shaped(segment(from, dir, len, thick, depth, mat, paint), 'cyl', taper), group };
}

/**
 * Textura de un material de ropa o armadura sobre una pieza: anillas en la malla, lamas en las placas, pespuntes
 * en el gambesón. `rows` es más o menos el largo de la pieza en píxeles.
 */
function weave(mat: string, rows: number): Prim['paint'] {
  if (mat === 'mail') return (_f, a, b) => (((Math.floor((a + 1) * 2) + Math.floor((b + 1) * rows * 0.5)) & 1) === 1 ? 'mail-' : undefined);
  if (mat === 'steel') return (_f, _a, b) => ((((b + 1) * rows) / 2.2) % 1 < 0.22 ? 'steel-' : undefined);
  if (mat === 'gambeson') return (_f, _a, b) => ((((b + 1) * rows) / 1.6) % 1 < 0.2 ? 'gambeson-' : undefined);
  return undefined;
}

/** Junta dos dibujos: el primero manda donde pinta algo. */
function both(a: Prim['paint'], b: Prim['paint']): Prim['paint'] {
  if (!a) return b;
  if (!b) return a;
  return (face, x, y) => a(face, x, y) ?? b(face, x, y);
}

/** Espinilla: la bota en la mitad de abajo, sobre el tejido de la pierna. */
const bootPaint: Prim['paint'] = (face, _a, b) => (face === '-v' || b < -0.15 ? 'boot' : undefined);

/** Cara con ojos (vista de frente), la sombra de la nariz, barba y pelo por arriba y por detrás. */
function headPaint(skin: string, hair: string | null, beard: string | null): Prim['paint'] {
  return (face, a, b) => {
    if (face === '+w') {
      const x = Math.abs(a);
      if (b > 0.06 && b < 0.3 && x > 0.3 && x < 0.56) return 'eye';
      // Cejas (del color del pelo), nariz y boca: a la doble densidad de las unidades ya se distinguen.
      if (b > 0.38 && b < 0.5 && x > 0.26 && x < 0.62) return hair ?? `${skin}-`;
      if (beard && b < -0.34) return beard;
      if (x < 0.16 && b > -0.3 && b < 0.05) return `${skin}-`;
      if (x < 0.24 && b > -0.58 && b < -0.46) return `${skin}-`;
      if (hair && b > 0.7) return hair;
      return undefined;
    }
    // En las caras ±u, a es la coordenada hacia delante y b la vertical.
    if (beard && (face === '+u' || face === '-u') && b < -0.3 && a > 0.15) return beard;
    if (!hair) return undefined;
    if (face === '+v' || face === '-w') return hair;
    if ((face === '+u' || face === '-u') && (b > 0.15 || a < -0.4)) return hair;
    return undefined;
  };
}

/** Pie: una bota que asoma hacia delante al final de la pierna. */
function foot(end: Vec3): Prim {
  return shaped(box(add(end, [0, 0.45, 0.45]), [1.5, 0.9, 2.3], 'boot'), 'rbox');
}

/** Persona entera en una pose. */
export function human(look: HumanLook, pose: HumanPose = {}): Prim[] {
  const P: Prim[] = [];
  const seated = pose.seatY !== undefined;
  const hipY = (pose.seatY ?? HIP) + (pose.bob ?? 0);
  const legs = look.legs ?? 'pants';
  const skin = look.skin ?? 'skin';
  const gown = (look.robe || look.dress) && !seated;

  // Piernas, con muslo y espinilla. Montadas, el muslo va hacia delante sobre el caballo y la espinilla cuelga
  // por su costado; de pie, la que avanza dobla la rodilla y así el paso también se ve de frente.
  const legTex = weave(legs, 5);
  const legPaint = both(bootPaint, legTex);
  const leg = (side: number, from: Vec3, thighDir: Vec3, shinDir: Vec3) => {
    const group = `leg${side}`;
    P.push(cyl(from, thighDir, THIGH, 2.1, 2.2, legs, 0.82, legTex, group));
    const knee = add(from, scale(thighDir, THIGH - 0.2));
    P.push(cyl(knee, shinDir, SHIN, 1.75, 1.85, legs, 0.84, legPaint, group));
    P.push({ ...foot(add(knee, scale(shinDir, SHIN))), group });
  };
  if (seated) {
    for (const side of [-1, 1]) leg(side, [side * 2.0, hipY + 0.6, 0.6], roll(fwd(DOWN, 62), side * 16), roll(fwd(DOWN, -4), side * 10));
  } else {
    const legL = pose.legL ?? 0;
    const legR = pose.legR ?? 0;
    for (const [side, a, knee] of [
      [-1, legL, pose.kneeL ?? Math.max(0, legL) * 0.05],
      [1, legR, pose.kneeR ?? Math.max(0, legR) * 0.05],
    ] as const) {
      // `knee` (0–1,6) es cuánto se dobla la rodilla: la espinilla se va hacia atrás.
      const bend = knee * 24;
      leg(side, [side * 1.15, hipY, 0], limb(a, 0, side), limb(a - bend, 0, side));
    }
    // Cadera: une los muslos.
    P.push({ ...ell([0, hipY + 0.3, 0], [4.3, 2.3, 3], legs), group: 'hips' });
  }

  // Hábito o vestido hasta los pies: un cono que se abre hacia el bajo, con el delantal por delante.
  if (gown) {
    const top = hipY + 1.2;
    const bottom = look.dress ? 0.9 : 0.6;
    const apron = look.apron;
    P.push({
      ...shaped(
        box([0, (top + bottom) / 2, 0], [4.4, top - bottom, 3.1], look.tunic, (face, a, b) =>
          apron && face === '+w' && Math.abs(a) < 0.55 && b > -0.9 ? apron : Math.abs(((a + 1) * 2) % 1 - 0.5) < 0.1 && b < 0.4 ? `${look.tunic}-` : undefined,
        ),
        'cyl',
        look.dress ? 1.5 : 1.3,
      ),
      group: 'torso',
    });
  }

  // Tronco: torso, faldón, cabeza, brazos y lo que llevan, girados juntos por la inclinación.
  const upper: Prim[] = [];
  const torsoPaint: Prim['paint'] = (face, a, b) => {
    const side = face !== '+v' && face !== '-v';
    if (look.belt && side && b < -0.7 && b > -0.97) return face === '+w' && Math.abs(a) < 0.16 ? 'gold' : 'leather';
    if (look.robe && side && b < -0.72 && b > -0.95) return 'rope';
    if (look.sash && (face === '+w' || face === '-w') && Math.abs(a - b) < 0.35) return 'team';
    if (look.apron && look.dress && face === '+w' && Math.abs(a) < 0.5 && b < -0.2) return look.apron;
    return undefined;
  };
  upper.push({ ...shaped(box([0, hipY + 3.5, 0], [5, 6.8, 3], look.tunic, both(torsoPaint, weave(look.tunic, 7))), 'rbox', 0.78), group: 'torso' });
  if (look.skirt && !gown && !seated) {
    const apron = look.apron;
    upper.push({
      ...shaped(
        box([0, hipY - 0.7, 0], [4.4, 3.6, 3.1], look.tunic, (face, a, b) =>
          apron && face === '+w' && Math.abs(a) < 0.5 && b > -0.85 ? apron : Math.abs(((a + 1) * 2) % 1 - 0.5) < 0.12 ? `${look.tunic}-` : undefined,
        ),
        'cyl',
        1.18,
      ),
      group: 'torso',
    });
  }
  if (look.pouch) upper.push(shaped(box([1.9, hipY + 0.2, 1.0], [1.2, 1.5, 0.9], 'leather'), 'rbox'));
  if (look.cloak) upper.push(shaped(box([0, hipY + 3, -1.9], [5.2, seated ? 7 : 8.4, 0.7], look.cloak, (_f, a) => (Math.abs(((a + 1) * 2.5) % 1 - 0.5) < 0.12 ? `${look.cloak}-` : undefined)), 'rbox', 1.25));
  upper.push(cyl([0, hipY + 8, 0], DOWN, 1.4, 1.5, 1.5, skin, 1));
  upper.push(...headgear(look, hipY + HEAD_ABOVE_HIP));

  // Brazos (con el hombro redondeado) y manos.
  const shoulderY = hipY + 6.3;
  const sleeves = look.sleeves ?? look.tunic;
  const dirR = limb(pose.armR ?? 0, pose.armROut ?? 7, 1);
  const dirL = limb(pose.armL ?? 0, pose.armLOut ?? 7, -1);
  const shoulderR: Vec3 = [2.7, shoulderY, 0];
  const shoulderL: Vec3 = [-2.7, shoulderY, 0];
  for (const s of [shoulderR, shoulderL]) upper.push({ ...ell(add(s, [0, -0.1, 0]), [2, 2, 2.1], sleeves), group: 'torso' });
  const armR = arm(shoulderR, dirR, pose.elbowR ?? 0, sleeves, skin, 'armR');
  const armL = arm(shoulderL, dirL, pose.elbowL ?? 0, sleeves, skin, 'armL');
  upper.push(...armR.prims, ...armL.prims);
  upper.push(...weapon(pose.weapon ?? look.weapon, armR.hand, armL.hand, roll(fwd(armR.fore, pose.tool ?? 0), pose.toolRoll ?? 0), pose));
  if (look.shield) upper.push(...shield(look.shield, armL.hand, hipY));

  const lean = pose.lean ?? 0;
  const pivot: Vec3 = [0, hipY, 0];
  P.push(...(lean ? transformPrims(upper, (p) => add(pivot, pitch(add(p, scale(pivot, -1)), lean)), (v) => pitch(v, lean)) : upper));

  const fall = pose.fall ?? 0;
  if (!fall) return P;
  // Cae de espaldas girando sobre los talones, y se desplaza para quedar tendida en el centro de su casilla.
  const heel: Vec3 = [0, 0, -1.6];
  const shift: Vec3 = [0, 0, (fall / 90) * 9];
  return transformPrims(P, (p) => add(add(heel, pitch(add(p, scale(heel, -1)), -fall)), shift), (v) => pitch(v, -fall));
}

/**
 * Brazo desde el hombro: recto (una pieza) o doblado por el codo (brazo y antebrazo). Devuelve dónde queda la
 * mano y hacia dónde apunta el antebrazo (de ahí sale el arma).
 */
function arm(shoulder: Vec3, dir: Vec3, elbow: number, sleeves: string, skin: string, group: string): { prims: Prim[]; hand: Vec3; fore: Vec3 } {
  const upperLen = ARM * 0.52;
  const foreLen = ARM * 0.48;
  const joint = add(shoulder, scale(dir, upperLen));
  const fore = elbow ? fwd(dir, elbow) : dir;
  const tex = weave(sleeves, 3);
  const hand = add(joint, scale(fore, foreLen + 0.3));
  return {
    prims: [
      cyl(shoulder, dir, upperLen + 0.3, 1.65, 1.75, sleeves, 0.9, tex, group),
      cyl(joint, fore, foreLen, 1.5, 1.6, sleeves, 0.82, tex, group),
      { ...ell(hand, [1.3, 1.45, 1.35], skin), group },
    ],
    hand,
    fore,
  };
}

/** Gorros, cascos y peinados sobre la cabeza (centrada en `y`). */
function headgear(look: HumanLook, y: number): Prim[] {
  const out: Prim[] = [];
  const hair = look.hairMat ?? 'hair';
  const hides = look.head === 'great' || look.head === 'hood' || look.head === 'chaperon' || look.head === 'coif';
  out.push(ell([0, y, 0], HEAD, look.skin ?? 'skin', headPaint(look.skin ?? 'skin', hides ? null : hair, look.beard ? hair : null)));
  if (!hides && look.hair === 'long') out.push(shaped(box([0, y - 1.4, -1.5], [3.6, 3.4, 1.1], hair), 'rbox', 1.1));
  if (!hides && look.hair === 'bun') out.push(ell([0, y + 0.5, -2.1], [2, 2, 1.8], hair));
  const m = look.headMat;
  const brim = (dy: number, d: number, mat: string) => shaped(box([0, y + dy, 0], [d, 0.6, d], mat), 'cyl');
  switch (look.head) {
    case 'straw':
      out.push(brim(2, 5.8, m ?? 'straw'));
      out.push(shaped(box([0, y + 2.8, 0], [3.2, 1.4, 3.2], m ?? 'straw'), 'cyl', 1.15));
      break;
    case 'felt':
      out.push(brim(1.9, 5, m ?? 'felt'));
      out.push(shaped(box([0, y + 2.8, 0], [3.3, 1.8, 3.3], m ?? 'felt'), 'cyl', 1.15));
      out.push(segment([1.2, y + 2.9, -0.8], normalize([0.4, 1, -0.7]), 2.4, 0.6, 0.6, 'team'));
      break;
    case 'cap':
      out.push(ell([0, y + 1.3, -0.2], [4.1, 2.4, 4.1], m ?? 'team'));
      break;
    case 'linenCoif':
      out.push(ell([0, y + 1, -0.5], [4.1, 3, 4], m ?? 'linen'));
      break;
    case 'kerchief':
      out.push(ell([0, y + 0.7, -0.55], [4.3, 3.8, 4.2], m ?? 'linen'));
      out.push(shaped(box([0, y - 1, -2], [1.4, 1.8, 0.7], m ?? 'linen'), 'rbox', 0.6));
      break;
    case 'coif':
      // Almófar de malla: cubre la cabeza y el cuello y deja la cara.
      out.push(ell([0, y + 0.35, -0.75], [4.5, 5, 4.1], m ?? 'mail'));
      out.push(shaped(box([0, y - 2.3, -0.4], [4.4, 1.4, 3.6], m ?? 'mail'), 'cyl', 1.25));
      break;
    case 'kettle':
      out.push(brim(1.4, 6, m ?? 'steel'));
      out.push(ell([0, y + 1.6, 0], [4.2, 3, 4.2], m ?? 'steel'));
      break;
    case 'nasal':
      out.push(ell([0, y + 1.3, 0], [4.3, 3.2, 4.3], m ?? 'steel'));
      out.push(box([0, y - 0.1, 1.95], [0.7, 2, 0.5], m ?? 'steel'));
      break;
    case 'great':
      out.push(
        shaped(
          box([0, y + 0.4, 0], [4.4, 5, 4.4], m ?? 'steel', (face, a, b) =>
            face === '+w' && b > 0 && b < 0.3 ? 'eye' : face === '+w' && Math.abs(a) < 0.14 && b < 0 ? 'gold' : undefined,
          ),
          'cyl',
        ),
      );
      break;
    case 'sallet':
      out.push(ell([0, y + 1.2, -0.6], [4.5, 3.2, 5.6], m ?? 'steel'));
      out.push(shaped(box([0, y + 0.2, -2.7], [3.6, 1.2, 1.6], m ?? 'steel'), 'rbox'));
      out.push(shaped(box([0, y - 1.3, 1.1], [4, 1.8, 1.8], m ?? 'steel'), 'rbox'));
      break;
    case 'hood':
    case 'chaperon': {
      // Capucha con esclavina sobre los hombros; la del chaperón, con la cola (liripipe) colgando a la espalda.
      const mat = m ?? (look.head === 'hood' ? 'monk' : 'brown');
      out.push(ell([0, y + 0.4, -0.75], [4.4, 4.8, 4.1], mat));
      out.push(shaped(box([0, y - 2.6, -0.2], look.head === 'hood' ? [5.4, 1.6, 3.9] : [5.2, 1.4, 3.8], mat), 'cyl', 1.22));
      if (look.head === 'chaperon') out.push(cyl([0, y + 1.8, -2.2], normalize([0, -1, -0.35]), 5, 1, 1, mat, 0.6));
      break;
    }
    case 'turban':
      out.push(ell([0, y + 1.3, 0], [4.6, 2.8, 4.6], m ?? 'linen', (face, _a, b) => (b > 0.3 && face !== '+v' ? 'team' : undefined)));
      break;
    default:
      break;
  }
  return out;
}

function weapon(kind: Weapon, hand: Vec3, handL: Vec3, dir: Vec3, pose: HumanPose): Prim[] {
  const d = normalize(dir);
  const t = pose.thrust ?? 0;
  const h = add(hand, scale(d, t));
  const back = (len: number) => add(h, scale(d, -len));
  // Hacia dónde salen las cabezas de las herramientas: en el plano del golpe o, si se lleva cruzada, de cara.
  const side = pose.toolRoll ? normalize(cross([0, 0, 1], d)) : fwd(d, 90);
  const head = (c: Vec3, len: number, thick: number, depth: number, mat: string) => segment(add(c, scale(side, -len / 2)), side, len, thick, depth, mat);
  switch (kind) {
    case 'sword':
    case 'bigSword':
    case 'knife': {
      const len = kind === 'bigSword' ? 7 : kind === 'knife' ? 3 : 6;
      return [
        segment(back(1.2), d, 1.4, 0.9, 0.9, 'leather'),
        box(add(h, scale(d, 0.4)), [2.6, 0.7, 0.7], 'gold'),
        segment(add(h, scale(d, 0.8)), d, len, 1, 0.7, 'steel'),
      ];
    }
    case 'spear':
    case 'pike':
    case 'javelin':
    case 'lance': {
      const len = kind === 'pike' ? 15 : kind === 'lance' ? 13 : kind === 'javelin' ? 8 : 13;
      const tail = kind === 'javelin' ? 3 : kind === 'lance' ? 4 : kind === 'pike' ? 6.5 : 5;
      return [
        segment(back(tail), d, len, kind === 'lance' ? 1.3 : 1, kind === 'lance' ? 1.3 : 1, kind === 'lance' ? 'team' : 'wood', kind === 'lance' ? (f, _a, b) => (b > 0.3 && f !== '-v' ? 'wood' : undefined) : undefined),
        segment(add(back(tail), scale(d, len)), d, 2, 1.2, 1.2, 'steel'),
      ];
    }
    case 'halberd': {
      const tip = add(back(5), scale(d, 13));
      return [segment(back(5), d, 13, 1, 1, 'wood'), box(add(tip, scale(d, -1.5)), [0.8, 2.6, 2.6], 'steel'), segment(tip, d, 1.6, 1, 1, 'steel')];
    }
    case 'bow':
    case 'longbow': {
      // El arco va en la mano izquierda, vertical, curvado hacia delante; la cuerda, hacia la derecha si está tenso.
      const half = kind === 'longbow' ? 6 : 4.2;
      const mid = handL;
      const top = add(mid, [0, half, -0.8]);
      const bottom = add(mid, [0, -half, -0.8]);
      const string: Vec3 = pose.drawn ? add(mid, [1.2, 0, -2.6]) : add(mid, [0, 0, -1.3]);
      return [
        segment(add(mid, [0, -half * 0.35, 0]), UP, half * 0.7, 1.5, 1.2, 'woodDark'),
        segment(add(mid, [0, half * 0.35, 0]), normalize([0, half * 0.65, -0.8]), half * 0.68, 1.4, 1.1, 'woodDark'),
        segment(add(mid, [0, -half * 0.35, 0]), normalize([0, -half * 0.65, -0.8]), half * 0.68, 1.4, 1.1, 'woodDark'),
        segment(top, add(string, scale(top, -1)), Math.hypot(...add(string, scale(top, -1))), 0.5, 0.5, 'string'),
        segment(string, add(bottom, scale(string, -1)), Math.hypot(...add(bottom, scale(string, -1))), 0.5, 0.5, 'string'),
      ];
    }
    case 'crossbow': {
      const fwdDir: Vec3 = normalize([0, 0.05, 1]);
      const stock = add(h, [-1.5, 0.6, 0]);
      const front = add(stock, scale(fwdDir, 6));
      return [segment(add(stock, scale(fwdDir, -1)), fwdDir, 7, 1.2, 1.2, 'wood'), box(front, [6, 0.8, 0.8], 'woodDark'), box(add(front, [0, 0, -0.9]), [5, 0.4, 0.4], 'string')];
    }
    case 'arquebus': {
      const fwdDir: Vec3 = normalize([0, 0.05 + (pose.drawn ? 0.08 : 0), 1]);
      const stock = add(h, [-1.6, 0.8, -1]);
      return [segment(stock, scale(fwdDir, -1), 3, 1.5, 1.5, 'wood'), segment(stock, fwdDir, 9, 1, 1, 'iron')];
    }
    case 'staff':
      return [segment(add(h, [0, -6, 0]), UP, 14, 1, 1, 'wood'), ell(add(h, [0, 8.5, 0]), [2, 2, 2], 'gold')];
    case 'axe':
      return [segment(back(1), d, 5.5, 0.9, 0.9, 'wood'), head(add(add(h, scale(d, 4.2)), scale(side, 0.6)), 2.4, 0.9, 1.8, 'steel')];
    case 'pick':
      return [segment(back(1), d, 5.5, 0.9, 0.9, 'wood'), head(add(h, scale(d, 4.4)), 4.4, 0.8, 0.8, 'iron')];
    case 'hoe':
      return [segment(back(2), d, 7, 0.9, 0.9, 'wood'), head(add(add(h, scale(d, 5)), scale(side, 0.9)), 2.2, 0.7, 1.4, 'iron')];
    case 'hammer':
      return [segment(back(0.8), d, 4.6, 0.9, 0.9, 'wood'), head(add(h, scale(d, 3.6)), 2.2, 1.5, 1.5, 'iron')];
    case 'basket': {
      // Cesta de mimbre colgada de la mano izquierda, con las bayas por encima.
      const c = add(handL, [0, -1.2, 0.5]);
      return [shaped(box(c, [2.8, 2, 2.6], 'straw', (face) => (face === '+v' ? 'berry' : undefined)), 'cyl', 0.8)];
    }
    default:
      return [];
  }
}

function shield(kind: NonNullable<HumanLook['shield']>, handL: Vec3, hipY: number): Prim[] {
  if (kind === 'pavise') {
    // El pavés va a la espalda.
    return [
      shaped(
        box([0, hipY + 2.4, -2.3], [5.6, 8, 0.9], 'team', (face, a, b) => ((face === '-w' || face === '+w') && Math.abs(a) < 0.18 && Math.abs(b) < 0.7 ? 'gold' : undefined)),
        'rbox',
        0.92,
      ),
    ];
  }
  const c = add(handL, [-1.1, 0.9, 0.4]);
  if (kind === 'round' || kind === 'adarga') {
    // Escudo redondo: un disco con su umbo; la adarga, de cuero con el centro del color del jugador.
    const adarga = kind === 'adarga';
    return [
      disc(c, adarga ? 4.8 : 4.6, 0.8, [1, 0, 0], adarga ? 'leather' : 'team', (face, a, b) => {
        if (face !== '+v' && face !== '-v') return adarga ? 'leather' : 'iron';
        const r = Math.max(Math.abs(a), Math.abs(b));
        if (r < 0.34) return adarga ? 'team' : 'steel';
        return !adarga && r > 0.86 ? 'iron' : undefined;
      }),
    ];
  }
  // Escudo de cometa: ancho arriba y en punta abajo, con una cruz dorada.
  return [
    shaped(
      box(add(c, [0, -0.4, 0]), [0.8, 6.2, 4], 'team', (face, a, b) => (face === '-u' || face === '+u' ? (Math.abs(a) < 0.16 || Math.abs(b - 0.25) < 0.12 ? 'gold' : undefined) : undefined)),
      'rbox',
      0.45,
    ),
  ];
}

// ── Cuadrúpedos ─────────────────────────────────────────────────────────

export interface BeastLook {
  readonly coat: string;
  readonly dark: string;
  /** Ancho, alto y largo del cuerpo; altura de las patas. */
  readonly body: Vec3;
  readonly legLen: number;
  readonly legThick: number;
  readonly neck: { readonly len: number; readonly angle: number; readonly thick: number };
  readonly head: Vec3;
  readonly headAngle: number;
  /** Cuánto se estrecha el hocico (1 = nada). */
  readonly muzzle?: number;
  /** Largo de las orejas (0 = sin orejas). */
  readonly ears?: number;
  readonly tail?: number;
  readonly tailThick?: number;
  /** Parte de la caña de la pata con el color oscuro (cascos, pezuñas, patas negras de la oveja). */
  readonly socks?: number;
  readonly extra?: 'antlers' | 'tusks' | 'wool' | 'mane';
  /** Gualdrapa del color del jugador (caballo de caballero pesado). */
  readonly barding?: boolean;
}

export interface BeastPose {
  /** Fase del paso (radianes) y amplitud en grados; 0 = quieto. */
  readonly gait?: number;
  readonly stride?: number;
  readonly bob?: number;
  /** Cabeza agachada (pastar, embestir), en grados. */
  readonly headDown?: number;
  /** Caída de lado al morir (0–90). */
  readonly fall?: number;
}

/** Piezas del animal y dónde quedan la boca y la cruz (para las riendas y la silla). */
interface BeastBuild {
  readonly prims: Prim[];
  readonly mouth: Vec3;
}

/** Ruido fijo de 0 a 1 por celda (rizos de la lana). */
function cellNoise(x: number, y: number, s: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function buildBeast(look: BeastLook, pose: BeastPose): BeastBuild {
  const P: Prim[] = [];
  const [w, hgt, len] = look.body;
  const bob = pose.bob ?? 0;
  const bodyY = look.legLen + hgt / 2 + bob;
  const coat = look.coat;

  // Cuerpo: un barril con el pecho y la grupa algo más altos (elipsoides que se solapan sin línea entre ellos).
  const part = (c: Vec3, s: Vec3): Prim => ({ ...ell(c, s, coat), group: 'body' });
  P.push(part([0, bodyY - hgt * 0.02, 0], [w * 0.94, hgt * 0.94, len * 0.92]));
  P.push(part([0, bodyY + hgt * 0.03, len * 0.27], [w, hgt, len * 0.52]));
  P.push(part([0, bodyY + hgt * 0.05, -len * 0.27], [w * 1.02, hgt, len * 0.52]));
  if (look.extra === 'wool') {
    // Vellón abultado con rizos.
    P.push({
      ...ell([0, bodyY + 0.3, -0.2], [w + 1, hgt + 0.9, len + 0.6], 'sheepWool', (face, a, b) =>
        cellNoise(Math.floor(a * 3.5), Math.floor(b * 3.5), face.charCodeAt(1) + face.charCodeAt(0)) < 0.3 ? 'sheepCurl' : undefined,
      ),
      group: 'body',
    });
  }
  if (look.barding) {
    P.push({ ...ell([0, bodyY + 0.2, 0], [w + 1, hgt + 0.8, len + 1.4], 'team'), group: 'barding' });
    P.push({
      ...shaped(box([0, look.legLen * 0.62 + bob, 0], [w + 1.3, look.legLen * 0.62, len + 1.2], 'team', (face, _a, b) => (face !== '+v' && b < -0.72 ? 'gold' : undefined)), 'cyl', 1.06),
      group: 'barding',
    });
  }

  // Patas: diagonales a la par al andar; la que se levanta dobla la rodilla.
  const stride = pose.stride ?? 0;
  const g = pose.gait ?? 0;
  const t = look.legThick;
  const socks = look.socks ?? 0.14;
  const hoof: Prim['paint'] = (face, _a, b) => (face === '-v' || b < -1 + 2 * socks ? look.dark : undefined);
  const legs: [number, number, number][] = [
    [-1, 1, g],
    [1, 1, g + Math.PI],
    [-1, -1, g + Math.PI],
    [1, -1, g],
  ];
  legs.forEach(([sx, sz, ph], i) => {
    const swing = stride * Math.sin(ph);
    const bend = stride ? Math.max(0, Math.cos(ph)) * 55 * (sz > 0 ? 1 : 0.7) : 0;
    const top: Vec3 = [sx * (w / 2 - t * 0.55), look.legLen + bob + 0.4, sz * (len / 2 - t * 0.9)];
    // Muslo, caña y casco suman lo justo para que el casco apoye en el suelo.
    const upperLen = look.legLen * 0.5 + 0.4;
    const lowerLen = look.legLen * 0.5 - 0.6;
    // Las traseras hacen zigzag por el corvejón: el muslo hacia delante y la caña hacia atrás.
    const hind = sz < 0;
    const d1 = fwd(DOWN, swing + (hind ? 14 : 0));
    const d2 = fwd(DOWN, swing - bend - (hind ? 16 : 0));
    const group = `leg${i}`;
    P.push(cyl(top, d1, upperLen, t * 1.3, t * 1.45, coat, 0.74, undefined, group));
    const joint = add(top, scale(d1, upperLen - 0.3));
    P.push(cyl(joint, d2, lowerLen, t * 0.95, t, coat, 0.88, hoof, group));
    // Casco (o pezuña): una pieza oscura al pie.
    P.push(cyl(add(joint, scale(d2, lowerLen - 0.2)), d2, 0.9, t * 1.15, t * 1.25, look.dark === 'hoof' ? 'hoof' : look.dark, 1.15, undefined, group));
  });

  // Cuello y cabeza. Los ángulos se miden desde la vertical hacia delante (+z): `fwd` con UP inclina hacia
  // atrás, de ahí el signo.
  const neckFrom: Vec3 = [0, bodyY + hgt * 0.22, len / 2 - 0.4];
  const neckDir = fwd(UP, -(look.neck.angle + (pose.headDown ?? 0)));
  const neck = cyl(neckFrom, neckDir, look.neck.len, look.neck.thick, look.neck.thick * 1.35, coat, 0.78, undefined, 'head');
  P.push(neck);
  if (look.extra === 'mane') {
    // Crin: una tira con volumen a lo largo de la cresta del cuello, y el copete sobre la frente.
    const maneMat = look.dark === 'hoof' ? 'horseDark' : look.dark;
    P.push({ ...cyl(add(neckFrom, scale(neck.w, look.neck.thick * 0.62)), neckDir, look.neck.len * 1.02, 0.9, 1.1, maneMat, 0.7), group: 'head' });
  }
  const neckEnd = add(neckFrom, scale(neckDir, look.neck.len));
  const headDir = fwd(UP, -(look.headAngle + (pose.headDown ?? 0)));
  const headFrom = add(neckEnd, scale(headDir, -0.9));
  const headMat = look.extra === 'wool' ? 'sheepFace' : coat;
  const head: Prim = {
    ...shaped(
      segment(headFrom, headDir, look.head[2], look.head[0], look.head[1], headMat, (face, a, b) =>
        (face === '+u' || face === '-u') && b > 0.1 && b < 0.45 && a > 0.05 && a < 0.55 ? 'eye' : face === '-v' ? look.dark === 'hoof' ? 'horseDark' : look.dark : undefined,
      ),
      'rbox',
      look.muzzle ?? 0.7,
    ),
    group: 'head',
  };
  P.push(head);
  const headTip = add(headFrom, scale(headDir, look.head[2]));
  if (look.ears) {
    for (const s of [-1, 1]) {
      const base = add(add(headFrom, scale(headDir, 0.7)), add(scale(head.w, look.head[1] * 0.42), [s * look.head[0] * 0.3, 0, 0]));
      P.push({ ...segment(base, normalize([s * 0.3, 1, -0.35]), look.ears, 0.7, 0.6, headMat), group: 'head' });
    }
  }
  if (look.extra === 'antlers') {
    for (const s of [-1, 1]) {
      const base = add(add(headFrom, scale(headDir, 0.8)), add(scale(head.w, look.head[1] * 0.4), [s * 0.6, 0, 0]));
      P.push(segment(base, normalize([s * 0.6, 1, -0.3]), 3.2, 0.6, 0.6, 'antler'));
      P.push(segment(add(base, [s * 1.2, 2, -0.6]), normalize([s * 0.2, 0.6, 1]), 1.8, 0.6, 0.6, 'antler'));
    }
  }
  if (look.extra === 'tusks') for (const s of [-1, 1]) P.push(segment(add(headTip, [s * 0.9, -0.2, -0.8]), normalize([s * 0.3, 1, 0.6]), 1.6, 0.5, 0.5, 'tusk'));
  if (look.tail) {
    // La cola: arranca hacia arriba y atrás y cae; se balancea al andar.
    const sway = stride ? Math.sin(g) * 14 : 0;
    const tailMat = look.dark === 'hoof' ? 'horseDark' : look.dark;
    const thick = look.tailThick ?? 1;
    const root: Vec3 = [0, bodyY + hgt * 0.32, -len / 2 + 0.2];
    const rootDir = normalize([0, 0.5, -1]);
    const rootLen = Math.min(1.6, look.tail * 0.3);
    P.push({ ...cyl(root, rootDir, rootLen, thick * 0.8, thick * 0.8, tailMat, 0.9), group: 'tail' });
    P.push({ ...cyl(add(root, scale(rootDir, rootLen - 0.2)), roll(normalize([0, -1, -0.45]), sway), look.tail, thick, thick, tailMat, 0.55), group: 'tail' });
  }
  return { prims: P, mouth: add(headFrom, scale(headDir, look.head[2] * 0.85)) };
}

export function beast(look: BeastLook, pose: BeastPose = {}): Prim[] {
  const P = buildBeast(look, pose).prims;
  const fall = pose.fall ?? 0;
  if (!fall) return P;
  return fallSideways(P, look.body[0], fall);
}

/** Tumba de lado (al morir) y recoloca para que quede tendido sobre su casilla. */
function fallSideways(P: Prim[], width: number, fall: number): Prim[] {
  const side: Vec3 = [width / 2, 0, 0];
  const shift: Vec3 = [-(fall / 90) * 7, 0, 0];
  return transformPrims(P, (p) => add(add(side, roll(add(p, scale(side, -1)), -fall)), shift), (v) => roll(v, -fall));
}

export const HORSE: BeastLook = {
  coat: 'horse',
  dark: 'hoof',
  body: [4.5, 4.9, 12.6],
  legLen: 7,
  legThick: 1.25,
  neck: { len: 6.4, angle: 46, thick: 2.7 },
  head: [2.1, 2.6, 5],
  headAngle: 140,
  muzzle: 0.62,
  ears: 1.2,
  tail: 5.6,
  tailThick: 1.8,
  socks: 0.1,
  extra: 'mane',
};

/** Jinete sobre su caballo, con la silla, la manta del color del jugador y las riendas. */
export function rider(look: HumanLook, horse: BeastLook, hp: HumanPose, bp: BeastPose): Prim[] {
  const b = buildBeast(horse, { ...bp, fall: 0 });
  const seat = horse.legLen + horse.body[1] + (bp.bob ?? 0) - 0.3;
  const z = -0.6;
  const tack: Prim[] = [{ ...shaped(box([0, seat - 0.1, z], [horse.body[0] * 0.75, 1.2, 3.4], 'leather'), 'rbox'), group: 'tack' }];
  if (!horse.barding) {
    tack.push({
      ...shaped(box([0, seat - 1.3, z + 0.2], [horse.body[0] + 1, 2.8, 4.6], 'team', (face, _a, bb) => (face !== '+v' && bb < -0.7 ? 'linen' : undefined)), 'rbox'),
      group: 'tack',
    });
  }
  const reinsTo: Vec3 = [0, seat + 3.2, z + 2.2];
  const reins = add(reinsTo, scale(b.mouth, -1));
  tack.push(segment(b.mouth, reins, Math.hypot(...reins), 0.45, 0.45, 'leather'));
  const parts = [...b.prims, ...tack, ...human(look, { ...hp, seatY: seat, fall: 0 }).map((p) => ({ ...p, center: add(p.center, [0, 0, z]) as Vec3 }))];
  const fall = bp.fall ?? 0;
  if (!fall) return parts;
  return fallSideways(parts, horse.body[0], fall);
}

// ── Asedio y carros ─────────────────────────────────────────────────────


function wheels(x: number, zs: readonly number[], r: number, mat = 'woodDark'): Prim[] {
  const out: Prim[] = [];
  for (const z of zs) for (const s of [-1, 1]) out.push(box([s * x, r, z], [1, r * 2, r * 2], mat, (_face, a, b) => (Math.abs(a) < 0.25 && Math.abs(b) < 0.25 ? 'iron' : undefined)));
  return out;
}

/** Ariete: caseta con tejado de pieles y un tronco con cabeza de hierro que sale por delante. */
export function ram(thrust: number, bob = 0): Prim[] {
  const y = bob;
  return [
    ...wheels(3.3, [-3.5, 3.5], 1.6),
    box([0, 3.6 + y, 0], [6, 2.4, 11], 'wood'),
    segment([-2.4, 4.6 + y, 0], normalize([1, 1.1, 0]), 4, 1, 11, 'hide'),
    segment([2.4, 4.6 + y, 0], normalize([-1, 1.1, 0]), 4, 1, 11, 'hide'),
    box([0, 7.6 + y, 0], [1.4, 1, 11.4], 'team'),
    segment([0, 3.6 + y, -2 + thrust], [0, 0, 1], 9, 1.8, 1.8, 'woodDark'),
    box([0, 3.6 + y, 7.4 + thrust], [2.4, 2.4, 1.6], 'iron'),
  ];
}

/** Trabuquete: `deploy` 0 = recogido en su carro, 1 = montado; `arm` gira el brazo al disparar. */
export function trebuchet(deploy: number, arm: number, bob = 0): Prim[] {
  if (deploy <= 0.01) {
    return [
      ...wheels(2.6, [-4, 4], 1.5),
      box([0, 3 + bob, 0], [4.6, 1.4, 11], 'wood'),
      box([0, 4.4 + bob, 0], [1.8, 1.8, 15], 'woodDark'),
      box([0, 5.6 + bob, -5], [3.2, 2.6, 3], 'iron'),
      box([0, 5.6 + bob, 4], [1.2, 1.2, 1.2], 'team'),
    ];
  }
  const h = 6 + 10 * deploy;
  const pivot: Vec3 = [0, h, 0];
  const armDir = fwd(UP, -50 + arm);
  return [
    box([0, 0.8, 0], [7, 1.4, 12], 'woodDark'),
    segment([-3, 1, -4], normalize([0.25, h, 4]), Math.hypot(h, 4), 1.2, 1.2, 'wood'),
    segment([-3, 1, 4], normalize([0.25, h, -4]), Math.hypot(h, 4), 1.2, 1.2, 'wood'),
    segment([3, 1, -4], normalize([-0.25, h, 4]), Math.hypot(h, 4), 1.2, 1.2, 'wood'),
    segment([3, 1, 4], normalize([-0.25, h, -4]), Math.hypot(h, 4), 1.2, 1.2, 'wood'),
    box(pivot, [7, 1, 1], 'iron'),
    segment(add(pivot, scale(armDir, -4 * deploy)), armDir, 4 + 12 * deploy, 1.2, 1.2, 'wood'),
    box(add(pivot, scale(armDir, -4.5 * deploy)), [3.4, 3, 3], 'iron'),
    box([0, 1.6, 6.4], [1.2, 1.2, 1.2], 'team'),
  ];
}

/** Bombarda: cañón de hierro sobre una cureña de madera. `recoil` lo echa hacia atrás al disparar. */
export function bombard(recoil: number, bob = 0): Prim[] {
  const z = -recoil;
  return [
    ...wheels(2.8, [-2.5 + z], 2.2),
    box([0, 2 + bob, z], [4, 2, 9], 'wood'),
    segment([0, 4.2 + bob, -3 + z], normalize([0, 0.12, 1]), 10, 3, 3, 'iron', (_face, _a, b) => (Math.abs(b - 0.2) < 0.12 || Math.abs(b + 0.5) < 0.12 ? 'woodDark' : undefined)),
    box([0, 2.4 + bob, -4.6 + z], [2, 1, 2], 'team'),
  ];
}

/** Carro de comercio tirado por un caballo pequeño. */
export function tradeCart(bp: BeastPose): Prim[] {
  const pony: BeastLook = { ...HORSE, body: [3.2, 3, 7], legLen: 4.4, head: [1.6, 2, 3.6], neck: { len: 3.8, angle: 38, thick: 1.8 } };
  const horse = beast(pony, bp).map((p) => ({ ...p, center: add(p.center, [0, 0, 6]) as Vec3 }));
  const bob = bp.bob ?? 0;
  return [
    ...horse,
    segment([-1.6, 4 + bob, 1.5], [0, 0, 1], 5, 0.6, 0.6, 'wood'),
    segment([1.6, 4 + bob, 1.5], [0, 0, 1], 5, 0.6, 0.6, 'wood'),
    ...wheels(2.9, [-2.2], 2.1).map((p) => ({ ...p, center: add(p.center, [0, bob * 0, 0]) as Vec3 })),
    box([0, 3.4 + bob, -2.2], [5, 1.4, 6], 'wood'),
    box([-0.8, 5 + bob, -2.6], [2.6, 2, 2.8], 'linen'),
    box([1.2, 5 + bob, -1.4], [2, 1.8, 2.2], 'team'),
    box([0.6, 4.8 + bob, -4.2], [2.4, 1.6, 1.8], 'gold'),
  ];
}
