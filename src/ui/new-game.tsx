import { useState } from 'preact/hooks';
import { DIFFICULTY_DEFS, Difficulty } from '../ai/difficulty';
import { type Architecture, FACTION_DEFS, Faction } from '../data/factions';
import { TECH_DEFS } from '../data/techs';
import { UNIT_DEFS } from '../data/units';
import { DEFAULT_MATCH, type FactionChoice, MAP_SIZES, MAP_SIZE_ORDER, MAX_RIVALS, type MatchConfig, isEurope, minMapSize, normalizeMatch } from '../game/match';
import { EUROPE_CAPITALS, projectLonLat } from '../map/europe';
import { TEAM_COLORS } from '../render/palette';
import { mapThumbUrl, shieldUrl } from './heraldry-icons';
import type { MenuDeps, MenuScreen } from './menu';

/**
 * Pantalla de nueva partida: tu reino (con su escudo y su ficha), los rivales y el mapa (con miniaturas; en el
 * de Europa se ve de dónde sale cada uno).
 */

const FACTIONS = Object.keys(FACTION_DEFS).map(Number) as Faction[];
const CHOICES: readonly FactionChoice[] = [...FACTIONS, 'random'];
const DIFFICULTIES: readonly Difficulty[] = [Difficulty.Easy, Difficulty.Medium, Difficulty.Hard];

const ARCHITECTURE_NAMES: Readonly<Record<Architecture, string>> = {
  mudejar: 'mudéjar, de ladrillo',
  gothic: 'gótica, de piedra y entramado',
  catalan: 'gótico mediterráneo, de arenisca',
  french: 'gótico flamígero, de caliza y pizarra azul',
  nasrid: 'nazarí, de tapial y teja verde',
  portuguese: 'gótico portugués, de caliza y azulejo',
  scottish: 'casas-torre de piedra enlucida',
};

const nameOf = (f: FactionChoice) => (f === 'random' ? 'Al azar' : FACTION_DEFS[f].name);

/** Semilla nueva al azar, legible (dos palabras y un número). */
export function randomSeed(): string {
  const a = ['roble', 'halcon', 'lobo', 'trigo', 'sal', 'hierro', 'cierzo', 'vado', 'monte', 'ribera', 'piedra', 'lino'];
  const b = ['viejo', 'rojo', 'alto', 'claro', 'bravo', 'negro', 'real', 'hondo', 'manso', 'verde'];
  const r = (n: number) => Math.floor(Math.random() * n);
  return `${a[r(a.length)]}-${b[r(b.length)]}-${r(90) + 10}`;
}

/** Texto con las cifras en Silkscreen (en Pixelify el 5 parece una S). */
function WithNumbers({ text }: { text: string }) {
  const parts = text.split(/(\d+(?:[.,]\d+)?)/);
  return <>{parts.map((p, i) => (i % 2 === 1 ? <span class="ng-num" key={i}>{p}</span> : p))}</>;
}

function Shield({ f, size }: { f: FactionChoice; size: 1 | 2 | 3 }) {
  return <img class="ng-shield" src={shieldUrl(f)} width={20 * size} height={22 * size} alt="" />;
}

/** Ficha de la corona elegida: escudo grande, unidad y tecnología únicas, arquitectura y bonus. */
function FactionCard({ f, europe }: { f: FactionChoice; europe: boolean }) {
  if (f === 'random') {
    return (
      <div class="ng-card">
        <Shield f="random" size={3} />
        <div class="ng-card-body">
          <h3>Al azar</h3>
          <p class="ng-card-line">La corona sale de la semilla al empezar la partida.</p>
        </div>
      </div>
    );
  }
  const def = FACTION_DEFS[f];
  return (
    <div class="ng-card">
      <Shield f={f} size={3} />
      <div class="ng-card-body">
        <h3>{def.name}</h3>
        <p class="ng-card-line">
          <b>{UNIT_DEFS[def.uniqueUnit].name}</b> · <i>{TECH_DEFS[def.uniqueTech].name}</i>
          {europe ? ` · sale de ${EUROPE_CAPITALS[f].name}` : ''}
        </p>
        <p class="ng-card-line">Arquitectura {ARCHITECTURE_NAMES[def.architecture]}</p>
        <ul class="ng-bonus">
          {def.bonusText.map((t) => (
            <li key={t}>
              <WithNumbers text={t} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Miniatura del mapa; en el de Europa, un punto del color de cada jugador en la capital de su corona. */
function MapThumb({ kind, markers }: { kind: 'europe' | number; markers?: readonly { f: Faction; color: string }[] }) {
  return (
    <span class="ng-thumb">
      <img src={mapThumbUrl(kind)} alt="" />
      {markers?.map(({ f, color }) => {
        const [e, n] = projectLonLat(...EUROPE_CAPITALS[f].at);
        return <i key={f} class="ng-pin" style={{ left: `${((e + 1) / 2) * 100}%`, top: `${((1 - n) / 2) * 100}%`, background: color }} title={EUROPE_CAPITALS[f].name} />;
      })}
    </span>
  );
}

export function NewGameScreen({ go, deps }: { go: (s: MenuScreen) => void; deps: MenuDeps }) {
  const [c, setC] = useState<MatchConfig>(() => ({ ...DEFAULT_MATCH, seed: randomSeed() }));
  const players = c.rivals.length + 1;
  const needed = minMapSize(players);
  const europe = isEurope(c);
  const update = (patch: Partial<MatchConfig>) => setC((old) => normalizeMatch({ ...old, ...patch }));
  const setRival = (i: number, patch: Partial<MatchConfig['rivals'][number]>) => update({ rivals: c.rivals.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  /** Coronas que ya tiene otro jugador (en Europa no se pueden repetir). */
  const takenBy = (rival: number): Set<FactionChoice> => {
    const set = new Set<FactionChoice>([c.faction, ...c.rivals.filter((_, j) => j !== rival).map((r) => r.faction)]);
    set.delete('random');
    return set;
  };
  const markers = [c.faction, ...c.rivals.map((r) => r.faction)]
    .map((f, p) => ({ f, color: TEAM_COLORS[p + 1][1] }))
    .filter((m): m is { f: Faction; color: string } => m.f !== 'random');

  return (
    <section class="menu-panel wide ng-panel" aria-label="Nueva partida">
      <h2>Nueva partida</h2>
      <div class="ng-grid">
        <fieldset class="ng-realm">
          <legend>Tu reino</legend>
          <div class="ng-factions" role="radiogroup" aria-label="Tu reino">
            {CHOICES.map((f) => (
              <button
                type="button"
                key={String(f)}
                role="radio"
                aria-checked={c.faction === f}
                class={`ng-faction${c.faction === f ? ' on' : ''}`}
                onClick={() => update({ faction: f })}
              >
                <Shield f={f} size={2} />
                <span>{nameOf(f)}</span>
              </button>
            ))}
          </div>
          <FactionCard f={c.faction} europe={europe} />
        </fieldset>

        <div class="ng-side">
          <fieldset>
            <legend>Rivales · todos contra todos</legend>
            {c.rivals.map((r, i) => {
              const taken = europe ? takenBy(i) : new Set<FactionChoice>();
              return (
                <div class="ng-rival" key={i}>
                  <span class="menu-swatch" style={{ background: TEAM_COLORS[i + 2][1] }} title={`Jugador ${i + 2}`} />
                  <Shield f={r.faction} size={1} />
                  <select
                    class="menu-select"
                    aria-label={`Reino del rival ${i + 1}`}
                    value={String(r.faction)}
                    onChange={(e) => {
                      const v = (e.target as HTMLSelectElement).value;
                      setRival(i, { faction: v === 'random' ? 'random' : (Number(v) as Faction) });
                    }}
                  >
                    {CHOICES.map((f) => (
                      <option key={String(f)} value={String(f)} disabled={taken.has(f)}>
                        {nameOf(f)}
                      </option>
                    ))}
                  </select>
                  <div class="ng-seg" role="radiogroup" aria-label={`Dificultad del rival ${i + 1}`}>
                    {DIFFICULTIES.map((d) => (
                      <button
                        type="button"
                        key={d}
                        role="radio"
                        aria-checked={r.difficulty === d}
                        class={r.difficulty === d ? 'on' : ''}
                        onClick={() => setRival(i, { difficulty: d })}
                      >
                        {DIFFICULTY_DEFS[d].name}
                      </button>
                    ))}
                  </div>
                  {c.rivals.length > 1 && (
                    <button
                      type="button"
                      class="ng-remove"
                      onClick={() => update({ rivals: c.rivals.filter((_, j) => j !== i) })}
                      aria-label={`Quitar al rival ${i + 1}`}
                      title="Quitar"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
            {c.rivals.length < MAX_RIVALS && (
              <button
                type="button"
                class="menu-chip ng-add"
                onClick={() => update({ rivals: [...c.rivals, { faction: 'random', difficulty: c.rivals[c.rivals.length - 1]?.difficulty ?? Difficulty.Medium }] })}
              >
                + Añadir rival
              </button>
            )}
          </fieldset>

          <fieldset>
            <legend>Mapa</legend>
            <div class="ng-maps" role="radiogroup" aria-label="Mapa">
              {MAP_SIZE_ORDER.map((s) => {
                const def = MAP_SIZES[s];
                const small = MAP_SIZE_ORDER.indexOf(s) < MAP_SIZE_ORDER.indexOf(needed);
                return (
                  <button
                    type="button"
                    key={s}
                    role="radio"
                    aria-checked={c.mapSize === s}
                    class={`ng-map${c.mapSize === s ? ' on' : ''}`}
                    disabled={small}
                    title={small ? `No caben ${players} jugadores` : undefined}
                    onClick={() => update({ mapSize: s })}
                  >
                    <MapThumb kind={s === 'europe' ? 'europe' : def.tiles} markers={s === 'europe' ? markers : undefined} />
                    <span class="ng-map-name">{def.name}</span>
                    <small>
                      <span class="ng-num">
                        {def.tiles}×{def.tiles}
                      </span>
                      {s === 'europe' ? ' · cada corona en su capital' : ` · hasta ${def.maxPlayers}`}
                    </small>
                  </button>
                );
              })}
            </div>
            <label class="menu-seed">
              <span>Semilla</span>
              <input type="text" value={c.seed} maxLength={40} spellcheck={false} onInput={(e) => setC({ ...c, seed: (e.target as HTMLInputElement).value })} />
              <button type="button" class="menu-chip" onClick={() => setC({ ...c, seed: randomSeed() })} title="Otra semilla al azar">
                Otra
              </button>
            </label>
            <p class="menu-note">
              {europe
                ? 'Las costas son siempre las mismas; la semilla cambia los bosques, los yacimientos y los animales.'
                : 'La misma semilla da el mismo mapa: compártela para jugar el mismo.'}
            </p>
          </fieldset>
        </div>
      </div>
      <div class="menu-actions">
        <button type="button" class="menu-btn" onClick={() => go('title')}>
          Volver
        </button>
        <button type="button" class="menu-btn primary" onClick={() => deps.startMatch(normalizeMatch(c))}>
          Empezar partida
        </button>
      </div>
    </section>
  );
}
