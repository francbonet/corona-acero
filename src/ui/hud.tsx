import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/600.css';
import '@fontsource/silkscreen/400.css';
import './hud.css';
import { render } from 'preact';
import { useState } from 'preact/hooks';
import type { ButtonView, HudSnapshot, SelectionView } from './hud-model';

/** Tamaño natural de cada icono (las data URLs se cargan una vez y aquí se recuerda lo que miden). */
const NATURAL = new Map<string, readonly [number, number]>();

/**
 * Icono en pixel art escalado al mayor múltiplo que quepa en `w`×`h` píxeles CSS, contando la densidad de la
 * pantalla: así cada píxel del arte ocupa siempre los mismos píxeles del monitor y no se deforma.
 */
function PixelIcon({ src, w, h, alt = '' }: { src: string; w: number; h: number; alt?: string }) {
  const [, loaded] = useState(0);
  const n = NATURAL.get(src);
  let style: Record<string, string>;
  if (n) {
    const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    const fit = Math.min(w / n[0], h / n[1]);
    // Escala entera en píxeles del monitor; si ni a 1 cabe, se reduce lo justo.
    const k = fit * dpr >= 1 ? Math.floor(fit * dpr) / dpr : fit;
    style = { width: `${n[0] * k}px`, height: `${n[1] * k}px` };
  } else {
    style = { visibility: 'hidden', width: `${w}px`, height: `${h}px` };
  }
  return (
    <img
      class="hud-px"
      src={src}
      alt={alt}
      style={style}
      onLoad={
        n
          ? undefined
          : (e) => {
              const img = e.currentTarget as HTMLImageElement;
              NATURAL.set(src, [img.naturalWidth, img.naturalHeight]);
              loaded((x) => x + 1);
            }
      }
    />
  );
}

export interface HudHandlers {
  press(slot: number): void;
  cancelQueued(index: number): void;
  /** Derribar el edificio seleccionado (o cancelar sus cimientos). */
  demolish(): void;
  idle(): void;
  selectGroup(ids: readonly number[]): void;
  dismissGameOver(): void;
  /** Abre el menú de pausa (guardar, cargar, opciones, salir). */
  openMenu(): void;
  quitToMenu(): void;
  tutorialNext(): void;
  tutorialSkip(): void;
  toggleSound(): void;
}

/** Arriba a la izquierda: recursos, población y aldeanos ociosos. */
function ResourceBar({ s, h }: { s: HudSnapshot; h: HudHandlers }) {
  return (
    <div class="hud-res-bar hud-float hud-strip">
      {s.resources.map((r) => (
        <span class="hud-res" title={r.name} key={r.name}>
          <PixelIcon src={r.icon} w={24} h={24} />
          {r.amount}
        </span>
      ))}
      <span class={`hud-res hud-pop ${s.pop.used >= s.pop.cap ? 'hud-warn' : ''}`} title="Población">
        <PixelIcon src={s.pop.icon} w={24} h={24} />
        {s.pop.used}/{s.pop.cap}
      </span>
      <button class={`hud-idle ${s.idle > 0 ? 'hud-idle-on' : ''}`} onClick={() => h.idle()} title="Aldeano ocioso (.)" aria-label={`Aldeanos ociosos: ${s.idle}`}>
        <i class="hud-ico hud-ico-idle" />
        {s.idle}
      </button>
    </div>
  );
}

/** Arriba a la derecha: era, reloj, menú y sonido. */
function SystemBar({ s, h }: { s: HudSnapshot; h: HudHandlers }) {
  return (
    <div class="hud-sys-bar hud-float hud-strip">
      {/* En pantallas estrechas, la era con su nombre corto (hud.css). */}
      <span class="hud-era" title={s.era}>
        <span class="hud-wide">{s.era}</span>
        <span class="hud-narrow">{s.eraShort}</span>
      </span>
      <span class="hud-clock">{s.clock}</span>
      <button class="hud-icon-btn" onClick={() => h.openMenu()} title="Menú: pausa, guardar, cargar y opciones (F10)" aria-label="Menú">
        <i class="hud-ico hud-ico-menu" />
      </button>
      <button
        class={`hud-icon-btn ${s.audio.sound ? '' : 'hud-toggle-off'}`}
        onClick={() => h.toggleSound()}
        title="Sonido (activar o silenciar todo)"
        aria-label="Sonido"
        aria-pressed={s.audio.sound}
      >
        <i class="hud-ico hud-ico-sound" />
      </button>
    </div>
  );
}

/** Bajo la barra de la derecha: los reinos de la partida (y la cuenta atrás de las catedrales). */
function Kingdoms({ s }: { s: HudSnapshot }) {
  return (
    <div class="hud-kingdoms">
      <div class="hud-kingdom">
        <i class="hud-swatch" style={{ background: s.color }} />
        {s.shield && <img class="hud-shield" src={s.shield} width={20} height={22} alt="" />}
        <span class="hud-kingdom-name">Tú</span>
        <small>{s.faction}</small>
      </div>
      {s.rivals.map((r) => (
        <div class={`hud-kingdom ${r.defeated ? 'hud-defeated' : ''}`} key={r.name} title={`${r.name} · ${r.detail}`}>
          <i class="hud-swatch" style={{ background: r.color }} />
          {r.shield && <img class="hud-shield" src={r.shield} width={20} height={22} alt="" />}
          <span class="hud-kingdom-name">{r.name}</span>
          <small>{r.defeated ? 'Derrotado' : r.detail}</small>
        </div>
      ))}
      {s.wonders.map((w) => (
        <div class="hud-wonder" key={w}>
          {w}
        </div>
      ))}
    </div>
  );
}

function SelectionPanel({ v, h }: { v: SelectionView | null; h: HudHandlers }) {
  if (!v) return null;
  return (
    <div class="hud-info">
      <div class="hud-portrait">
        <PixelIcon src={v.icon} w={88} h={88} />
      </div>
      <div class="hud-details">
        <div class="hud-title-row">
          <div class="hud-title">
            {v.title}
            {v.owner && <span class="hud-owner"> · {v.owner}</span>}
          </div>
          {v.demolish && (
            <button
              type="button"
              class={`hud-demolish ${v.demolish.armed ? 'hud-demolish-armed' : ''}`}
              onClick={() => h.demolish()}
              title={v.demolish.title}
              aria-label={v.demolish.label}
            >
              <span class="hud-demolish-label">{v.demolish.label}</span>
              <span class="hud-demolish-ico">
                <PixelIcon src={v.demolish.icon} w={22} h={22} />
              </span>
            </button>
          )}
        </div>
        {v.hp && (
          <div class="hud-bar hud-hp" title={`Vida ${v.hp.cur}/${v.hp.max}`}>
            <div style={{ width: `${(100 * v.hp.cur) / Math.max(1, v.hp.max)}%` }} />
            <span>
              {v.hp.cur}/{v.hp.max}
            </span>
          </div>
        )}
        {v.progress && (
          <div class="hud-bar hud-progress">
            <div style={{ width: `${Math.floor(100 * v.progress.value)}%` }} />
            <span>
              {v.progress.label} {Math.floor(100 * v.progress.value)}%
            </span>
          </div>
        )}
        {v.stats && v.stats.length > 0 && (
          <div class="hud-stats">
            {v.stats.map((st) => (
              <span class="hud-stat" key={st.kind} title={st.title}>
                <i class={`hud-stat-ico hud-stat-${st.kind}`} />
                {st.value}
              </span>
            ))}
          </div>
        )}
        {v.lines.length > 0 && (
          <div class="hud-lines">
            {v.lines.map((line) => (
              <div class="hud-line" key={line}>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
      {v.queue && (
        <div class="hud-side">
          <div class={`hud-side-title ${v.queueStatus?.startsWith('Esperando') ? 'hud-side-warn' : ''}`} title={v.queueStatus}>
            {v.queueStatus}
            {v.queueStatus?.startsWith('Esperando') ? '' : ` · ${Math.floor(100 * v.queue[0].progress)}%`}
            {v.queue.length > 1 ? ` · ${v.queue.length - 1} en cola` : ''}
          </div>
          <div class="hud-bar hud-progress hud-queue-progress">
            <div style={{ width: `${Math.floor(100 * v.queue[0].progress)}%` }} />
          </div>
          <div class="hud-queue">
            {v.queue.map((q, i) => (
              <button class={`hud-queue-item ${i === 0 ? 'hud-queue-first' : ''}`} key={i} onClick={() => h.cancelQueued(i)} title={`${q.name} · clic para cancelar`}>
                <PixelIcon src={q.icon} w={44} h={44} />
                {i === 0 && <div class="hud-queue-bar" style={{ width: `${Math.floor(100 * q.progress)}%` }} />}
              </button>
            ))}
          </div>
        </div>
      )}
      {v.groups && (
        <div class="hud-side">
          <div class="hud-side-title" title="Clic en un grupo para seleccionar solo esos">
            Grupos<span class="hud-wide"> · clic para seleccionar solo esos</span>
          </div>
          <div class="hud-groups">
            {v.groups.map((g) => (
              <button class="hud-group" key={g.name} onClick={() => h.selectGroup(g.ids)} title={g.name}>
                <PixelIcon src={g.icon} w={44} h={44} />
                <span>{g.ids.length}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Tooltip({ b }: { b: ButtonView }) {
  return (
    <div class="hud-tooltip hud-float">
      <div class="hud-title">
        {b.label} <span class="hud-key">({b.hotkey})</span>
      </div>
      {b.cost.length > 0 && (
        <div class="hud-cost">
          {b.cost.map((c, i) => (
            <span class={c.missing ? 'hud-warn' : ''} key={i}>
              <PixelIcon src={c.icon} w={24} h={24} />
              {c.amount}
            </span>
          ))}
        </div>
      )}
      <div class="hud-line">{b.description}</div>
      {b.reason && <div class="hud-line hud-warn">{b.reason}</div>}
    </div>
  );
}

function CommandCard({ buttons, h }: { buttons: readonly (ButtonView | null)[]; h: HudHandlers }) {
  const [hover, setHover] = useState(-1);
  const hovered = hover >= 0 ? buttons[hover] : null;
  return (
    <div class="hud-cmd">
      {hovered && <Tooltip b={hovered} />}
      {buttons.map((b, slot) =>
        b ? (
          <button
            key={slot}
            class={`hud-btn hud-cat-${b.category} ${b.enabled ? '' : 'hud-btn-off'} ${b.active ? 'hud-btn-active' : ''} ${b.hint ? 'hud-btn-hint' : ''}`}
            onClick={() => h.press(slot)}
            onMouseEnter={() => setHover(slot)}
            onMouseLeave={() => setHover(-1)}
          >
            <PixelIcon src={b.icon} w={44} h={44} alt={b.label} />
            <span class="hud-hotkey">{b.hotkey}</span>
            {b.badge && <span class="hud-badge">{b.badge}</span>}
          </button>
        ) : (
          <div key={slot} class="hud-btn hud-btn-empty" />
        ),
      )}
    </div>
  );
}

/** Narrador del tutorial: el paso, lo que explica y lo que hay que hacer. */
function TutorialPanel({ t, h }: { t: NonNullable<HudSnapshot['tutorial']>; h: HudHandlers }) {
  return (
    <div class="hud-tutorial hud-float" role="status" aria-live="polite">
      <div class="hud-tutorial-head">
        <span class="hud-tutorial-step">
          Tutorial · {t.step}/{t.total}
        </span>
        <span class="hud-tutorial-title">{t.title}</span>
      </div>
      <p class="hud-tutorial-text">{t.text}</p>
      {t.task && <p class="hud-tutorial-task">▸ {t.task}</p>}
      <div class="hud-tutorial-actions">
        {t.done ? (
          <>
            <button class="hud-tutorial-btn hud-tutorial-main" onClick={() => h.quitToMenu()}>
              Ir al menú y jugar
            </button>
            <button class="hud-tutorial-btn" onClick={() => h.tutorialSkip()}>
              Seguir aquí
            </button>
          </>
        ) : (
          <>
            {t.manual && (
              <button class="hud-tutorial-btn hud-tutorial-main" onClick={() => h.tutorialNext()}>
                Siguiente
              </button>
            )}
            <button class="hud-tutorial-btn" onClick={() => h.tutorialSkip()}>
              Saltar el tutorial
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Hud({ s, h }: { s: HudSnapshot; h: HudHandlers }) {
  return (
    <>
      <ResourceBar s={s} h={h} />
      <div class="hud-top-right">
        <SystemBar s={s} h={h} />
        <Kingdoms s={s} />
        {/* El narrador del tutorial, en la columna de la derecha: así no tapa la aldea, que queda en el centro. */}
        {s.tutorial && <TutorialPanel t={s.tutorial} h={h} />}
      </div>
      <div class="hud-notices">
        {s.hint && <div class="hud-notice hud-hint">{s.hint}</div>}
        {s.notices.map((n) => (
          <div class="hud-notice" key={n}>
            {n}
          </div>
        ))}
      </div>
      {s.gameOver && (
        <div class="hud-gameover">
          <div class={`hud-gameover-box hud-float ${s.gameOver.won ? 'hud-won' : 'hud-lost'}`}>
            <div class="hud-gameover-title">{s.gameOver.title}</div>
            <div class="hud-line">{s.gameOver.text}</div>
            <div class="hud-gameover-actions">
              <button class="hud-gameover-btn" onClick={() => h.dismissGameOver()}>
                Seguir mirando
              </button>
              <button class="hud-gameover-btn" onClick={() => h.quitToMenu()}>
                Salir al menú
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Abajo, paneles flotantes: órdenes y selección a la izquierda, minimapa a la derecha. */}
      <div class="hud-bottom">
        {/* Consola: la rejilla de órdenes y la selección, en un mismo marco. */}
        <div class="hud-console hud-float">
          <CommandCard buttons={s.buttons} h={h} />
          <SelectionPanel v={s.selection} h={h} />
        </div>
        <div class="hud-bottom-gap" />
        <div class="hud-map hud-float">
          <canvas id="minimap" class="hud-minimap" title="Minimapa: clic para mover la cámara, clic derecho para mover las unidades" />
        </div>
      </div>
    </>
  );
}

/** Pinta el HUD con Preact. Llamarlo a menudo es barato: Preact solo toca lo que cambia. */
export function renderHud(root: HTMLElement, s: HudSnapshot, h: HudHandlers): void {
  render(<Hud s={s} h={h} />, root);
}
