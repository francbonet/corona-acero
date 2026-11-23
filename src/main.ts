import './style.css';
import { Application, TextureSource } from 'pixi.js';
import { SIM_TICK_RATE } from './config';
import { AudioDirector } from './audio/director';
import { AudioEngine } from './audio/engine';
import { Speech } from './audio/speech';
import { ERA_DEFS } from './data/eras';
import { FACTION_DEFS, type Faction } from './data/factions';
import { UnitType } from './data/units';
import { FixedLoop } from './engine/loop';
import { GameClient } from './game/client';
import { type MatchConfig, createMatch, hasMatchParams, matchFromParams, rivalInfo } from './game/match';
import { restoreSim, snapshotSim } from './game/save';
import { AUTOSAVE_ID, type SaveData, deleteSave, listSaves, newSaveId, readSave, writeSave } from './game/save-store';
import { LOCAL_PLAYER } from './game/scenario';
import { Selection } from './game/selection';
import { TUTORIAL_MATCH, TUTORIAL_STOCK, Tutorial } from './game/tutorial';
import { type GameSettings, loadSettings, saveSettings } from './game/settings';
import { CameraControls } from './input/camera-controls';
import { PointerController } from './input/pointer-controller';
import { TERRAIN_INFO } from './map/terrain';
import { createBuildingArt } from './render/building-art';
import { Camera, defaultZoom } from './render/camera';
import { EffectsRenderer } from './render/effects-renderer';
import { EntityRenderer } from './render/entity-renderer';
import { FogRenderer } from './render/fog-renderer';
import { HALF_H, HALF_W, mapWorldBounds } from './render/iso';
import { createNodeArt } from './render/node-art';
import { createTileShapes } from './render/tile-shapes';
import { Particles } from './render/particles';
import { loadUnitOverrides } from './render/assets/overrides';
import { DIR8, createUnitArt } from './render/unit-art';
import { WorldRenderer } from './render/world-renderer';
import type { Simulation } from './sim/simulation';
import { DebugHud } from './ui/debug-hud';
import { buildSnapshot } from './ui/hud-model';
import { renderHud } from './ui/hud';
import { Icons } from './ui/icons';
import { Menu, type MenuDeps } from './ui/menu';
import { Minimap } from './ui/minimap';
import { type Skin, applySkin } from './ui/skin';

/** Cada cuánto se repinta el HUD (ms); tras una acción del jugador se repinta al momento. */
const HUD_INTERVAL = 100;
/** Cada cuánto se repinta el minimapa (ms). */
const MINIMAP_INTERVAL = 250;
/** Doble pulsación de un grupo de control: centra la cámara en él. */
const GROUP_DOUBLE_MS = 400;
/** Autoguardado cada 5 minutos de partida. */
const AUTOSAVE_TICKS = 5 * 60 * SIM_TICK_RATE;
/** Velocidad base de la cámara (píxeles de pantalla por segundo), antes del ajuste de las opciones. */
const PAN_SPEED = 720;
/** Atajos de depuración para crear unidades bajo el cursor (Shift: del jugador rojo). */
const DEBUG_SPAWN: Readonly<Record<string, UnitType>> = {
  KeyU: UnitType.Militia,
  KeyI: UnitType.Archer,
  KeyO: UnitType.Spearman,
  KeyP: UnitType.Scout,
};

/** De dónde sale la partida: una nueva (con su configuración) o una guardada. */
type GameSource = { readonly kind: 'new'; readonly config: MatchConfig; readonly tutorial?: boolean } | { readonly kind: 'load'; readonly save: SaveData };

interface Shared {
  readonly skin: Skin;
  readonly audio: AudioEngine;
  readonly speech: Speech;
  readonly settings: () => GameSettings;
  readonly menu: Menu;
}

/** Lo que el menú necesita de la partida en curso. */
interface RunningGame {
  pause(): void;
  resume(): void;
  save(name: string, id?: string): Promise<void>;
  saveName(): string;
  applySettings(s: GameSettings): void;
}

const formatClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** "Castilla contra Inglaterra y Castilla". */
function matchSummary(sim: Simulation, players: number): string {
  const name = (p: number) => FACTION_DEFS[sim.players.faction[p] as Faction].name;
  const rivals = Array.from({ length: players - 1 }, (_, i) => name(i + 2));
  const list = rivals.length > 1 ? `${rivals.slice(0, -1).join(', ')} y ${rivals[rivals.length - 1]}` : rivals[0];
  return `${name(LOCAL_PLAYER)} contra ${list}`;
}

/** Monta y arranca una partida (nueva o guardada) en esta misma página. */
async function startGame(source: GameSource, shared: Shared): Promise<RunningGame> {
  const { skin, audio, menu } = shared;
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: '#120d0a',
    antialias: false,
    roundPixels: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
  document.getElementById('app')?.appendChild(app.canvas);
  app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ── Simulación ──
  let sim: Simulation;
  let config: MatchConfig;
  let startFocus = 0;
  const isTutorial = source.kind === 'new' && source.tutorial === true;
  if (source.kind === 'new') {
    const match = createMatch(isTutorial ? TUTORIAL_MATCH : source.config);
    sim = match.sim;
    config = match.config;
    startFocus = match.starts[0].townCenter;
    if (isTutorial) sim.players.set(LOCAL_PLAYER, TUTORIAL_STOCK);
  } else {
    sim = restoreSim(source.save.sim);
    config = source.save.config;
  }
  const map = sim.map;
  const players = config.rivals.length + 1;
  const seed = config.seed;
  let simMs = 0;
  const loop = new FixedLoop({
    tickRate: SIM_TICK_RATE,
    onTick: () => {
      const t0 = performance.now();
      sim.step();
      simMs = simMs * 0.9 + (performance.now() - t0) * 0.1;
    },
  });

  // ── Render ──
  const tiles = createTileShapes();
  // Las hojas de Aseprite de assets/units/ sustituyen a las figuras generadas (si las hay).
  const unitArt = createUnitArt(await loadUnitOverrides());
  // Las hojas se pintan la primera vez que hacen falta: las del principio, ya.
  for (let p = 1; p <= players; p++) for (const t of [UnitType.Villager, UnitType.Scout, UnitType.Sheep]) unitArt.frame(t, p, 'idle', 'S', 0);
  const world = new WorldRenderer(map, tiles);
  app.stage.addChild(world.root);
  const entityArt = { units: unitArt, buildings: createBuildingArt((p) => FACTION_DEFS[sim.players.faction[p] as Faction].architecture), nodes: createNodeArt() };
  const particles = new Particles(world.fx, world.decals);
  const entities = new EntityRenderer(sim, entityArt, world.objects, world.decals, world.overlay, particles);
  const effects = new EffectsRenderer(entityArt, world.decals, world.overlay, (id) => DIR8[entities.lastDir[id]], (p) => sim.players.era[p], particles);
  const fog = new FogRenderer(world.fogLayer, map.width, map.height);

  const camera = new Camera(defaultZoom(app.screen.width, app.screen.height));
  camera.setBounds(mapWorldBounds(map.width, map.height));
  /** Centra la cámara en una entidad. */
  const focus = (id: number): void => {
    const e = sim.entities;
    camera.centerOn(((e.x[id] - e.y[id]) * HALF_W) / 256, ((e.x[id] + e.y[id]) * HALF_H) / 256);
  };
  if (source.kind === 'load') {
    camera.zoom = source.save.camera.zoom;
    camera.centerOn(source.save.camera.x, source.save.camera.y);
  } else {
    focus(startFocus);
  }

  // ── Jugador local ──
  const selection = new Selection();
  const client = new GameClient(sim, selection, LOCAL_PLAYER, (command) => sim.schedule(command));
  client.rivals.push(...rivalInfo(sim));
  let tutorial: Tutorial | null = isTutorial ? new Tutorial(sim, client) : null;
  let tutorialElapsed = 0;
  if (source.kind === 'new' && !isTutorial) {
    for (const r of client.rivals) client.notify(`${r.name} reclama estas tierras`);
  } else if (source.kind === 'load') {
    client.importGroups(source.save.client.groups);
    client.notify('Partida cargada');
  }
  const icons = new Icons(unitArt, entityArt.buildings, (p) => sim.players.era[p]);
  let hudElapsed = Infinity;
  const refreshHud = (): void => {
    hudElapsed = Infinity;
  };

  const controls = new CameraControls(app.canvas, camera, () => app.screen);
  const applySettings = (s: GameSettings): void => {
    controls.panSpeed = PAN_SPEED * s.scrollSpeed;
    controls.edgeScroll = s.edgeScroll;
  };
  applySettings(shared.settings());
  const pointer = new PointerController({
    canvas: app.canvas,
    camera,
    viewport: () => app.screen,
    renderer: entities,
    client,
    box: document.getElementById('selection-box'),
    onChange: refreshHud,
    cursors: skin.cursors,
  });

  // ── Audio ──
  let vision: ReturnType<typeof sim.visibility.layers> | null = null;
  const director = new AudioDirector(
    audio,
    LOCAL_PLAYER,
    () => ({ cx: camera.x, cy: camera.y, halfW: app.screen.width / (2 * camera.zoom), halfH: app.screen.height / (2 * camera.zoom) }),
    (tx, ty) => client.revealAll || !vision || vision.visible[ty * map.width + tx] === 1,
    {
      speech: shared.speech,
      mode: () => shared.settings().voices,
      faction: () => sim.players.faction[LOCAL_PLAYER] as Faction,
      volume: () => (audio.settings.muted ? 0 : audio.settings.sfx),
    },
  );

  const minimap = new Minimap({
    sim,
    player: LOCAL_PLAYER,
    camera,
    viewport: () => app.screen,
    onRightClick: (x, y) => {
      client.rightClick(null, x, y);
      refreshHud();
    },
  });
  let minimapElapsed = Infinity;
  let lastGroup = { n: 0, time: -Infinity };

  const hudRoot = document.getElementById('hud-root');
  const debugEl = document.getElementById('hud');
  const debug = debugEl ? new DebugHud(debugEl) : null;
  let debugVisible = false;
  if (debugEl) debugEl.style.display = 'none';

  // ── Pausa, guardar y autoguardado ──
  let paused = false;
  /** Reloj de las animaciones: se para con la pausa y va más deprisa con la velocidad de la partida. */
  let animNow = 0;
  let lastAutosave = sim.tick;
  const pause = (): void => {
    paused = true;
    menu.show('pause');
  };
  const resume = (): void => {
    paused = false;
    menu.hide();
    refreshHud();
  };
  const gameSeconds = () => Math.floor(sim.tick / SIM_TICK_RATE);
  const save = async (name: string, id?: string, auto = false): Promise<void> => {
    const data: SaveData = {
      meta: {
        id: id ?? newSaveId(),
        name,
        savedAt: Date.now(),
        gameSeconds: gameSeconds(),
        era: ERA_DEFS[sim.players.era[LOCAL_PLAYER]].name,
        summary: matchSummary(sim, players),
        auto,
      },
      config,
      // Se copia ya (unos milisegundos), para guardar justo este momento aunque la escritura tarde.
      sim: structuredClone(snapshotSim(sim)),
      client: { groups: client.exportGroups() },
      camera: { x: camera.x, y: camera.y, zoom: camera.zoom },
    };
    await writeSave(data);
    if (!auto) client.notify('Partida guardada');
    refreshHud();
  };

  const handlers = {
    press: (slot: number) => {
      client.press(slot);
      refreshHud();
    },
    cancelQueued: (index: number) => {
      client.cancelQueued(index);
      refreshHud();
    },
    demolish: () => {
      client.demolishSelected();
      refreshHud();
    },
    idle: () => {
      const id = client.selectNextIdle();
      if (id) focus(id);
      refreshHud();
    },
    selectGroup: (ids: readonly number[]) => {
      selection.replace(ids);
      refreshHud();
    },
    dismissGameOver: () => {
      client.gameOverDismissed = true;
      refreshHud();
    },
    openMenu: pause,
    quitToMenu: () => menu.deps.quitToMenu?.(),
    tutorialNext: () => {
      tutorial?.next();
      audio.play('click');
      refreshHud();
    },
    tutorialSkip: () => {
      tutorial = null;
      refreshHud();
    },
    toggleSound: () => {
      audio.toggleMute();
      refreshHud();
    },
  };

  window.addEventListener('keydown', (e) => {
    if (e.repeat || menu.open) return;
    // Grupos de control: Ctrl+1–9 asigna, 1–9 selecciona (dos veces seguidas: centra la cámara).
    const digit = /^Digit([1-9])$/.exec(e.code);
    if (digit && !e.altKey) {
      const n = Number(digit[1]);
      if (e.ctrlKey || e.metaKey) {
        client.assignGroup(n);
        client.notify(`Grupo ${n} asignado`);
      } else {
        const ids = client.selectGroup(n);
        const now = performance.now();
        if (ids.length > 0 && lastGroup.n === n && now - lastGroup.time < GROUP_DOUBLE_MS) focus(ids[0]);
        lastGroup = { n, time: now };
      }
      e.preventDefault();
      refreshHud();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    let used = true;
    switch (e.code) {
      case 'Escape':
        // Cancela lo que haya a medias; si no hay nada, abre el menú.
        if (client.mode.kind !== 'normal') client.cancelPlacement();
        else if (selection.size > 0) selection.clear();
        else pause();
        break;
      case 'F10':
        pause();
        break;
      case 'Delete':
      case 'Backspace':
        // Derribar el edificio seleccionado (dos pulsaciones) o cancelar unos cimientos.
        used = client.demolishSelected();
        break;
      case 'Period':
      case 'NumpadDecimal':
        handlers.idle();
        break;
      case 'Space':
        // Ir al último ataque recibido.
        if (client.lastAttack) camera.centerOn(((client.lastAttack.x - client.lastAttack.y) * HALF_W) / 256, ((client.lastAttack.x + client.lastAttack.y) * HALF_H) / 256);
        break;
      case 'KeyH': {
        const tc = client.townCenter();
        if (tc) {
          selection.replace([tc]);
          focus(tc);
        }
        break;
      }
      case 'KeyG':
        world.toggleGrid();
        break;
      case 'KeyU':
      case 'KeyI':
      case 'KeyO':
      case 'KeyP': {
        // Depuración: 5 unidades bajo el cursor (Shift: del jugador rojo).
        const t = pointer.hoverTile();
        if (t) sim.schedule({ type: 'debugSpawn', player: e.shiftKey ? 2 : LOCAL_PLAYER, unitType: DEBUG_SPAWN[e.code], tileX: t.x, tileY: t.y, count: 5 });
        break;
      }
      case 'KeyM':
        client.revealAll = !client.revealAll;
        client.notify(client.revealAll ? 'Mapa revelado (depuración)' : 'Niebla de guerra activada');
        break;
      case 'Backquote':
        debugVisible = !debugVisible;
        if (debugEl) debugEl.style.display = debugVisible ? 'block' : 'none';
        break;
      default:
        used = client.pressHotkey(e.code);
    }
    if (used) {
      e.preventDefault();
      refreshHud();
    }
  });

  app.ticker.add((ticker) => {
    const speed = paused ? 0 : shared.settings().gameSpeed;
    const dt = ticker.deltaMS * speed;
    animNow += dt;
    const alpha = loop.advance(dt);
    if (!paused) controls.update(ticker.deltaMS);
    selection.prune((id) => sim.entities.isAlive(id));

    const { width, height } = app.screen;
    const offset = camera.offset(width, height);
    world.root.position.set(offset.x, offset.y);
    world.root.scale.set(camera.zoom);
    {
      const a = camera.screenToWorld(0, 0, app.screen.width, app.screen.height);
      const b = camera.screenToWorld(app.screen.width, app.screen.height, app.screen.width, app.screen.height);
      world.update({ minX: a.x, minY: a.y, maxX: b.x, maxY: b.y }, dt);
      entities.setView(a.x, a.y, b.x, b.y);
      entities.setPixelScale(camera.zoom * app.renderer.resolution);
    }
    vision = client.revealAll ? null : sim.visibility.layers(LOCAL_PLAYER);
    const seen = (tx: number, ty: number) => !vision || vision.visible[ty * map.width + tx] === 1;
    entities.update(alpha, animNow, dt, selection.set, LOCAL_PLAYER, vision);
    const events = sim.drainEvents();
    effects.handle(events, seen);
    client.handleEvents(events);
    director.update(ticker.deltaMS);
    director.handleEvents(events);
    director.handleFeedback(client.drainFeedback());
    director.ambient(sim, dt);
    if (events.some((ev) => ev.kind === 'research' || ev.kind === 'victory' || ev.kind === 'defeat')) refreshHud();
    effects.update(dt, sim.projectiles, alpha, seen);
    particles.update(dt);
    // Fotogramas de unidades pendientes, poco a poco (unos milisegundos por fotograma de pantalla).
    unitArt.pump(3);
    fog.update(vision);
    pointer.update();
    world.setHoverTile(world.gridVisible ? pointer.hoverTile() : null);

    // Tutorial: comprueba el paso en curso unas cuatro veces por segundo.
    tutorialElapsed += ticker.deltaMS;
    if (tutorial && tutorialElapsed >= 250) {
      tutorialElapsed = 0;
      if (tutorial.update()) {
        audio.play('research');
        refreshHud();
      }
    }

    // Autoguardado (no en el tutorial, ni si la partida ya ha terminado).
    if (!isTutorial && shared.settings().autosave && !paused && sim.tick - lastAutosave >= AUTOSAVE_TICKS && !sim.players.defeated[LOCAL_PLAYER]) {
      lastAutosave = sim.tick;
      save(`Autoguardado · ${matchSummary(sim, players)}`, AUTOSAVE_ID, true).catch((err: unknown) => console.warn('No se pudo autoguardar', err));
    }

    hudElapsed += ticker.deltaMS;
    if (hudRoot && hudElapsed >= HUD_INTERVAL) {
      hudElapsed = 0;
      const t = tutorial;
      renderHud(
        hudRoot,
        buildSnapshot(client, icons, { music: audio.settings.music > 0, sound: !audio.settings.muted }, t ? { tutorial: t.view(), hint: (ref) => t.hint(ref) } : {}),
        handlers,
      );
    }
    minimapElapsed += ticker.deltaMS;
    if (minimapElapsed >= MINIMAP_INTERVAL) {
      minimapElapsed = 0;
      minimap.draw(client.revealAll);
    }
    if (debugVisible) {
      debug?.update(ticker.deltaMS, () => {
        const t = pointer.hoverTile();
        return [
          `FPS ${Math.round(ticker.FPS)} · tick ${sim.tick} · sim ${simMs.toFixed(2)} ms/tick · zoom x${camera.zoom}`,
          `Entidades ${sim.entities.count()} · caminos pendientes ${sim.pathing.pending} · semilla "${seed}"`,
          t ? `Casilla (${t.x}, ${t.y}) · ${TERRAIN_INFO[map.terrainAt(t.x, t.y)].name}${sim.grid.passable(t.x, t.y) ? '' : ' · bloqueada'}` : 'Casilla: —',
          '[G] rejilla · [M] revelar mapa · [U/I/O/P] milicia/arquero/lancero/batidor (Shift: rojo) · [`] ocultar',
        ];
      });
    }
  });

  if (import.meta.env.DEV) {
    Object.assign(window, { __game: { app, camera, map, sim, loop, world, entities, effects, particles, selection, client, audio, director, menu, save } });
  }

  return {
    pause,
    resume,
    save: (name, id) => save(name, id),
    saveName: () => `${matchSummary(sim, players)} · ${formatClock(gameSeconds())}`,
    applySettings,
  };
}

/** Arranque: pantalla de título (o directamente una partida si la URL lo pide). */
async function boot(): Promise<void> {
  // Pixel art: nunca suavizar texturas.
  TextureSource.defaultOptions.scaleMode = 'nearest';
  const skin = applySkin(document.documentElement);
  const audio = new AudioEngine();
  const speech = new Speech();
  let settings = loadSettings();
  let game: RunningGame | null = null;

  // El navegador no deja sonar nada hasta el primer clic o tecla.
  let audioUnlocked = false;
  const unlockAudio = (): void => {
    audio.unlock();
    if (!audioUnlocked) {
      audioUnlocked = true;
      audio.prerender();
    }
  };
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  const deps: MenuDeps = {
    audio: () => ({
      music: audio.settings.music,
      sfx: audio.settings.sfx,
      muted: audio.settings.muted,
      setMusic: (v) => audio.setMusicVolume(v),
      setSfx: (v) => audio.setSfxVolume(v),
      setMuted: (m) => {
        if (audio.settings.muted !== m) audio.toggleMute();
      },
    }),
    settings: () => settings,
    setSettings: (s) => {
      settings = s;
      saveSettings(s);
      game?.applySettings(s);
    },
    listSaves,
    deleteSave,
    voiceLanguages: () => speech.languages(),
    startMatch: (config) => void launch({ kind: 'new', config }),
    startTutorial: () => void launch({ kind: 'new', config: TUTORIAL_MATCH, tutorial: true }),
    loadSave: (id) => {
      // Desde una partida se recarga la página: así no queda nada de la anterior.
      if (game) location.href = `${location.pathname}?cargar=${encodeURIComponent(id)}`;
      else void loadAndLaunch(id);
    },
    saveGame: (name, id) => (game ? game.save(name, id) : Promise.reject(new Error('No hay ninguna partida en curso'))),
    saveName: () => game?.saveName() ?? '',
    resume: () => game?.resume(),
    quitToMenu: () => {
      location.href = location.pathname;
    },
  };
  const menu = new Menu(document.getElementById('menu-root') ?? document.body, deps);
  menu.onClose = () => game?.resume();

  const failed = (text: string): void => {
    menu.inGame = false;
    menu.show('loading', text);
    setTimeout(() => menu.show('title'), 3000);
  };
  const launch = async (source: GameSource): Promise<void> => {
    menu.show('loading', source.kind === 'load' ? 'Cargando la partida…' : 'Preparando la partida…');
    // Un respiro para que se vea el aviso antes de generar el mapa.
    await new Promise((r) => setTimeout(r, 40));
    try {
      game = await startGame(source, { skin, audio, speech, settings: () => settings, menu });
      menu.inGame = true;
      menu.hide();
    } catch (err) {
      console.error(err);
      failed('No se pudo empezar la partida. Mira la consola para más detalles.');
    }
  };
  const loadAndLaunch = async (id: string): Promise<void> => {
    menu.show('loading', 'Cargando la partida…');
    try {
      const save = await readSave(id);
      if (!save) throw new Error('No se encuentra esa partida');
      await launch({ kind: 'load', save });
    } catch (err) {
      console.error(err);
      failed(`No se pudo cargar la partida: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const params = new URLSearchParams(location.search);
  const loadId = params.get('cargar');
  if (loadId) {
    history.replaceState(null, '', location.pathname);
    await loadAndLaunch(loadId);
  } else if (hasMatchParams(params)) {
    await launch({ kind: 'new', config: matchFromParams(params) });
  } else {
    menu.show('title');
    audio.music('menu');
  }
}

boot().catch((err: unknown) => {
  console.error(err);
  document.body.textContent = 'No se pudo iniciar el juego. Mira la consola para más detalles.';
});
