import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/600.css';
import '@fontsource/silkscreen/400.css';
import './gallery.css';
import { render } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { BUILDING_DEFS } from '../data/buildings';
import { ERA_DEFS } from '../data/eras';
import { UNIT_DEFS, UNIT_TYPE_COUNT, type UnitType } from '../data/units';
import { GameMap } from '../map/game-map';
import { Terrain } from '../map/terrain';
import { renderResourceIcon } from '../render/nature-art';
import { TEAM_COLORS } from '../render/palette';
import { type AnimName, JOB_NAMES, Job, type UnitModel, unitModel } from '../render/rig/catalog';
import { mirror } from '../render/rig/raster';
import { TerrainPainter } from '../render/terrain-art';
import { DIR8, type Dir8, UNIT_DETAIL, drawUnitFrame, drawnDir, unitCard } from '../render/unit-art';
import { applySkin } from '../ui/skin';

/**
 * Galería de unidades: todas las figuras del juego con sus animaciones, en las 8 direcciones y con el color
 * de cada jugador, sobre el mismo suelo de la partida. Sirve para repasar el arte (docs/arte.md §4) y como
 * ficha de cada unidad. Se abre en /galeria.html.
 */

applySkin(document.documentElement);

const CATEGORIES = ['Todas', 'Aldeanos', 'Infantería', 'A distancia', 'Caballería', 'Asedio', 'Apoyo', 'Fauna'] as const;
type Category = (typeof CATEGORIES)[number];

function categoryOf(type: UnitType): Exclude<Category, 'Todas'> {
  const c = UNIT_DEFS[type].classes;
  if (c.includes('villager')) return 'Aldeanos';
  if (c.includes('animal')) return 'Fauna';
  if (c.includes('siege')) return 'Asedio';
  if (c.includes('cavalry')) return 'Caballería';
  if (c.includes('archer')) return 'A distancia';
  if (c.includes('infantry')) return 'Infantería';
  return 'Apoyo';
}

const ANIM_NAMES: Readonly<Record<AnimName, string>> = {
  idle: 'Reposo',
  walk: 'Andar',
  attack: 'Atacar',
  die: 'Morir',
  chop: 'Talar',
  mine: 'Picar',
  farm: 'Cultivar',
  build: 'Construir',
  deploy: 'Montar',
  ready: 'Montado',
};

const DIR_ARROWS: Readonly<Record<Dir8, string>> = { S: '↓', SW: '↙', W: '←', NW: '↖', N: '↑', NE: '↗', E: '→', SE: '↘' };
const PLAYER_NAMES = ['Naturaleza', 'Azul', 'Rojo', 'Verde', 'Amarillo'];
const ZOOMS = [2, 3, 4, 6] as const;
const BACKGROUNDS = ['Hierba', 'Tierra', 'Oscuro', 'Pergamino'] as const;
type Background = (typeof BACKGROUNDS)[number];

/** Orden de la galería: por categoría, por era y por el orden de los datos. */
const UNITS: readonly UnitType[] = Array.from({ length: UNIT_TYPE_COUNT }, (_, i) => i as UnitType).sort(
  (a, b) => CATEGORIES.indexOf(categoryOf(a)) - CATEGORIES.indexOf(categoryOf(b)) || (UNIT_DEFS[a].era ?? 0) - (UNIT_DEFS[b].era ?? 0) || a - b,
);

/** Dónde se entrena cada unidad. */
const TRAINED_AT = new Map<UnitType, string>();
for (const def of Object.values(BUILDING_DEFS)) for (const u of def.trains) if (!TRAINED_AT.has(u)) TRAINED_AT.set(u, def.name);

// ── Suelos de fondo (pintados con el mismo pintor que el terreno de la partida) ──

function groundUrl(terrain: Terrain): string {
  const map = new GameMap(24, 24);
  map.terrain.fill(terrain);
  const w = 256;
  const h = 128;
  const rgba = new TerrainPainter(map).paint(-w / 2, 192 - h / 2, w, h, () => true);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
  return canvas.toDataURL();
}
const GROUNDS: Partial<Record<Background, string>> = { Hierba: groundUrl(Terrain.Grass), Tierra: groundUrl(Terrain.Dirt) };

function imageUrl(img: { width: number; height: number; rgba: Uint8ClampedArray }): string {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(img.rgba), img.width, img.height), 0, 0);
  return canvas.toDataURL();
}
const RESOURCE_ICONS = (['food', 'wood', 'stone', 'gold'] as const).map((k) => imageUrl(renderResourceIcon(k)));
const RESOURCE_NAMES = ['comida', 'madera', 'piedra', 'oro'];

// ── Fotogramas ──

const frameCache = new Map<string, HTMLCanvasElement>();

/** Fotograma ya pintado (y reflejado si la dirección lo pide), guardado para no repetirlo. */
function frameCanvas(type: UnitType, player: number, anim: AnimName, dir8: Dir8, f: number, look: number, job: Job): HTMLCanvasElement {
  const m = unitModel(type);
  const jb = m.jobs && (anim === 'idle' || anim === 'walk') ? job : Job.None;
  const key = `${type}:${player}:${anim}:${dir8}:${f}:${look}:${jb}`;
  let canvas = frameCache.get(key);
  if (canvas) return canvas;
  const { dir, flip } = drawnDir(dir8);
  let r = drawUnitFrame(m, TEAM_COLORS[player], anim, dir, f, look, jb, UNIT_DETAIL);
  if (flip) r = mirror(r);
  canvas = document.createElement('canvas');
  canvas.width = r.width;
  canvas.height = r.height;
  canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(r.rgba), r.width, r.height), 0, 0);
  frameCache.set(key, canvas);
  return canvas;
}

/** Retrato del HUD (la tarjeta de 44×44) de una unidad y un jugador. */
const portraitCache = new Map<string, string>();
function portraitUrl(type: UnitType, player: number): string {
  const key = `${type}:${player}`;
  let url = portraitCache.get(key);
  if (!url) {
    url = imageUrl(unitCard(type, unitModel(type), TEAM_COLORS[player]));
    portraitCache.set(key, url);
  }
  return url;
}

/** Sombra en el suelo como la de la partida (elipse 2:1 bajo los pies). */
function drawShadow(ctx: CanvasRenderingContext2D, m: UnitModel): void {
  ctx.save();
  ctx.scale(UNIT_DETAIL, UNIT_DETAIL);
  drawShadowAt1x(ctx, m);
  ctx.restore();
}

function drawShadowAt1x(ctx: CanvasRenderingContext2D, m: UnitModel): void {
  const [w, h] = m.bigRing ? [22, 9] : [12, 5];
  const x0 = Math.round(m.originX + 1 - w / 2);
  const y0 = Math.round(m.originY - h / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x + 0.5 - w / 2) / (w / 2);
      const ny = (y + 0.5 - h / 2) / (h / 2);
      const d = nx * nx + ny * ny;
      if (d > 1) continue;
      ctx.fillStyle = d < 0.45 ? 'rgba(20,13,8,0.34)' : 'rgba(20,13,8,0.2)';
      ctx.fillRect(x0 + x, y0 + y, 1, 1);
    }
  }
}

// ── Reloj compartido: un solo requestAnimationFrame para todas las fichas ──

const ticker = new Set<(t: number) => void>();
const clock = { playing: true, t: 0, last: performance.now() };
function loop(now: number): void {
  if (clock.playing) clock.t += now - clock.last;
  clock.last = now;
  for (const draw of ticker) draw(clock.t);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

type DirMode = Dir8 | 'spin';
const dirAt = (mode: DirMode, t: number): Dir8 => (mode === 'spin' ? DIR8[Math.floor(t / 1100) % DIR8.length] : mode);

interface Settings {
  readonly player: number;
  readonly zoom: number;
  readonly bg: Background;
  readonly dir: DirMode;
}

function stageStyle(s: Settings, cell: number): Record<string, string> {
  const ground = GROUNDS[s.bg];
  return {
    width: `${cell * s.zoom}px`,
    height: `${cell * s.zoom}px`,
    backgroundImage: ground ? `url(${ground})` : 'none',
    backgroundSize: `${256 * s.zoom}px ${128 * s.zoom}px`,
  };
}

// ── Componentes ──

function Chip(props: { active: boolean; onClick: () => void; children: preact.ComponentChildren; title?: string }) {
  return (
    <button type="button" class={`chip${props.active ? ' on' : ''}`} onClick={props.onClick} title={props.title}>
      {props.children}
    </button>
  );
}

function Stats({ type }: { type: UnitType }) {
  const d = UNIT_DEFS[type];
  const atk = d.attack;
  const costs = d.cost.map((n, i) => (n > 0 ? i : -1)).filter((i) => i >= 0);
  return (
    <dl class="stats">
      <div>
        <dt>Vida</dt>
        <dd>{d.hp}</dd>
      </div>
      {atk && (
        <div>
          <dt>Ataque</dt>
          <dd>
            {Math.max(atk.damage.melee, atk.damage.pierce)}
            {atk.range > 0 ? ` · alcance ${atk.range}` : ''}
          </dd>
        </div>
      )}
      <div>
        <dt>Armadura</dt>
        <dd>
          {d.armor.melee} / {d.armor.pierce}
        </dd>
      </div>
      <div>
        <dt>Velocidad</dt>
        <dd>{d.speed}</dd>
      </div>
      {costs.length > 0 && (
        <div class="cost">
          <dt>Coste</dt>
          <dd>
            {costs.map((i) => (
              <span key={i} title={RESOURCE_NAMES[i]}>
                <img src={RESOURCE_ICONS[i]} alt={RESOURCE_NAMES[i]} width={16} height={16} />
                {d.cost[i]}
              </span>
            ))}
          </dd>
        </div>
      )}
    </dl>
  );
}

function UnitCard({ type, s, onSheet }: { type: UnitType; s: Settings; onSheet: (o: SheetOpen) => void }) {
  const m = unitModel(type);
  const def = UNIT_DEFS[type];
  const [anim, setAnim] = useState<AnimName>('walk');
  const [look, setLook] = useState(0);
  const [job, setJob] = useState<Job>(Job.None);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let lastKey = '';
    const draw = (t: number) => {
      const c = canvasRef.current;
      const ctx = c?.getContext('2d');
      if (!c || !ctx) return;
      const spec = m.anims.find((a) => a.name === anim) ?? m.anims[0];
      const f = Math.floor(t / spec.frameMs) % spec.frames;
      const dir = dirAt(s.dir, t);
      const key = `${spec.name}:${f}:${dir}`;
      if (key === lastKey) return;
      lastKey = key;
      ctx.clearRect(0, 0, c.width, c.height);
      drawShadow(ctx, m);
      ctx.drawImage(frameCanvas(type, s.player, spec.name, dir, f, look, job), 0, 0);
    };
    ticker.add(draw);
    draw(clock.t);
    return () => {
      ticker.delete(draw);
    };
  }, [type, anim, look, job, s.player, s.dir, m]);

  const era = ERA_DEFS[def.era ?? 0]?.name ?? '';
  const where = TRAINED_AT.get(type);
  return (
    <article class="card">
      <header>
        <img class="portrait" src={portraitUrl(type, s.player)} alt="" width={88} height={88} title="Retrato del HUD" />
        <h2>{def.name}</h2>
        {def.pop > 0 && <span class="era">{era}</span>}
      </header>
      <div class={`stage bg-${s.bg}`} style={stageStyle(s, m.cell)}>
        <canvas ref={canvasRef} width={m.cell * UNIT_DETAIL} height={m.cell * UNIT_DETAIL} style={{ width: `${m.cell * s.zoom}px`, height: `${m.cell * s.zoom}px` }} />
      </div>
      <div class="chips" role="group" aria-label="Animación">
        {m.anims.map((a) => (
          <Chip key={a.name} active={a.name === anim} onClick={() => setAnim(a.name)} title={`${a.frames} fotogramas`}>
            {ANIM_NAMES[a.name]}
          </Chip>
        ))}
      </div>
      {m.looks && (
        <div class="chips" role="group" aria-label="Aspecto">
          {m.looks.map((name, i) => (
            <Chip key={name} active={i === look} onClick={() => setLook(i)}>
              {name}
            </Chip>
          ))}
        </div>
      )}
      {m.jobs && (
        <div class="chips" role="group" aria-label="Oficio">
          {JOB_NAMES.map((name, i) => (
            <Chip key={name} active={i === job} onClick={() => setJob(i as Job)} title="Herramienta al andar y en reposo">
              {name}
            </Chip>
          ))}
        </div>
      )}
      <p class="desc">{def.description}</p>
      <Stats type={type} />
      <footer>
        {where && <span class="where">Se entrena en: {where}</span>}
        <button type="button" class="btn" onClick={() => onSheet({ type, look, job })}>
          Ver hoja
        </button>
      </footer>
    </article>
  );
}

interface SheetOpen {
  readonly type: UnitType;
  readonly look: number;
  readonly job: Job;
}

/** Hoja completa: cada animación, fotograma a fotograma, en las 8 direcciones. */
function Sheet({ open, s, onClose }: { open: SheetOpen; s: Settings; onClose: () => void }) {
  const m = unitModel(open.type);
  const zoom = Math.max(2, Math.ceil(s.zoom / 2));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    for (const cell of host.querySelectorAll<HTMLCanvasElement>('canvas[data-anim]')) {
      const ctx = cell.getContext('2d');
      if (!ctx) continue;
      ctx.clearRect(0, 0, cell.width, cell.height);
      drawShadow(ctx, m);
      ctx.drawImage(frameCanvas(open.type, s.player, cell.dataset.anim as AnimName, cell.dataset.dir as Dir8, Number(cell.dataset.f), open.look, open.job), 0, 0);
    }
  }, [open, s.player, zoom, m]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  const variant = [m.looks?.[open.look], m.jobs && open.job ? JOB_NAMES[open.job] : null].filter(Boolean).join(' · ');
  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section class="sheet" role="dialog" aria-label={`Hoja de ${UNIT_DEFS[open.type].name}`}>
        <header>
          <h2>
            {UNIT_DEFS[open.type].name}
            {variant && <small> · {variant}</small>}
          </h2>
          <button type="button" class="btn" onClick={onClose}>
            Cerrar
          </button>
        </header>
        <div class="sheet-scroll" ref={ref}>
          {m.anims.map((a) => (
            <div class="sheet-anim" key={a.name}>
              <h3>
                {ANIM_NAMES[a.name]} <small>{a.frames} fotogramas · {a.frameMs} ms</small>
              </h3>
              {/* Las 8 direcciones en columnas y cada fotograma en una fila. */}
              <div class="sheet-grid" style={{ gridTemplateColumns: `auto repeat(${DIR8.length}, ${m.cell * zoom}px)` }}>
                <span />
                {DIR8.map((d) => (
                  <span class="dir head" key={`${d}-label`}>
                    {DIR_ARROWS[d]} {d}
                  </span>
                ))}
                {Array.from({ length: a.frames }, (_, f) => [
                  <span class="dir" key={`f${f}-label`}>
                    {f + 1}
                  </span>,
                  ...DIR8.map((d) => (
                    <div class={`sheet-cell bg-${s.bg}`} key={`${d}-${f}`} style={stageStyle({ ...s, zoom }, m.cell)}>
                      <canvas data-anim={a.name} data-dir={d} data-f={f} width={m.cell * UNIT_DETAIL} height={m.cell * UNIT_DETAIL} style={{ width: `${m.cell * zoom}px`, height: `${m.cell * zoom}px` }} />
                    </div>
                  )),
                ])}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function App() {
  const [player, setPlayer] = useState(1);
  const [zoom, setZoom] = useState(4);
  const [bg, setBg] = useState<Background>('Hierba');
  const [dir, setDir] = useState<DirMode>('SW');
  const [playing, setPlaying] = useState(true);
  const [cat, setCat] = useState<Category>('Todas');
  const [sheet, setSheet] = useState<SheetOpen | null>(null);
  const s = useMemo(() => ({ player, zoom, bg, dir }), [player, zoom, bg, dir]);
  clock.playing = playing;
  const units = UNITS.filter((t) => cat === 'Todas' || categoryOf(t) === cat);
  return (
    <>
      <header class="top">
        <div class="title">
          <h1>Galería de unidades</h1>
          <p>Corona y Acero · {UNIT_TYPE_COUNT} figuras con todas sus animaciones y direcciones</p>
        </div>
        <div class="controls">
          <div class="group" role="group" aria-label="Color del jugador">
            <span class="label">Color</span>
            {TEAM_COLORS.map((c, i) => (
              <button
                type="button"
                key={PLAYER_NAMES[i]}
                class={`swatch${i === player ? ' on' : ''}`}
                style={{ background: c[1] }}
                title={PLAYER_NAMES[i]}
                aria-label={PLAYER_NAMES[i]}
                onClick={() => setPlayer(i)}
              />
            ))}
          </div>
          <div class="group" role="group" aria-label="Dirección">
            <span class="label">Dirección</span>
            {DIR8.map((d) => (
              <Chip key={d} active={dir === d} onClick={() => setDir(d)} title={d}>
                {DIR_ARROWS[d]}
              </Chip>
            ))}
            <Chip active={dir === 'spin'} onClick={() => setDir('spin')} title="Girar por las 8 direcciones">
              ⟳
            </Chip>
          </div>
          <div class="group" role="group" aria-label="Zoom">
            <span class="label">Zoom</span>
            {ZOOMS.map((z) => (
              <Chip key={z} active={zoom === z} onClick={() => setZoom(z)}>
                ×{z}
              </Chip>
            ))}
          </div>
          <div class="group" role="group" aria-label="Fondo">
            <span class="label">Fondo</span>
            {BACKGROUNDS.map((b) => (
              <Chip key={b} active={bg === b} onClick={() => setBg(b)}>
                {b}
              </Chip>
            ))}
          </div>
          <button type="button" class="btn" onClick={() => setPlaying(!playing)}>
            {playing ? 'Pausa' : 'Animar'}
          </button>
        </div>
        <nav class="tabs" aria-label="Categorías">
          {CATEGORIES.map((c) => (
            <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
              {c}
            </Chip>
          ))}
        </nav>
      </header>
      <main class="grid">
        {units.map((t) => (
          <UnitCard key={t} type={t} s={s} onSheet={setSheet} />
        ))}
      </main>
      {sheet && <Sheet open={sheet} s={s} onClose={() => setSheet(null)} />}
    </>
  );
}

const root = document.getElementById('gallery');
if (root) render(<App />, root);
