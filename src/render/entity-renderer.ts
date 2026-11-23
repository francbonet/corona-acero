import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { BUILDING_DEFS, BuildingType } from '../data/buildings';
import { NODE_DEFS, NodeType } from '../data/nodes';
import { UnitType } from '../data/units';
import { FP_ONE, FP_SHIFT } from '../engine/fixed';
import { hash2 } from '../engine/rng';
import type { PickKind, PickTarget } from '../game/picking';
import { Comp, MoveState, Task } from '../sim/entities';
import type { Simulation } from '../sim/simulation';
import { type BuildingArt, BuildStage } from './building-art';
import { WallLink } from './arch/models';
import { HALF_H, HALF_W, tileCenterToWorld, tileToWorld } from './iso';
import type { AnchoredTexture, NodeArt } from './node-art';
import { TREE_VARIANT_COUNT, type TreeSpeciesName } from './nature-art';
import { Terrain, TreeKind } from '../map/terrain';
import { TEAM_COLORS } from './palette';
import { type AnimName, Job } from './rig/catalog';
import type { Particles } from './particles';
import { DIR8, type Dir8, type UnitArt, dirFromScreen, facingSign } from './unit-art';

type TreeSpecies = Exclude<TreeKind, typeof TreeKind.None>;
const TREE_SPECIES: Readonly<Record<TreeSpecies, TreeSpeciesName>> = { [TreeKind.Oak]: 'oak', [TreeKind.Pine]: 'pine', [TreeKind.Olive]: 'olive' };

const FIRE_FRAME_MS = 110;
const MARKER_MS = 450;

export interface EntityArt {
  readonly units: UnitArt;
  readonly buildings: BuildingArt;
  readonly nodes: NodeArt;
}

/** Lo que ve el jugador local; `null` = todo (depuración). */
export type Vision = { readonly visible: Uint8Array; readonly explored: Uint8Array } | null;

interface View {
  readonly kind: PickKind;
  /** Contenedor ordenado por profundidad. */
  readonly root: Container;
  readonly body: Sprite;
  /** Anillo o contorno de selección (en la capa del suelo). */
  readonly ring: Sprite;
  carry: Sprite | null;
  flames: Sprite[];
  /** Lo que se anima encima de un edificio: banderas y aspas. */
  extras: { readonly sprite: Sprite; readonly frames: readonly Texture[]; readonly frameMs: number }[];
  /** Emisores y puntos de fuego del edificio, en píxeles de mundo. */
  smoke: { readonly x: number; readonly y: number; next: number }[];
  fire: readonly (readonly [number, number])[];
  fireNext: number;
  /** Cuándo levantó polvo por última vez (unidades). */
  dustAt: number;
  facing: 1 | -1;
  /** Dirección en la que mira (unidades). */
  dir: Dir8;
  seen: number;
  /** Para no recalcular la textura si nada ha cambiado. */
  textureKey: number;
  /** Altura del sprite sobre los pies (para colocar la barra de vida). */
  height: number;
}


/**
 * Dibuja todo lo que vive en la simulación: unidades (interpoladas y animadas), fuentes de recursos y edificios
 * (con sus fases de obra y fuego si están dañados), además de la selección, las barras de vida, la bandera de
 * reunión, los marcadores de orden y el fantasma de colocación. Respeta la niebla de guerra del jugador local.
 */
export class EntityRenderer {
  /** Posición dibujada (píxeles de mundo) de cada entidad en el último fotograma. */
  readonly renderX: Float32Array;
  readonly renderY: Float32Array;
  /** Última dirección de cada unidad (índice en DIR8), para orientar su animación de muerte. */
  readonly lastDir: Uint8Array;
  /** Ciclo de andar de cada unidad (0–1 por ciclo), que avanza con la distancia recorrida. */
  private readonly walkPhase: Float32Array;
  /** Última posición dibujada (casillas) de cada unidad, para medir cuánto ha andado. */
  private readonly walkFrom: Float32Array;
  private readonly views = new Map<number, View>();
  private readonly markers: { sprite: Sprite; age: number }[] = [];
  private readonly ghost = new Sprite();
  private readonly ghostOutline = new Sprite();
  private readonly flag = new Sprite();
  private readonly bars = new Graphics();
  /** Fantasmas de un tramo de muro (se reutilizan). */
  private readonly linePool: Sprite[] = [];
  private readonly overlay: Container;
  private stamp = 0;
  /** ¿Se ve ahora mismo la casilla de la entidad que se está actualizando? (para el humo y el polvo) */
  private liveNow = true;
  private pixel = 1;
  /** Lo que se ve en pantalla, en píxeles de mundo (con margen), para no crear partículas fuera. */
  private view = { minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity };

  constructor(
    private readonly sim: Simulation,
    private readonly art: EntityArt,
    private readonly objects: Container,
    private readonly decals: Container,
    overlay: Container,
    /** Partículas para el polvo al andar y la vida de los edificios (humo, fuego). */
    private readonly particles: Particles | null = null,
  ) {
    this.renderX = new Float32Array(sim.entities.capacity);
    this.renderY = new Float32Array(sim.entities.capacity);
    this.lastDir = new Uint8Array(sim.entities.capacity);
    this.walkPhase = new Float32Array(sim.entities.capacity);
    this.walkFrom = new Float32Array(sim.entities.capacity * 2).fill(Number.NaN);
    this.overlay = overlay;
    this.ghost.alpha = 0.65;
    this.ghost.visible = this.ghostOutline.visible = this.flag.visible = false;
    this.flag.anchor.set(0, 1);
    // La bandera va en la capa superior: si no, el árbol o la mina sobre la que está la taparía.
    overlay.addChild(this.ghostOutline, this.ghost, this.flag, this.bars);
  }

  /**
   * Píxeles de pantalla (físicos) por píxel de mundo: zoom × densidad de la pantalla. Las unidades se colocan
   * con esa precisión, así andan de píxel en píxel de pantalla y no a saltos de un píxel de mundo (2–8 de
   * pantalla según el zoom), que es lo que las hacía avanzar a trompicones. Solo si cada píxel de su dibujo
   * (a doble densidad) ocupa un número entero de píxeles de pantalla: si no (zoom x3 en una pantalla normal),
   * moverlas de uno en uno haría titilar el dibujo, y van de píxel de mundo en píxel de mundo.
   */
  setPixelScale(scale: number): void {
    this.pixel = scale >= 1 && Number.isInteger(scale / this.art.units.detail) ? scale : 1;
  }

  private snap(v: number): number {
    return Math.round(v * this.pixel) / this.pixel;
  }

  /** Lo que se ve en pantalla (píxeles de mundo): fuera de ahí no se crean partículas. */
  setView(minX: number, minY: number, maxX: number, maxY: number): void {
    this.view = { minX: minX - 24, minY: minY - 24, maxX: maxX + 24, maxY: maxY + 48 };
  }

  private onScreen(x: number, y: number): boolean {
    const v = this.view;
    return x >= v.minX && x <= v.maxX && y >= v.minY && y <= v.maxY;
  }

  update(alpha: number, nowMs: number, frameMs: number, selected: ReadonlySet<number>, localPlayer: number, vision: Vision): void {
    const e = this.sim.entities;
    const stamp = ++this.stamp;
    const w = this.sim.grid.width;
    let flagFor = 0;
    this.bars.clear();
    for (let id = 1; id < e.highWater; id++) {
      const mask = e.mask[id];
      if ((mask & Comp.Position) === 0) continue; // guarecidas: no están en el mapa
      const kind: PickKind | null =
        mask & Comp.Unit ? 'unit' : mask & Comp.Building ? 'building' : mask & Comp.Resource ? 'node' : null;
      if (!kind) continue;
      let view = this.views.get(id);
      if (view && view.kind !== kind) {
        // Un animal abatido pasa de unidad a fuente de carne: se rehace su vista.
        this.destroyView(view);
        view = undefined;
      }
      view ??= this.createView(id, kind);
      view.seen = stamp;

      // Niebla: lo propio siempre se ve; lo ajeno, las unidades solo si se ve su casilla,
      // y edificios y recursos si se ha explorado alguna vez.
      let shown = true;
      this.liveNow = true;
      if (vision) {
        const tx = e.size[id] > 0 ? e.tileX[id] + (e.size[id] >> 1) : e.x[id] >> FP_SHIFT;
        const ty = e.size[id] > 0 ? e.tileY[id] + (e.size[id] >> 1) : e.y[id] >> FP_SHIFT;
        const i = ty * w + tx;
        this.liveNow = vision.visible[i] === 1;
        if (e.owner[id] !== localPlayer) shown = kind === 'unit' ? this.liveNow : vision.explored[i] === 1;
      }
      view.root.visible = shown;
      if (!shown) {
        view.ring.visible = false;
        continue;
      }

      const isSelected = selected.has(id);
      if (kind === 'unit') this.updateUnit(id, view, alpha, nowMs, isSelected, localPlayer);
      else if (kind === 'building') this.updateBuilding(id, view, nowMs, isSelected, localPlayer);
      else this.updateNode(id, view, isSelected);
      // Barras de vida: unidades heridas o seleccionadas; edificios terminados y dañados, o seleccionados
      // (los cimientos no, que llenarían la pantalla de barras al trazar un muro).
      const damaged = e.hp[id] < e.maxHp[id] && (kind === 'unit' || e.built[id] === 1);
      if (kind !== 'node' && (isSelected || damaged)) this.drawBar(id, view, kind);
      if (isSelected && kind === 'building' && e.owner[id] === localPlayer && e.hasRally[id]) flagFor = id;
    }

    for (const [id, view] of this.views) {
      if (view.seen === stamp) continue;
      this.destroyView(view);
      this.views.delete(id);
    }

    this.flag.visible = flagFor !== 0;
    if (flagFor) {
      const fx = e.rallyX[flagFor];
      const fy = e.rallyY[flagFor];
      this.flag.texture = this.art.buildings.flags[Math.min(localPlayer, TEAM_COLORS.length - 1)];
      this.flag.position.set(Math.round(((fx - fy) * HALF_W) / FP_ONE) - 1, Math.round(((fx + fy) * HALF_H) / FP_ONE));
    }

    for (let i = this.markers.length - 1; i >= 0; i--) {
      const m = this.markers[i];
      m.age += frameMs;
      if (m.age >= MARKER_MS) {
        m.sprite.destroy();
        this.markers.splice(i, 1);
      } else {
        // Parpadeo en vez de escalar: escalar a tamaños no enteros rompería el pixel art.
        m.sprite.alpha = Math.floor(m.age / 75) % 2 === 0 ? 1 : 0.35;
      }
    }
  }

  /** Marca dónde se ha ordenado ir (píxeles de mundo). */
  showMoveMarker(wx: number, wy: number, color = 0x7fd08a): void {
    const sprite = new Sprite(this.art.units.ringBig);
    sprite.anchor.set(0.5);
    sprite.position.set(Math.round(wx), Math.round(wy));
    sprite.tint = color;
    this.decals.addChild(sprite);
    this.markers.push({ sprite, age: 0 });
  }

  /** Fantasma del edificio que se va a colocar (o `null` para ocultarlo). */
  setGhost(type: BuildingType | null, tileX = 0, tileY = 0, valid = true, player = 1): void {
    if (type === null) {
      this.ghost.visible = this.ghostOutline.visible = false;
      return;
    }
    const n = BUILDING_DEFS[type].size;
    const top = tileToWorld(tileX, tileY);
    const sprite = this.art.buildings.sprite(type, Math.min(player, TEAM_COLORS.length - 1), this.sim.players.era[player], BuildStage.Complete);
    this.ghost.texture = sprite.texture;
    this.ghost.position.set(top.x - sprite.originX, top.y - sprite.originY);
    this.ghost.tint = valid ? 0xc8ffc8 : 0xff9090;
    this.ghostOutline.texture = this.art.buildings.outlines[n];
    this.ghostOutline.position.set(top.x - 16 * n, top.y);
    this.ghostOutline.tint = valid ? 0x7fd08a : 0xe8735f;
    this.ghost.visible = this.ghostOutline.visible = true;
  }

  /** Fantasma de un tramo de muro: un segmento por casilla, verde si se puede construir y rojo si no. */
  setGhostLine(type: BuildingType | null, tiles: readonly { x: number; y: number; ok: boolean }[] = [], player = 1): void {
    const era = this.sim.players.era[player];
    let i = 0;
    if (type !== null) {
      const at = new Set(tiles.map((t) => t.y * this.sim.grid.width + t.x));
      for (const t of tiles) {
        // Cada tramo enlaza con los vecinos del propio trazado y con los muros que ya haya.
        const link = this.wallLink(t.x, t.y, player, (x, y) => at.has(y * this.sim.grid.width + x));
        const ghost = this.art.buildings.sprite(type, Math.min(player, TEAM_COLORS.length - 1), era, BuildStage.Complete, link);
        let sprite = this.linePool[i];
        if (!sprite) {
          sprite = new Sprite();
          sprite.alpha = 0.65;
          this.overlay.addChild(sprite);
          this.linePool.push(sprite);
        }
        const top = tileToWorld(t.x, t.y);
        sprite.texture = ghost.texture;
        sprite.position.set(top.x - ghost.originX, top.y - ghost.originY);
        sprite.tint = t.ok ? 0xc8ffc8 : 0xff9090;
        sprite.visible = true;
        i++;
      }
    }
    for (; i < this.linePool.length; i++) this.linePool[i].visible = false;
  }

  /** Todo lo clicable (y visible), opcionalmente solo lo de un jugador. */
  pickTargets(owner?: number): PickTarget[] {
    const e = this.sim.entities;
    const out: PickTarget[] = [];
    for (const [id, view] of this.views) {
      if (!view.root.visible || !e.isAlive(id) || (owner !== undefined && e.owner[id] !== owner)) continue;
      if (view.kind === 'unit') {
        const box = this.art.units.hitbox(e.unitType[id] as UnitType);
        out.push({ id, kind: 'unit', x: this.renderX[id], y: this.renderY[id], halfW: box.halfW, height: box.height });
      } else if (view.kind === 'building') {
        out.push(this.buildingTarget(id));
      } else {
        const tree = e.nodeType[id] === NodeType.Tree;
        out.push({ id, kind: 'node', x: this.renderX[id], y: this.renderY[id], halfW: tree ? 10 : 9, height: tree ? 40 : 10 });
      }
    }
    return out;
  }

  // ── Vistas ──

  private createView(id: number, kind: PickKind): View {
    const e = this.sim.entities;
    const root = new Container();
    const body = new Sprite();
    if (kind === 'unit') {
      // Sombra en el suelo, bajo los pies (la luz viene de arriba a la izquierda: algo a la derecha).
      const shadow = new Sprite(this.art.units.shadow(e.unitType[id] as UnitType));
      shadow.anchor.set(0.5);
      shadow.position.set(1, 0);
      root.addChild(shadow);
    }
    root.addChild(body);
    this.objects.addChild(root);
    let ringTexture: Texture;
    if (kind === 'unit') {
      ringTexture = this.art.units.model(e.unitType[id] as UnitType).bigRing ? this.art.units.ringBig : this.art.units.ringSmall;
    } else if (e.size[id] > 0) {
      ringTexture = this.art.buildings.outlines[e.size[id]];
    } else {
      ringTexture = this.art.units.ringSmall;
    }
    const ring = new Sprite(ringTexture);
    ring.visible = false;
    this.decals.addChild(ring);
    const height = kind === 'unit' ? this.art.units.hitbox(e.unitType[id] as UnitType).height : 0;
    // Cada unidad empieza mirando hacia un lado distinto (de frente o de tres cuartos).
    const dir: Dir8 = (['S', 'SW', 'SE'] as const)[id % 3];
    const view: View = { kind, root, body, ring, carry: null, flames: [], extras: [], smoke: [], fire: [], fireNext: 0, dustAt: 0, facing: 1, dir, seen: 0, textureKey: -1, height };
    this.views.set(id, view);

    if (kind !== 'unit') this.placeStatic(id, view);
    return view;
  }

  private destroyView(view: View): void {
    view.root.destroy({ children: true });
    view.ring.destroy();
  }

  /** Edificios y fuentes no se mueven: se colocan una vez. */
  private placeStatic(id: number, view: View): void {
    const e = this.sim.entities;
    const s = e.size[id];
    if (s > 0) {
      const top = tileToWorld(e.tileX[id], e.tileY[id]);
      const center = tileToWorld(e.tileX[id] + s / 2, e.tileY[id] + s / 2);
      this.renderX[id] = center.x;
      this.renderY[id] = center.y;
      view.root.zIndex = center.y;
      view.ring.position.set(top.x - 16 * s, top.y);
      if (e.mask[id] & Comp.Building) {
        // La textura (y con ella la posición del sprite) se elige en updateBuilding.
        view.textureKey = -1;
      } else {
        // Fuente de una casilla: sprite apoyado en el centro de la casilla.
        const c = tileCenterToWorld(e.tileX[id], e.tileY[id]);
        this.renderX[id] = c.x;
        this.renderY[id] = c.y;
        view.root.zIndex = c.y;
        view.root.position.set(c.x, c.y);
        view.ring.position.set(top.x - 16, top.y);
        if (e.nodeType[id] === NodeType.Tree && hash2(e.tileX[id], e.tileY[id], 7) & 1) view.body.scale.x = -1;
        view.textureKey = -1;
      }
    } else {
      // Carne de un animal abatido: sin huella, en su posición.
      const wx = Math.round(((e.x[id] - e.y[id]) * HALF_W) / FP_ONE);
      const wy = Math.round(((e.x[id] + e.y[id]) * HALF_H) / FP_ONE);
      this.renderX[id] = wx;
      this.renderY[id] = wy;
      view.root.position.set(wx, wy);
      view.root.zIndex = wy;
      view.textureKey = -1;
      view.ring.anchor.set(0.5);
      view.ring.position.set(wx, wy);
    }
  }

  private updateUnit(id: number, view: View, alpha: number, nowMs: number, selected: boolean, localPlayer: number): void {
    const e = this.sim.entities;
    const fx = e.prevX[id] + (e.x[id] - e.prevX[id]) * alpha;
    const fy = e.prevY[id] + (e.y[id] - e.prevY[id]) * alpha;
    // Lo andado desde el último fotograma (en casillas) hace avanzar el ciclo de andar.
    {
      const tx = fx / FP_ONE;
      const ty = fy / FP_ONE;
      const lx = this.walkFrom[id * 2];
      const ly = this.walkFrom[id * 2 + 1];
      if (!Number.isNaN(lx) && e.moveState[id] === MoveState.Moving) {
        const d = Math.hypot(tx - lx, ty - ly);
        // Un salto grande (aparecer, entrar en un edificio) no cuenta como paso.
        if (d < 1) this.walkPhase[id] = (this.walkPhase[id] + d / (this.art.units.model(e.unitType[id] as UnitType).stride ?? 0.7)) % 1;
      }
      this.walkFrom[id * 2] = tx;
      this.walkFrom[id * 2 + 1] = ty;
    }
    const wx = this.snap(((fx - fy) * HALF_W) / FP_ONE);
    const wy = this.snap(((fx + fy) * HALF_H) / FP_ONE);
    this.renderX[id] = wx;
    this.renderY[id] = wy;

    const dx = e.x[id] - e.prevX[id];
    const dy = e.y[id] - e.prevY[id];
    const working = e.working[id] === 1;
    const type = e.unitType[id] as UnitType;
    const owner = e.owner[id] < TEAM_COLORS.length ? e.owner[id] : 0;
    // Solo anda quien tiene que ir a algún sitio: los empujones de la separación entre unidades no cuentan
    // (si no, las que se rozan se pondrían a andar y a girar sin parar).
    const moving = e.moveState[id] === MoveState.Moving && (dx !== 0 || dy !== 0);
    // Hacia dónde mira: hacia su objetivo si trabaja o lucha; si no, hacia el siguiente punto de su camino.
    const target = e.attackTarget[id] || e.taskTarget[id];
    if (working && e.isAlive(target)) {
      const tx = e.x[target] - e.x[id];
      const ty = e.y[target] - e.y[id];
      if (tx !== 0 || ty !== 0) this.face(view, (tx - ty) * HALF_W, (tx + ty) * HALF_H);
    } else if (moving) {
      const path = e.path[id];
      const wi = e.pathIndex[id];
      if (path && wi * 2 + 1 < path.length) {
        const hx = path[wi * 2] - e.x[id];
        const hy = path[wi * 2 + 1] - e.y[id];
        if (hx !== 0 || hy !== 0) this.face(view, (hx - hy) * HALF_W, (hx + hy) * HALF_H);
      } else {
        this.face(view, (dx - dy) * HALF_W, (dx + dy) * HALF_H);
      }
    }
    this.lastDir[id] = DIR8.indexOf(view.dir);

    if (moving && this.particles && this.liveNow && this.onScreen(wx, wy)) this.dust(id, view, type, wx, wy, nowMs);
    const { anim, frame } = this.unitAnimation(id, type, working, moving, nowMs);
    const shown = this.art.units.frame(type, owner, anim, view.dir, frame, id, this.jobOf(id));
    const model = this.art.units.model(type);
    view.body.texture = shown.texture;
    view.body.anchor.set(model.originX / model.cell, model.originY / model.cell);
    // Las texturas de las unidades van a doble densidad: el sprite, a la mitad.
    const k = 1 / this.art.units.detail;
    view.body.scale.set((shown.flip ? -1 : 1) * k, k);
    view.body.position.set(0, 0);
    const side = facingSign(view.dir);
    view.facing = side < 0 ? -1 : 1;
    view.root.position.set(wx, wy);
    view.root.zIndex = wy;

    const carrying = (e.mask[id] & Comp.Worker) !== 0 && e.carryAmount[id] > 0 && !working;
    if (carrying) {
      if (!view.carry) {
        view.carry = new Sprite();
        view.carry.anchor.set(0.5, 1);
        view.root.addChild(view.carry);
      }
      view.carry.texture = this.art.nodes.carry[e.carryKind[id]] ?? this.art.nodes.carry[0];
      // La carga a la espalda: detrás según hacia dónde mira (de espaldas, se ve encima).
      view.carry.position.set(-4 * facingSign(view.dir), facingSign(view.dir) === 0 ? -16 : -17);
      const front = view.dir === 'S' || view.dir === 'SW' || view.dir === 'SE';
      // Detrás del cuerpo (pero encima de la sombra) o delante, según hacia dónde mire.
      const bi = view.root.getChildIndex(view.body);
      const ci = view.root.getChildIndex(view.carry);
      if (front && ci > bi) view.root.setChildIndex(view.carry, bi);
      else if (!front && ci < bi) view.root.setChildIndex(view.carry, view.root.children.length - 1);
      view.carry.visible = true;
    } else if (view.carry) {
      view.carry.visible = false;
    }

    view.ring.visible = selected;
    if (selected) {
      view.ring.anchor.set(0.5);
      view.ring.position.set(wx, wy);
      view.ring.tint = owner === localPlayer ? 0xffffff : TEAM_COLORS[owner][2];
    }
  }

  /**
   * Gira la vista hacia un rumbo de pantalla con histéresis: solo cambia de dirección si el rumbo se aparta más
   * de 30° de la que ya tiene (cada una cubre 45°), para que no titubee entre dos vecinas.
   */
  private face(view: View, sx: number, sy: number): void {
    const angle = Math.atan2(sy, sx);
    const current = (['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'] as const).indexOf(view.dir as 'E');
    if (current >= 0) {
      let diff = Math.abs(angle - (current * Math.PI) / 4);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff <= Math.PI / 6) return;
    }
    view.dir = dirFromScreen(sx, sy);
  }

  /** Herramienta que lleva un aldeano al andar y en reposo según su tarea (ninguna si va cargado). */
  private jobOf(id: number): Job {
    const e = this.sim.entities;
    if ((e.mask[id] & Comp.Worker) === 0 || e.carryAmount[id] > 0) return Job.None;
    if (e.task[id] === Task.Build) return Job.Build;
    if (e.task[id] !== Task.Gather) return Job.None;
    switch (e.homeType[id]) {
      case NodeType.Tree:
        return Job.Wood;
      case NodeType.Gold:
      case NodeType.Stone:
        return Job.Mine;
      case NodeType.Farm:
        return Job.Farm;
      case NodeType.Berries:
        return Job.Forage;
      default:
        return Job.None;
    }
  }

  /** Qué animación toca según lo que hace la unidad, y qué fotograma. */
  private unitAnimation(id: number, type: UnitType, working: boolean, moving: boolean, nowMs: number): { anim: AnimName; frame: number } {
    const e = this.sim.entities;
    const model = this.art.units.model(type);
    const spec = (name: AnimName) => model.anims.find((a) => a.name === name);
    const timed = (name: AnimName, offset = id * 97) => {
      const a = spec(name);
      return { anim: name, frame: a ? Math.floor((nowMs + offset) / a.frameMs) % a.frames : 0 };
    };
    // Trabuquete: se monta y desmonta por pasos; montado, espera o dispara.
    if (spec('deploy') && e.deployState[id] !== 0) {
      const total = Math.max(1, this.sim.deployTicks(type));
      const progress = 1 - e.deployTicks[id] / total;
      if (e.deployState[id] === 1) return { anim: 'deploy', frame: Math.min(3, Math.floor(progress * 4)) };
      if (e.deployState[id] === 3) return { anim: 'deploy', frame: Math.max(0, 3 - Math.floor(progress * 4)) };
      if (!working) return { anim: 'ready', frame: 0 };
    }
    if (working) {
      // Aldeanos: herramienta según la tarea (si caza, ataca).
      if ((e.mask[id] & Comp.Worker) !== 0 && e.attackTarget[id] === 0) {
        if (e.task[id] === Task.Build) return timed('build');
        const node = e.homeType[id];
        if (node === NodeType.Tree) return timed('chop');
        if (node === NodeType.Gold || node === NodeType.Stone) return timed('mine');
        if (node === NodeType.Farm || node === NodeType.Berries) return timed('farm');
        return timed('build');
      }
      if (spec('attack')) {
        const stats = this.sim.stats.unit(e.owner[id], type).attack;
        const reload = stats ? Math.max(1, stats.reloadTicks) : 0;
        if (reload > 0 && e.attackTarget[id] !== 0) {
          // El golpe sale justo cuando la cadencia vuelve a empezar: ese es el fotograma 1.
          const p = 1 - e.attackCooldown[id] / reload;
          return { anim: 'attack', frame: p < 0.2 ? 1 : p < 0.4 ? 2 : p < 0.75 ? 3 : 0 };
        }
        return timed('attack');
      }
    }
    if (moving) {
      // El fotograma sale del ciclo de andar (de la distancia recorrida): los pies no patinan.
      const walk = spec('walk');
      return { anim: 'walk', frame: walk ? Math.floor(this.walkPhase[id] * walk.frames) % walk.frames : 0 };
    }
    return timed('idle');
  }

  /** Con qué vecinos enlaza un muro en (x, y): otros muros del mismo jugador (o casillas que `extra` dé por muro). */
  private wallLink(x: number, y: number, owner: number, extra?: (x: number, y: number) => boolean): number {
    const e = this.sim.entities;
    const isWall = (tx: number, ty: number): boolean => {
      if (extra?.(tx, ty)) return true;
      const id = this.sim.grid.occupantAt(tx, ty);
      return id > 0 && e.has(id, Comp.Building) && e.owner[id] === owner && BUILDING_DEFS[e.buildingType[id] as BuildingType].wall === true;
    };
    return (
      (isWall(x, y - 1) ? WallLink.North : 0) |
      (isWall(x + 1, y) ? WallLink.East : 0) |
      (isWall(x, y + 1) ? WallLink.South : 0) |
      (isWall(x - 1, y) ? WallLink.West : 0)
    );
  }

  /** Polvo al andar (más a menudo los caballos y el asedio) o salpicaduras si va por el agua. */
  private dust(id: number, view: View, type: UnitType, wx: number, wy: number, nowMs: number): void {
    const P = this.particles;
    if (!P) return;
    const big = this.art.units.model(type).bigRing;
    const every = big ? 170 : 520;
    if (nowMs - view.dustAt < every) return;
    view.dustAt = nowMs + Math.random() * 80;
    if (!big && Math.random() < 0.45) return;
    const e = this.sim.entities;
    const terrain = this.sim.map.terrainAt(e.x[id] >> FP_SHIFT, e.y[id] >> FP_SHIFT);
    const wet = terrain === Terrain.Shallow || terrain === Terrain.Deep || terrain === Terrain.Ford;
    P.puff(wet ? 'splash' : 'dust', wx + (Math.random() - 0.5) * 4, wy - 1, { from: 0, to: big ? 2 : 1, vy: -0.006, life: big ? 520 : 420, alpha: wet ? 0.8 : 0.55, ground: true });
  }

  private updateBuilding(id: number, view: View, nowMs: number, selected: boolean, localPlayer: number): void {
    const e = this.sim.entities;
    const type = e.buildingType[id] as BuildingType;
    const def = BUILDING_DEFS[type];
    let stage: BuildStage = BuildStage.Complete;
    if (!e.built[id]) {
      const total = def.buildTime * this.sim.tickRate * FP_ONE;
      const p = e.buildProgress[id] / total;
      stage = p < 0.25 ? BuildStage.Foundation : p < 0.6 ? BuildStage.Frame : BuildStage.Walls;
    } else if (type === BuildingType.Farm) {
      const full = def.food ?? 1;
      const left = e.resAmount[id] / full;
      stage = left > 0.6 ? BuildStage.Complete : left > 0.25 ? BuildStage.FarmHalf : BuildStage.FarmLow;
    } else if (e.hp[id] * 2 < e.maxHp[id]) {
      stage = BuildStage.Damaged;
    }
    const owner = e.owner[id] < TEAM_COLORS.length ? e.owner[id] : 0;
    const era = this.sim.players.era[e.owner[id]];
    const link = def.wall ? this.wallLink(e.tileX[id], e.tileY[id], e.owner[id]) : 0;
    const key = ((stage * 16 + owner) * 8 + era) * 16 + link;
    if (key !== view.textureKey) {
      const sprite = this.art.buildings.sprite(type, owner, era, stage, link);
      const top = tileToWorld(e.tileX[id], e.tileY[id]);
      view.body.texture = sprite.texture;
      const bx = top.x - sprite.originX;
      const by = top.y - sprite.originY;
      view.body.position.set(bx, by);
      view.height = sprite.top;
      view.textureKey = key;
      // Banderas y aspas encima del edificio; humo y fuego, en píxeles de mundo.
      for (const x of view.extras) x.sprite.destroy();
      view.extras = [];
      view.smoke = [];
      for (const em of sprite.emitters) {
        if (em.kind === 'smoke') {
          view.smoke.push({ x: bx + em.x, y: by + em.y, next: nowMs + Math.random() * 600 });
          continue;
        }
        const anim = em.kind === 'sails' ? this.art.buildings.sails(owner) : this.art.buildings.flag(owner, em.w ?? 5, em.h ?? 4);
        const s2 = new Sprite(anim.frames[0]);
        s2.anchor.set(anim.ax, anim.ay);
        s2.position.set(bx + em.x, by + em.y);
        view.root.addChild(s2);
        view.extras.push({ sprite: s2, frames: anim.frames, frameMs: em.kind === 'sails' ? 220 : 130 + (id % 5) * 12 });
      }
      view.fire = sprite.firePoints.map(([x, y]) => [bx + x, by + y] as const);
    }
    for (const x of view.extras) x.sprite.texture = x.frames[Math.floor((nowMs + id * 97) / x.frameMs) % x.frames.length];
    const P = this.particles;
    const active = P !== null && this.liveNow && e.built[id] === 1 && this.onScreen(this.renderX[id], this.renderY[id]);
    if (active) {
      for (const sm of view.smoke) {
        if (nowMs < sm.next) continue;
        sm.next = nowMs + 380 + Math.random() * 260;
        P.puff('smoke', sm.x + (Math.random() - 0.5) * 2, sm.y, { from: 0, to: 4, vx: 0.005 + Math.random() * 0.004, vy: -0.012 - Math.random() * 0.006, life: 2200 + Math.random() * 600, alpha: 0.65 });
      }
    }
    // Las granjas son suelo: siempre por debajo de lo que camine sobre ellas.
    if (type === BuildingType.Farm) view.root.zIndex = -1e6 + this.renderY[id];

    // Fuego: una llama por debajo de la mitad de vida, dos por debajo de un cuarto.
    const flames = e.built[id] && type !== BuildingType.Farm ? (e.hp[id] * 4 < e.maxHp[id] ? 2 : e.hp[id] * 2 < e.maxHp[id] ? 1 : 0) : 0;
    while (view.flames.length < flames) {
      const f = new Sprite();
      f.anchor.set(0.5, 1);
      view.root.addChild(f);
      view.flames.push(f);
    }
    view.flames.forEach((f, i) => {
      f.visible = i < flames;
      if (!f.visible) return;
      const at = view.fire[i] ?? view.fire[0];
      if (at) f.position.set(Math.round(at[0]), Math.round(at[1]) + 1);
      else {
        const s = e.size[id];
        const top = tileToWorld(e.tileX[id], e.tileY[id]);
        f.position.set(Math.round(top.x + (i === 0 ? -5 : 6) * s), Math.round(top.y + 6 * s - (i === 0 ? 0 : 4)));
      }
      f.texture = P ? P.tex.flame[Math.floor((nowMs + id * 37 + i * 90) / FIRE_FRAME_MS) % P.tex.flame.length] : this.art.nodes.fire[(Math.floor((nowMs + id * 37 + i * 90) / FIRE_FRAME_MS) & 1)];
    });
    // Humo negro y brasas de lo que arde.
    if (active && flames > 0 && nowMs >= view.fireNext) {
      view.fireNext = nowMs + 260 / flames;
      const at = view.fire[Math.floor(Math.random() * Math.min(flames, view.fire.length))];
      if (at) {
        P.puff('darkSmoke', at[0] + (Math.random() - 0.5) * 3, at[1] - 8, { from: 1, to: 5, vx: 0.006, vy: -0.016, life: 2000, alpha: 0.75 });
        P.spawn({ x: at[0] + (Math.random() - 0.5) * 4, y: at[1] - 6, vx: (Math.random() - 0.5) * 0.02, vy: -0.03 - Math.random() * 0.02, life: 700, fadeFrom: 0.5, frames: [P.tex.ember] });
      }
    }

    view.ring.visible = selected;
    if (selected) view.ring.tint = owner === localPlayer ? 0xffffff : TEAM_COLORS[owner][2];
  }

  private updateNode(id: number, view: View, selected: boolean): void {
    const e = this.sim.entities;
    const type = e.nodeType[id];
    const left = (full: number) => e.resAmount[id] / Math.max(1, full);
    const level = (f: number) => (f > 0.66 ? 2 : f > 0.33 ? 1 : 0);
    let key: number = type * 64;
    let art: AnchoredTexture;
    switch (type) {
      case NodeType.Tree: {
        // En pie hasta el primer hachazo; luego, tumbado junto al tocón; al final, solo el tocón.
        const f = left(NODE_DEFS[NodeType.Tree].amount);
        const state = f >= 0.999 ? 'standing' : f > 0.35 ? 'felled' : 'stump';
        const species = TREE_SPECIES[(e.variant[id] || 1) as TreeSpecies];
        const variant = hash2(e.tileX[id], e.tileY[id], 0x7ee) % TREE_VARIANT_COUNT;
        key += (state === 'standing' ? 0 : state === 'felled' ? 1 : 2) * 16 + (e.variant[id] || 1) * 4 + variant;
        art = this.art.nodes.tree(species, variant, state);
        break;
      }
      case NodeType.Berries: {
        const l = level(left(NODE_DEFS[NodeType.Berries].amount));
        key += l;
        art = this.art.nodes.bush(l);
        break;
      }
      case NodeType.Gold:
      case NodeType.Stone: {
        const l = level(left(NODE_DEFS[type].amount));
        key += l;
        art = this.art.nodes.deposit(type === NodeType.Gold ? 'gold' : 'stone', l);
        break;
      }
      default: {
        // Carne: el animal abatido tal como quedó al morir.
        const v = e.variant[id] as UnitType;
        key += v;
        const frames = this.art.units.frames(v, 0, 'die', 'S');
        const model = this.art.units.model(v);
        art =
          frames.length > 0
            ? { texture: frames[frames.length - 1].texture, ax: model.originX / model.cell, ay: model.originY / model.cell, scale: 1 / this.art.units.detail }
            : { texture: this.art.nodes.carcass, ax: 0.5, ay: 1 };
      }
    }
    if (key !== view.textureKey) {
      view.body.texture = art.texture;
      view.body.anchor.set(art.ax, art.ay);
      view.body.position.set(0, 0);
      const sc = art.scale ?? 1;
      view.body.scale.set((Math.sign(view.body.scale.x) || 1) * sc, sc);
      view.textureKey = key;
    }
    view.ring.visible = selected;
  }

  /** Barra de vida (o de obra) sobre la unidad (pegada a ella) o el edificio (en píxeles de mundo enteros). */
  private drawBar(id: number, view: View, kind: PickKind): void {
    const e = this.sim.entities;
    const ratio = Math.max(0, Math.min(1, e.hp[id] / Math.max(1, e.maxHp[id])));
    const width = kind === 'unit' ? 12 : 24;
    let x: number;
    let y: number;
    if (kind === 'unit') {
      x = this.snap(this.renderX[id] - width / 2);
      y = this.snap(this.renderY[id] - view.height - 4);
    } else {
      // Justo encima del tejado (no del lienzo, que incluye el estandarte y podría caer sobre el edificio de detrás).
      const top = tileToWorld(e.tileX[id], e.tileY[id]);
      const type = e.buildingType[id] as BuildingType;
      const h = e.built[id] ? this.art.buildings.heights(type, e.owner[id], this.sim.players.era[e.owner[id]]).top : 0;
      x = Math.round(top.x - width / 2);
      y = Math.round(top.y + 8 * e.size[id] - h - 6);
    }
    const fill = Math.max(1, Math.round(width * ratio));
    const color = ratio > 0.6 ? 0x4f8a3c : ratio > 0.3 ? 0xd8b02a : 0xc0392b;
    this.bars.rect(x - 1, y - 1, width + 2, 4).fill(0x1a120c);
    this.bars.rect(x, y, fill, 2).fill(color);
  }

  private buildingTarget(id: number): PickTarget {
    const e = this.sim.entities;
    const s = e.size[id];
    const type = e.buildingType[id] as BuildingType;
    const top = tileToWorld(e.tileX[id], e.tileY[id]);
    const a = 16 * s;
    const b = 8 * s;
    let poly: number[];
    if (type === BuildingType.Farm || !e.built[id]) {
      poly = [top.x, top.y, top.x + a, top.y + b, top.x, top.y + 2 * b, top.x - a, top.y + b];
    } else {
      const { eave, top: peak } = this.art.buildings.heights(type, e.owner[id], this.sim.players.era[e.owner[id]]);
      const wallH = eave;
      const roofH = Math.max(0, peak - eave);
      poly = [
        top.x - a, top.y + b,
        top.x, top.y + 2 * b,
        top.x + a, top.y + b,
        top.x + a, top.y + b - wallH,
        top.x, top.y + b - wallH - roofH,
        top.x - a, top.y + b - wallH,
      ];
    }
    return { id, kind: 'building', x: this.renderX[id], y: this.renderY[id], halfW: a, height: 0, poly };
  }
}
