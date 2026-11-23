import { hash2 } from '../engine/rng';
import { createCanvas } from '../render/pixel-canvas';

/**
 * Piel del HUD (docs/arte.md §7) generada en pixel art al arrancar: madera oscura con vetas, marcos con
 * clavos y filete de oro, pergamino con fibras, botones biselados con un borde del color de su categoría
 * (económico ocre, militar rojo, tecnología azul) y los cursores propios. Todo se pasa al CSS como
 * variables con data URLs y se dibuja a escala entera (x2) con `image-rendering: pixelated`.
 */

type Px = (x: number, y: number, color: string) => void;

function image(w: number, h: number, draw: (px: Px) => void): string {
  const { canvas, ctx } = createCanvas(w, h);
  draw((x, y, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
  });
  return canvas.toDataURL();
}

const rnd = (x: number, y: number, s: number) => (hash2(x, y, s) & 0xffff) / 0x10000;

/** Tablas de madera horizontales con vetas (se repite en mosaico). */
function woodTile(base: readonly string[], seed: number): string {
  return image(32, 32, (px) => {
    for (let y = 0; y < 32; y++) {
      const plank = Math.floor(y / 8);
      const seam = y % 8 === 7;
      const shift = (plank * 11) % 32;
      for (let x = 0; x < 32; x++) {
        let i = 1;
        if (seam) i = 0;
        else if (y % 8 === 0) i = 2;
        else {
          const grain = Math.sin(((x + shift) / 32) * Math.PI * 4 + plank * 1.7 + (y % 8) * 0.9);
          if (grain > 0.85) i = 2;
          else if (grain < -0.92) i = 0;
          if (rnd(x, y, seed) < 0.05) i = Math.max(0, i - 1);
        }
        // Junta vertical de las tablas, alternada.
        if (!seam && (x + shift) % 32 === 0) i = 0;
        px(x, y, base[i]);
      }
    }
  });
}

/** Pergamino: crema con fibras y motas (se repite en mosaico). */
function parchmentTile(): string {
  const tones = ['#c8b48a', '#dcc89a', '#e8d6a2', '#efe0b4'];
  return image(48, 48, (px) => {
    for (let y = 0; y < 48; y++) {
      for (let x = 0; x < 48; x++) {
        const fiber = Math.sin(x * 0.21 + y * 0.05 + Math.sin(y * 0.31) * 1.2);
        let i = fiber > 0.985 && rnd(x >> 2, y, 0xf1b) < 0.5 ? 1 : 2;
        const r = rnd(x, y, 0xa11);
        if (r < 0.04) i = 1;
        else if (r > 0.985) i = 0;
        else if (r > 0.94) i = 3;
        px(x, y, tones[i]);
      }
    }
  });
}

/**
 * Marco de 9 trozos (10×10, cortes de 5): contorno oscuro, bisel de madera, filete de oro por dentro y un clavo
 * en cada esquina. El centro queda transparente para que se vea el fondo.
 */
function woodFrame(): string {
  return image(10, 10, (px) => {
    const edge = (x: number, y: number) => Math.min(x, y, 9 - x, 9 - y);
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const d = edge(x, y);
        if (d === 0) px(x, y, '#140d08');
        else if (d === 1) px(x, y, x <= y ? '#7a5232' : '#5c3d24');
        else if (d === 2) px(x, y, '#3b2716');
        else if (d === 3) px(x, y, '#a8782a');
        else if (d === 4) px(x, y, '#2b1d14');
      }
    }
    // Clavos de hierro en las esquinas.
    for (const [cx, cy] of [
      [1, 1],
      [7, 1],
      [1, 7],
      [7, 7],
    ]) {
      px(cx, cy, '#5a5f6c');
      px(cx + 1, cy, '#3e424c');
      px(cx, cy + 1, '#3e424c');
      px(cx + 1, cy + 1, '#24262c');
    }
  });
}

/**
 * Marco fino dorado (6×6, cortes de 3) para las tiras de la barra de arriba: contorno oscuro, filete de oro y
 * sombra por dentro, con un punto claro en cada esquina.
 */
function giltFrame(): string {
  return image(6, 6, (px) => {
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 6; x++) {
        const d = Math.min(x, y, 5 - x, 5 - y);
        if (d === 0) px(x, y, '#140d08');
        else if (d === 1) px(x, y, x <= y ? '#c8963c' : '#a8782a');
        else if (d === 2) px(x, y, '#2b1d14');
      }
    }
    for (const [cx, cy] of [
      [1, 1],
      [4, 1],
      [1, 4],
      [4, 4],
    ])
      px(cx, cy, '#f2dc6a');
  });
}

/** Marco del pergamino: contorno marrón y el borde algo tostado. */
function parchmentFrame(): string {
  return image(6, 6, (px) => {
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 6; x++) {
        const d = Math.min(x, y, 5 - x, 5 - y);
        if (d === 0) px(x, y, '#2b1d14');
        else if (d === 1) px(x, y, '#9a7a4a');
        else if (d === 2) px(x, y, '#c8b48a');
      }
    }
  });
}

/** Botón biselado (8×8, cortes de 4): luz arriba a la izquierda, sombra abajo a la derecha y un filete de color. */
function buttonFrame(accent: string, rim = '#140d08'): string {
  return image(8, 8, (px) => {
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const d = Math.min(x, y, 7 - x, 7 - y);
        if (d === 0) px(x, y, rim);
        else if (d === 1) px(x, y, accent);
        else if (d === 2) px(x, y, x + y < 7 ? '#8a6440' : '#2b1d14');
      }
    }
  });
}

// ── Cursores (16×16, dibujados a x2) ─────────────────────────────────

const CURSOR_COLORS: Readonly<Record<string, string>> = {
  k: '#140d08',
  s: '#dfe4ec',
  S: '#a0a8b8',
  z: '#6a7080',
  g: '#e3b23c',
  G: '#a8782a',
  w: '#9a6c42',
  W: '#5c3d24',
  f: '#f2c9a0',
  F: '#b97a50',
  i: '#5a5f6c',
};

/** Cursores de texto: cada carácter es un píxel ('.' transparente). El punto activo va en `hot`. */
const CURSORS = {
  /** Guantelete que señala (por defecto). */
  hand: {
    hot: [1, 1],
    rows: [
      'kk..............',
      'kssk............',
      'kSssk...........',
      '.kSssk..........',
      '..kSssk.........',
      '...kSsskkk......',
      '....kSsSssk.....',
      '....kSsSsSsk....',
      '...kkSSsSsSsk...',
      '..kSskSSSSSSk...',
      '..kSSSSzSSSzk...',
      '...kzSSSSzSk....',
      '....kzzzzzk.....',
      '.....kkkkk......',
      '................',
      '................',
    ],
  },
  /** Espada: atacar. */
  sword: {
    hot: [1, 1],
    rows: [
      'kk..............',
      'ksk.............',
      'kSsk............',
      '.kSsk...........',
      '..kSsk..........',
      '...kSsk.........',
      '....kSsk........',
      '.....kSsk.......',
      '......kSsk.kk...',
      '.......kSskgk...',
      '........kSgGk...',
      '.......kgGwk....',
      '......kgkkWwk...',
      '......kk...kWk..',
      '............kk..',
      '................',
    ],
  },
  /** Hacha: talar. */
  axe: {
    hot: [3, 2],
    rows: [
      '................',
      '...kkk..........',
      '..kSssk.........',
      '.kSsssskk.......',
      '.kzSssskWk......',
      '..kzSskwWk......',
      '...kzkwWk.......',
      '.....kwWk.......',
      '......kwWk......',
      '.......kwWk.....',
      '........kwWk....',
      '.........kwWk...',
      '..........kwWk..',
      '...........kkk..',
      '................',
      '................',
    ],
  },
  /** Pico: minar. */
  pick: {
    hot: [2, 2],
    rows: [
      '................',
      '..kkkk..........',
      '.kSsssk.........',
      '..kkkSsk........',
      '.....kSsk.......',
      '....kwkSsk......',
      '...kwWkkzk......',
      '..kwWk..k.......',
      '.kwWk...........',
      'kwWk............',
      'kWk.............',
      '.k..............',
      '................',
      '................',
      '................',
      '................',
    ],
  },
  /** Hoz: recoger comida. */
  sickle: {
    hot: [8, 1],
    rows: [
      '......kkkk......',
      '....kkSsssk.....',
      '...kSskkkSsk....',
      '..kSk.....kSk...',
      '..kSk......kk...',
      '..kSk...........',
      '...kSk..........',
      '....kSkk........',
      '.....kkwk.......',
      '.......kwk......',
      '........kwk.....',
      '.........kWk....',
      '..........kk....',
      '................',
      '................',
      '................',
    ],
  },
  /** Martillo: construir y reparar. */
  hammer: {
    hot: [3, 3],
    rows: [
      '................',
      '..kkkkk.........',
      '.kiiiiik........',
      '.kSssssk........',
      '..kkkzkk........',
      '....kwWk........',
      '.....kwWk.......',
      '......kwWk......',
      '.......kwWk.....',
      '........kwWk....',
      '.........kwWk...',
      '..........kkk...',
      '................',
      '................',
      '................',
      '................',
    ],
  },
} as const;

export type CursorKind = keyof typeof CURSORS;

/** Valor CSS de un cursor propio (con su punto activo), a escala x2. */
function cursorCss(kind: CursorKind): string {
  const c = CURSORS[kind];
  const url = image(32, 32, (px) => {
    c.rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch === '.') return;
        const color = CURSOR_COLORS[ch];
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) px(x * 2 + dx, y * 2 + dy, color);
      });
    });
  });
  return `url(${url}) ${c.hot[0] * 2} ${c.hot[1] * 2}, auto`;
}

// ── Iconos de la barra de arriba (9×9, para pantallas estrechas) ─────

const ICON_COLORS: Readonly<Record<string, string>> = {
  k: '#140d08',
  p: '#efe0b4',
  g: '#e3b23c',
  G: '#a8782a',
  s: '#dfe4ec',
  S: '#8a92a2',
  w: '#9a6c42',
  b: '#5c3d24',
  r: '#c0392b',
};

const ICONS = {
  /** Corchea: música. */
  music: ['.....kk..', '.....kpk.', '.....kppk', '.....k.kk', '.....k...', '..kkkk...', '.kppppk..', '.kppppk..', '..kkkk...'],
  /** Tres barras: menú. */
  menu: ['.........', 'kkkkkkkkk', 'kpppppppk', 'kkkkkkkkk', 'kpppppppk', 'kkkkkkkkk', 'kpppppppk', 'kkkkkkkkk', '.........'],
  /** Altavoz con ondas: sonido. */
  sound: ['....kk...', '...kpk.k.', 'kkkppk..k', 'kpppppk.k', 'kpppppk.k', 'kkkppk..k', '...kpk.k.', '....kk...', '.........'],
  /** Datos de la selección: espada (ataque), flecha (alcance), escudo (armadura), bota (velocidad), casa (población) y guarnición. */
  statAttack: ['......kkk', '.....ksSk', '....ksSk.', '...ksSk..', 'kk.kSk...', 'kgkSk....', '.kgk.....', 'kwkgk....', 'kkk.k....'],
  statRange: ['.....kkkk', '......ksk', '.....kwkk', '....kwk.k', '...kwk...', '..kwk....', '.rwk.....', 'rrk......', 'kr.......'],
  statArmor: ['.kkkkkkk.', 'ksssSsssk', 'ksSsSsSsk', 'ksssSsssk', 'kSSSSSSSk', '.kSsSsSk.', '.kSsSsSk.', '..kSSSk..', '...kkk...'],
  statSpeed: ['..kkkk...', '..kwwk...', '..kwwk...', '..kwwk...', '..kwwkk..', '..kwwwwkk', '.kwwwwwwk', '.kbbbbbbk', '..kkkkkk.'],
  statPop: ['....k....', '...krk...', '..krrrk..', '.krrrrrk.', 'kkkkkkkkk', '.kpppppk.', '.kpkkkpk.', '.kpkwkpk.', '.kkkkkkk.'],
  statGarrison: ['...kkk...', '..kpppk..', '..kpppk..', '...kkk...', '.kkSSSkk.', 'kSSSSSSSk', 'kSkSSSkSk', 'kSkSSSkSk', '.k.kkk.k.'],
  /** Cabeza de aldeano con sombrero de paja: ociosos. */
  idle: ['..kkkkk..', '.kgggggk.', 'kGGGGGGGk', '.kkpppkk.', '..kpkpk..', '..kpppk..', '...kkk...', '..kGgGk..', '.kGgggGk.'],
} as const;

function iconUrl(rows: readonly string[]): string {
  return image(rows[0].length, rows.length, (px) => {
    rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch !== '.') px(x, y, ICON_COLORS[ch]);
      });
    });
  });
}

export interface Skin {
  /** Cursor CSS por tipo. */
  readonly cursors: Readonly<Record<CursorKind, string>>;
}

/** Genera la piel y la aplica como variables CSS en `root`. */
export function applySkin(root: HTMLElement): Skin {
  const vars: Record<string, string> = {
    '--tex-wood': `url(${woodTile(['#24180f', '#3b2716', '#4a3220'], 0x3d)})`,
    '--tex-wood-light': `url(${woodTile(['#3b2716', '#5c3d24', '#6e4a2c'], 0x5e)})`,
    '--tex-parchment': `url(${parchmentTile()})`,
    '--frame-wood': `url(${woodFrame()})`,
    '--frame-parchment': `url(${parchmentFrame()})`,
    '--frame-gilt': `url(${giltFrame()})`,
    '--btn': `url(${buttonFrame('#5c3d24')})`,
    '--btn-eco': `url(${buttonFrame('#c8963c')})`,
    '--btn-mil': `url(${buttonFrame('#b8402a')})`,
    '--btn-tech': `url(${buttonFrame('#4a7ac8')})`,
    '--btn-hover': `url(${buttonFrame('#f2dc6a', '#e3b23c')})`,
    '--icon-music': `url(${iconUrl(ICONS.music)})`,
    '--icon-menu': `url(${iconUrl(ICONS.menu)})`,
    '--icon-sound': `url(${iconUrl(ICONS.sound)})`,
    '--icon-idle': `url(${iconUrl(ICONS.idle)})`,
    '--stat-attack': `url(${iconUrl(ICONS.statAttack)})`,
    '--stat-range': `url(${iconUrl(ICONS.statRange)})`,
    '--stat-armor': `url(${iconUrl(ICONS.statArmor)})`,
    '--stat-speed': `url(${iconUrl(ICONS.statSpeed)})`,
    '--stat-pop': `url(${iconUrl(ICONS.statPop)})`,
    '--stat-garrison': `url(${iconUrl(ICONS.statGarrison)})`,
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  const cursors = Object.fromEntries((Object.keys(CURSORS) as CursorKind[]).map((k) => [k, cursorCss(k)])) as Record<CursorKind, string>;
  document.documentElement.style.setProperty('--cursor-hand', cursors.hand);
  return { cursors };
}
