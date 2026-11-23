import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/600.css';
import '@fontsource/silkscreen/400.css';
import './menu.css';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { MatchConfig } from '../game/match';
import type { SaveMeta } from '../game/save-store';
import { GAME_SPEEDS, type GameSettings, VOICE_MODES } from '../game/settings';
import { NewGameScreen } from './new-game';
import { renderTitleArt } from './title-art';

/**
 * Menús del juego (fuera de la partida y en pausa): pantalla de título, nueva partida, cargar y guardar,
 * opciones y atajos. Es una capa HTML encima del lienzo, con la misma piel de madera y pergamino que el HUD.
 */

export type MenuScreen = 'title' | 'new' | 'load' | 'save' | 'options' | 'help' | 'pause' | 'loading';

export interface AudioControls {
  readonly music: number;
  readonly sfx: number;
  readonly muted: boolean;
  setMusic(v: number): void;
  setSfx(v: number): void;
  setMuted(m: boolean): void;
}

export interface MenuDeps {
  readonly audio: () => AudioControls;
  readonly settings: () => GameSettings;
  setSettings(s: GameSettings): void;
  listSaves(): Promise<SaveMeta[]>;
  /** Idiomas de las voces de las coronas y si el sistema tiene voz para cada uno. */
  voiceLanguages?(): readonly { readonly name: string; readonly ok: boolean }[];
  deleteSave(id: string): Promise<void>;
  startMatch(config: MatchConfig): void;
  /** Partida guiada para aprender a jugar. */
  startTutorial(): void;
  loadSave(id: string): void;
  /** Solo en partida: guarda con ese nombre (en un hueco nuevo, o sobrescribiendo `id`). */
  saveGame?(name: string, id?: string): Promise<void>;
  /** Nombre propuesto para guardar la partida en curso. */
  saveName?(): string;
  resume?(): void;
  quitToMenu?(): void;
}

// ── Utilidades ──

const formatTime = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
};
const formatDate = (ms: number) => new Date(ms).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Qué idiomas tienen voz en este sistema: las unidades hablan en el de su corona y, si falta, en castellano.
 */
function VoiceNote({ langs }: { langs: readonly { readonly name: string; readonly ok: boolean }[] }) {
  if (langs.length === 0) return null;
  const ok = langs.filter((l) => l.ok).map((l) => l.name);
  const missing = langs.filter((l) => !l.ok).map((l) => l.name);
  const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}` : xs[0]);
  return (
    <p class="menu-note">
      Cada corona habla en su idioma con las voces de tu sistema.
      {ok.length > 0 ? ` Con voz: ${list(ok)}.` : ''}
      {missing.length > 0 ? ` Sin voz (${ok.includes('castellano') ? 'se oirá en castellano' : 'se oirán las voces sintetizadas'}): ${list(missing)}.` : ''}
      {missing.length > 0 ? ' Puedes añadirlas en los ajustes de voz del sistema.' : ''}
    </p>
  );
}

function Choice<T>(props: { value: T; options: readonly { value: T; name: string; disabled?: boolean; title?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div class="menu-choice" role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          type="button"
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === props.value}
          class={`menu-chip${o.value === props.value ? ' on' : ''}`}
          disabled={o.disabled}
          title={o.title}
          onClick={() => props.onChange(o.value)}
        >
          {o.name}
        </button>
      ))}
    </div>
  );
}

function Panel(props: { title: string; children: preact.ComponentChildren; wide?: boolean }) {
  return (
    <section class={`menu-panel${props.wide ? ' wide' : ''}`} aria-label={props.title}>
      <h2>{props.title}</h2>
      {props.children}
    </section>
  );
}

// ── Pantallas ──

/** Ilustraciones ya pintadas por tamaño (cambiar de pantalla en el menú no la vuelve a pintar). */
const artCache = new Map<string, string>();

/**
 * La ilustración del título a pantalla completa, pintada a la medida de la ventana a unos 2 píxeles de pantalla
 * por píxel de arte (siempre un múltiplo entero de los píxeles del monitor).
 */
function TitleArt({ dim = false }: { dim?: boolean }) {
  const [art, setArt] = useState<{ url: string; w: number; h: number; css: number } | null>(null);
  useEffect(() => {
    let timer = 0;
    const paint = () => {
      const dpr = window.devicePixelRatio || 1;
      const k = Math.max(2, Math.round(Math.min((window.innerWidth * dpr) / 360, (window.innerHeight * dpr) / 210)));
      const css = k / dpr;
      const w = Math.ceil(window.innerWidth / css);
      const h = Math.ceil(window.innerHeight / css);
      const key = `${w}x${h}`;
      let url = artCache.get(key);
      if (!url) {
        url = renderTitleArt(w, h).toDataURL();
        artCache.set(key, url);
      }
      setArt((old) => (old?.url === url && old.css === css ? old : { url, w, h, css }));
    };
    paint();
    const onResize = () => {
      clearTimeout(timer);
      timer = window.setTimeout(paint, 200);
    };
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, []);
  if (!art) return null;
  return (
    <>
      <img class="menu-title-art" src={art.url} alt="" style={{ width: `${art.w * art.css}px`, height: `${art.h * art.css}px` }} />
      {dim && <div class="menu-art-dim" />}
    </>
  );
}

function TitleScreen({ go, deps }: { go: (s: MenuScreen) => void; deps: MenuDeps }) {
  const [latest, setLatest] = useState<SaveMeta | null>(null);
  useEffect(() => {
    deps
      .listSaves()
      .then((s) => setLatest(s[0] ?? null))
      .catch(() => setLatest(null));
  }, [deps]);
  return (
    <div class="menu-title-screen">
      <TitleArt />
      <div class="menu-title-box">
        <h1>
          Corona <span>y</span> Acero
        </h1>
        <p class="menu-tagline">Estrategia en tiempo real en la Baja Edad Media</p>
        <nav class="menu-buttons" aria-label="Menú principal">
          <button type="button" class="menu-btn primary" onClick={() => go('new')}>
            Nueva partida
          </button>
          <button type="button" class="menu-btn" onClick={() => deps.startTutorial()} title="Una partida guiada paso a paso para aprender a jugar">
            Tutorial
          </button>
          {latest && (
            <button type="button" class="menu-btn" onClick={() => deps.loadSave(latest.id)} title={`${latest.name} · ${formatDate(latest.savedAt)}`}>
              Continuar
            </button>
          )}
          <button type="button" class="menu-btn" onClick={() => go('load')}>
            Cargar partida
          </button>
          <button type="button" class="menu-btn" onClick={() => go('options')}>
            Opciones
          </button>
          <a class="menu-btn" href="galeria.html">
            Galería de unidades
          </a>
        </nav>
      </div>
      <footer class="menu-footer">Versión {__APP_VERSION__} · un juego original</footer>
    </div>
  );
}

function SavesScreen({ mode, back, deps }: { mode: 'load' | 'save'; back: () => void; deps: MenuDeps }) {
  const [saves, setSaves] = useState<SaveMeta[] | null>(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<SaveMeta | null>(null);
  const [name, setName] = useState(() => deps.saveName?.() ?? '');
  const [busy, setBusy] = useState(false);
  const refresh = () =>
    deps
      .listSaves()
      .then(setSaves)
      .catch((e: unknown) => {
        setSaves([]);
        setError(e instanceof Error ? e.message : String(e));
      });
  useEffect(() => {
    void refresh();
  }, []);
  const save = async (id?: string, as?: string) => {
    if (!deps.saveGame || busy) return;
    setBusy(true);
    try {
      await deps.saveGame((as ?? name).trim() || 'Partida', id);
      back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <Panel title={mode === 'load' ? 'Cargar partida' : 'Guardar partida'} wide>
      {mode === 'save' && (
        <form
          class="menu-save-new"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <input type="text" value={name} maxLength={60} aria-label="Nombre de la partida" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
          <button type="submit" class="menu-btn primary" disabled={busy}>
            Guardar
          </button>
        </form>
      )}
      {error && <p class="menu-error">{error}</p>}
      {saves === null ? (
        <p class="menu-note">Buscando partidas…</p>
      ) : saves.length === 0 ? (
        <p class="menu-note">Aún no hay partidas guardadas.</p>
      ) : (
        <ul class="menu-saves">
          {saves.map((s) => (
            <li key={s.id}>
              <div class="menu-save-info">
                <strong>{s.name}</strong>
                <span>
                  {s.summary} · {s.era} · {formatTime(s.gameSeconds)}
                </span>
                <small>
                  {s.auto ? 'Autoguardado · ' : ''}
                  {formatDate(s.savedAt)}
                </small>
              </div>
              {confirm?.id === s.id ? (
                <div class="menu-save-actions">
                  <span>¿Borrarla?</span>
                  <button
                    type="button"
                    class="menu-chip danger"
                    onClick={() => {
                      setConfirm(null);
                      void deps.deleteSave(s.id).then(refresh);
                    }}
                  >
                    Sí, borrar
                  </button>
                  <button type="button" class="menu-chip" onClick={() => setConfirm(null)}>
                    No
                  </button>
                </div>
              ) : (
                <div class="menu-save-actions">
                  {mode === 'load' ? (
                    <button type="button" class="menu-chip on" onClick={() => deps.loadSave(s.id)}>
                      Cargar
                    </button>
                  ) : (
                    !s.auto && (
                      <button type="button" class="menu-chip on" disabled={busy} onClick={() => void save(s.id, s.name)}>
                        Sobrescribir
                      </button>
                    )
                  )}
                  <button type="button" class="menu-chip" onClick={() => setConfirm(s)} aria-label={`Borrar ${s.name}`}>
                    Borrar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <div class="menu-actions">
        <button type="button" class="menu-btn" onClick={back}>
          Volver
        </button>
      </div>
    </Panel>
  );
}

function OptionsScreen({ back, go, deps }: { back: () => void; go: (s: MenuScreen) => void; deps: MenuDeps }) {
  const [, redraw] = useState(0);
  const a = deps.audio();
  const g = deps.settings();
  const set = (patch: Partial<GameSettings>) => {
    deps.setSettings({ ...g, ...patch });
    redraw((x) => x + 1);
  };
  const slider = (label: string, value: number, onInput: (v: number) => void, min = 0, max = 100) => (
    <label class="menu-slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} value={value} onInput={(e) => onInput(Number((e.target as HTMLInputElement).value))} />
      <output>{value} %</output>
    </label>
  );
  const check = (label: string, value: boolean, onChange: (v: boolean) => void) => (
    <label class="menu-check">
      <input type="checkbox" checked={value} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
      <span>{label}</span>
    </label>
  );
  return (
    <Panel title="Opciones">
      <fieldset>
        <legend>Sonido</legend>
        {slider('Música', Math.round(a.music * 100), (v) => {
          a.setMusic(v / 100);
          redraw((x) => x + 1);
        })}
        {slider('Efectos', Math.round(a.sfx * 100), (v) => {
          a.setSfx(v / 100);
          redraw((x) => x + 1);
        })}
        <div class="menu-row">
          <span>Voces</span>
          <Choice label="Voces de las unidades" value={g.voices} options={VOICE_MODES} onChange={(voices) => set({ voices })} />
        </div>
        {g.voices === 'speech' && <VoiceNote langs={deps.voiceLanguages?.() ?? []} />}
        {check('Silenciar todo', a.muted, (m) => {
          a.setMuted(m);
          redraw((x) => x + 1);
        })}
      </fieldset>
      <fieldset>
        <legend>Cámara</legend>
        {slider('Velocidad', Math.round(g.scrollSpeed * 100), (v) => set({ scrollSpeed: v / 100 }), 50, 200)}
        {check('Mover la cámara con los bordes de la pantalla', g.edgeScroll, (edgeScroll) => set({ edgeScroll }))}
      </fieldset>
      <fieldset>
        <legend>Partida</legend>
        <Choice label="Velocidad de la partida" value={g.gameSpeed} options={GAME_SPEEDS.map((s) => ({ value: s.value, name: s.name }))} onChange={(gameSpeed) => set({ gameSpeed })} />
        {check('Autoguardado cada 5 minutos', g.autosave, (autosave) => set({ autosave }))}
      </fieldset>
      <div class="menu-actions">
        <button type="button" class="menu-btn" onClick={() => go('help')}>
          Atajos de teclado
        </button>
        <button type="button" class="menu-btn primary" onClick={back}>
          Volver
        </button>
      </div>
    </Panel>
  );
}

const SHORTCUTS: readonly [string, string][] = [
  ['Clic / arrastrar', 'Seleccionar unidades (Mayús: añadir)'],
  ['Clic derecho', 'Mover, recolectar, atacar, construir… según lo que haya debajo'],
  ['Mayús + clic derecho', 'Encolar la orden'],
  ['Q W E R · A S D F · Z X C V', 'Botones del panel de órdenes'],
  ['Clic derecho · E (aldeanos)', 'Reparar un edificio tuyo dañado'],
  ['Supr (dos veces)', 'Derribar el edificio seleccionado (unos cimientos, a la primera)'],
  ['Ctrl + 1–9', 'Asignar grupo'],
  ['1–9', 'Seleccionar grupo (dos veces: centrar la cámara)'],
  ['.', 'Siguiente aldeano ocioso'],
  ['H', 'Centro de la villa'],
  ['Espacio', 'Ir al último ataque'],
  ['Flechas · bordes de la pantalla', 'Mover la cámara'],
  ['Rueda · botón central', 'Zoom · arrastrar la cámara'],
  ['Esc', 'Cancelar · deseleccionar · menú'],
  ['F10', 'Menú y pausa'],
];

function HelpScreen({ back }: { back: () => void }) {
  return (
    <Panel title="Atajos de teclado">
      <dl class="menu-keys">
        {SHORTCUTS.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div class="menu-actions">
        <button type="button" class="menu-btn primary" onClick={back}>
          Volver
        </button>
      </div>
    </Panel>
  );
}

function PauseScreen({ go, deps }: { go: (s: MenuScreen) => void; deps: MenuDeps }) {
  const [quit, setQuit] = useState(false);
  return (
    <Panel title="Pausa">
      {quit ? (
        <>
          <p class="menu-note">Lo que no hayas guardado se perderá.</p>
          <div class="menu-buttons">
            <button type="button" class="menu-btn danger" onClick={() => deps.quitToMenu?.()}>
              Salir al menú principal
            </button>
            <button type="button" class="menu-btn" onClick={() => setQuit(false)}>
              Seguir jugando
            </button>
          </div>
        </>
      ) : (
        <nav class="menu-buttons" aria-label="Menú de pausa">
          <button type="button" class="menu-btn primary" onClick={() => deps.resume?.()}>
            Continuar
          </button>
          <button type="button" class="menu-btn" onClick={() => go('save')}>
            Guardar partida
          </button>
          <button type="button" class="menu-btn" onClick={() => go('load')}>
            Cargar partida
          </button>
          <button type="button" class="menu-btn" onClick={() => go('options')}>
            Opciones
          </button>
          <button type="button" class="menu-btn" onClick={() => go('help')}>
            Atajos de teclado
          </button>
          <button type="button" class="menu-btn" onClick={() => setQuit(true)}>
            Salir al menú
          </button>
        </nav>
      )}
    </Panel>
  );
}

function MenuApp({ screen, inGame, go, deps, message }: { screen: MenuScreen; inGame: boolean; go: (s: MenuScreen) => void; deps: MenuDeps; message: string }) {
  const home: MenuScreen = inGame ? 'pause' : 'title';
  const back = () => go(home);
  let body: preact.ComponentChildren;
  switch (screen) {
    case 'title':
      return <TitleScreen go={go} deps={deps} />;
    case 'loading':
      body = (
        <Panel title="Corona y Acero">
          <p class="menu-note">{message || 'Preparando la partida…'}</p>
        </Panel>
      );
      break;
    case 'new':
      body = <NewGameScreen go={go} deps={deps} />;
      break;
    case 'load':
    case 'save':
      body = <SavesScreen key={screen} mode={screen} back={back} deps={deps} />;
      break;
    case 'options':
      body = <OptionsScreen back={back} go={go} deps={deps} />;
      break;
    case 'help':
      body = <HelpScreen back={() => go('options')} />;
      break;
    case 'pause':
      body = <PauseScreen go={go} deps={deps} />;
      break;
  }
  return (
    <div class={`menu-overlay${inGame ? ' in-game' : ''}`}>
      {!inGame && <TitleArt dim />}
      {body}
    </div>
  );
}

/** Controla qué pantalla del menú se ve (o ninguna, durante la partida). */
export class Menu {
  private screen: MenuScreen | null = null;
  private message = '';
  inGame = false;
  /** Se llama al cerrar el menú con Esc estando en pausa. */
  onClose: (() => void) | null = null;

  constructor(
    private readonly root: HTMLElement,
    readonly deps: MenuDeps,
  ) {
    window.addEventListener('keydown', (e) => {
      if (!this.screen || e.code !== 'Escape' || this.screen === 'loading' || this.screen === 'title') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (this.screen === 'pause') this.onClose?.();
      else if (this.screen === 'help') this.show('options');
      else this.show(this.inGame ? 'pause' : 'title');
    }, true);
  }

  get open(): boolean {
    return this.screen !== null;
  }

  get current(): MenuScreen | null {
    return this.screen;
  }

  show(screen: MenuScreen, message = ''): void {
    this.screen = screen;
    this.message = message;
    this.draw();
  }

  hide(): void {
    this.screen = null;
    this.draw();
  }

  private draw(): void {
    if (!this.screen) {
      render(null, this.root);
      return;
    }
    render(<MenuApp screen={this.screen} inGame={this.inGame} go={(s) => this.show(s)} deps={this.deps} message={this.message} />, this.root);
  }
}

