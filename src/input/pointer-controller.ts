import { BUILDING_DEFS } from '../data/buildings';
import { UnitType } from '../data/units';
import { FP_ONE } from '../engine/fixed';
import type { CursorKind, GameClient } from '../game/client';
import { pickAt, pickInRect } from '../game/picking';
import type { Camera } from '../render/camera';
import type { EntityRenderer } from '../render/entity-renderer';
import { type Point, worldToTile, worldToTileFloor } from '../render/iso';
import { Comp } from '../sim/entities';
import type { Viewport } from './camera-controls';

/** Píxeles que hay que arrastrar para que un clic se convierta en recuadro de selección. */
const DRAG_THRESHOLD = 5;
export const DOUBLE_CLICK_MS = 350;

/**
 * Doble clic = dos clics seguidos sobre la MISMA unidad. Dos clics rápidos sobre unidades distintas del mismo
 * tipo son dos selecciones normales (si no, al ir seleccionando aldeanos uno a uno se cogían todos).
 */
export function isDoubleClick(last: { time: number; id: number }, id: number, time: number): boolean {
  return last.id === id && time - last.time < DOUBLE_CLICK_MS;
}

export interface PointerControllerOptions {
  canvas: HTMLCanvasElement;
  camera: Camera;
  viewport: () => Viewport;
  renderer: EntityRenderer;
  client: GameClient;
  /** Rectángulo del DOM que dibuja el recuadro de selección. */
  box: HTMLElement | null;
  /** Se llama tras cualquier acción, para refrescar el HUD al momento. */
  onChange: () => void;
  /** Cursores CSS por tipo (si no hay, se deja el del navegador). */
  cursors?: Readonly<Record<CursorKind, string>>;
}

/**
 * Ratón sobre el mapa: clic o recuadro para seleccionar (Shift añade), doble clic para todas las del mismo tipo,
 * clic derecho para la orden contextual y, en modo colocación, el fantasma del edificio y el clic para construir.
 */
export class PointerController {
  /** Posición del puntero sobre el lienzo, en píxeles CSS. */
  readonly pointer = { x: 0, y: 0, inside: false };
  private press: { x: number; y: number; pointerId: number } | null = null;
  private dragging = false;
  private lastClick = { time: -Infinity, id: 0 };
  /** Casilla donde empezó a trazarse un muro (arrastrando). */
  private wallStart: Point | null = null;
  /** Cursor puesto ahora y cuándo se miró por última vez qué hay debajo. */
  private cursor = '';
  private cursorCheck = 0;
  private readonly abort = new AbortController();

  constructor(private readonly o: PointerControllerOptions) {
    const signal = this.abort.signal;
    const canvas = o.canvas;
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e), { signal });
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e), { signal });
    canvas.addEventListener('pointerup', (e) => this.onPointerUp(e), { signal });
    canvas.addEventListener('pointercancel', () => this.cancelDrag(), { signal });
    canvas.addEventListener('pointerleave', () => (this.pointer.inside = false), { signal });
  }

  destroy(): void {
    this.abort.abort();
  }

  /** Casilla bajo el puntero, o null. */
  hoverTile(): Point | null {
    if (!this.pointer.inside) return null;
    const w = this.toWorld(this.pointer.x, this.pointer.y);
    const t = worldToTileFloor(w.x, w.y);
    return this.o.client.sim.grid.inBounds(t.x, t.y) ? t : null;
  }

  /** Llamar una vez por fotograma: actualiza el cursor y el fantasma de colocación (o el tramo de muro). */
  update(nowMs = performance.now()): void {
    const { client, renderer } = this.o;
    if (this.o.cursors && nowMs - this.cursorCheck > 90) {
      this.cursorCheck = nowMs;
      let kind: CursorKind = 'hand';
      if (this.pointer.inside && !this.dragging) {
        const w = this.toWorld(this.pointer.x, this.pointer.y);
        kind = client.cursorFor(client.mode.kind === 'normal' ? pickAt(renderer.pickTargets(), w.x, w.y) : null);
      }
      const css = this.o.cursors[kind];
      if (css !== this.cursor) {
        this.cursor = css;
        // Pixi deja el lienzo en `cursor: inherit`: el cursor se pone en su contenedor.
        (this.o.canvas.parentElement ?? this.o.canvas).style.cursor = css;
      }
    }
    const tile = this.hoverTile();
    if (client.mode.kind !== 'place' || !tile) {
      renderer.setGhost(null);
      renderer.setGhostLine(null);
      this.wallStart = null;
      return;
    }
    const type = client.mode.building;
    if (BUILDING_DEFS[type].wall) {
      renderer.setGhost(null);
      const line = wallLine(this.wallStart ?? tile, tile).map((t) => ({ ...t, ok: client.canPlace(type, t.x, t.y) }));
      renderer.setGhostLine(type, line, client.player);
      return;
    }
    renderer.setGhostLine(null);
    const origin = client.placementOrigin(type, tile.x, tile.y);
    renderer.setGhost(type, origin.x, origin.y, client.canPlace(type, origin.x, origin.y), client.player);
  }

  private local(e: PointerEvent): { x: number; y: number } {
    const rect = this.o.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private toWorld(sx: number, sy: number): { x: number; y: number } {
    const { width, height } = this.o.viewport();
    return this.o.camera.screenToWorld(sx, sy, width, height);
  }

  private onPointerDown(e: PointerEvent): void {
    const p = this.local(e);
    const client = this.o.client;
    if (e.button === 0) {
      this.press = { ...p, pointerId: e.pointerId };
      this.dragging = false;
      this.o.canvas.setPointerCapture(e.pointerId);
      if (client.mode.kind === 'place' && BUILDING_DEFS[client.mode.building].wall) this.wallStart = this.hoverTile();
    } else if (e.button === 2) {
      this.lastClick = { time: -Infinity, id: 0 };
      if (client.mode.kind !== 'normal') client.cancelPlacement();
      else this.rightClick(p.x, p.y, e.altKey);
      this.o.onChange();
    }
  }

  private onPointerMove(e: PointerEvent): void {
    const p = this.local(e);
    this.pointer.x = p.x;
    this.pointer.y = p.y;
    this.pointer.inside = true;
    if (!this.press || e.pointerId !== this.press.pointerId || this.o.client.mode.kind !== 'normal') return;
    if (!this.dragging && Math.hypot(p.x - this.press.x, p.y - this.press.y) >= DRAG_THRESHOLD) this.dragging = true;
    if (this.dragging) this.drawBox(this.press.x, this.press.y, p.x, p.y);
  }

  private onPointerUp(e: PointerEvent): void {
    if (e.button !== 0 || !this.press || e.pointerId !== this.press.pointerId) return;
    const p = this.local(e);
    const start = this.press;
    if (this.o.canvas.hasPointerCapture(e.pointerId)) this.o.canvas.releasePointerCapture(e.pointerId);
    const client = this.o.client;
    if (client.mode.kind === 'place') {
      const tile = this.hoverTile();
      if (tile && BUILDING_DEFS[client.mode.building].wall) {
        client.placeWall(wallLine(this.wallStart ?? tile, tile), e.shiftKey);
      } else if (tile) {
        const origin = client.placementOrigin(client.mode.building, tile.x, tile.y);
        client.place(origin.x, origin.y, e.shiftKey);
      }
      this.wallStart = null;
    } else if (client.mode.kind === 'attackMove') {
      const { renderer } = this.o;
      const w = this.toWorld(p.x, p.y);
      const target = pickAt(renderer.pickTargets(), w.x, w.y);
      const t = worldToTile(w.x, w.y);
      client.attackMoveAt(target, Math.floor(t.x * FP_ONE), Math.floor(t.y * FP_ONE), e.shiftKey);
      renderer.showMoveMarker(w.x, w.y, 0xe8735f);
    } else if (client.mode.kind === 'repair') {
      const w = this.toWorld(p.x, p.y);
      client.repairAt(pickAt(this.o.renderer.pickTargets(), w.x, w.y), e.shiftKey);
    } else if (this.dragging) {
      this.selectBox(start.x, start.y, p.x, p.y, e.shiftKey);
    } else {
      this.selectClick(p.x, p.y, e.shiftKey, e.timeStamp);
    }
    this.cancelDrag();
    this.o.onChange();
  }

  private cancelDrag(): void {
    this.press = null;
    this.dragging = false;
    if (this.o.box) this.o.box.style.display = 'none';
  }

  private drawBox(x0: number, y0: number, x1: number, y1: number): void {
    const box = this.o.box;
    if (!box) return;
    box.style.display = 'block';
    box.style.left = `${Math.min(x0, x1)}px`;
    box.style.top = `${Math.min(y0, y1)}px`;
    box.style.width = `${Math.abs(x1 - x0)}px`;
    box.style.height = `${Math.abs(y1 - y0)}px`;
  }

  private selectClick(sx: number, sy: number, shift: boolean, time: number): void {
    const { client, renderer } = this.o;
    const selection = client.selection;
    const e = client.sim.entities;
    const w = this.toWorld(sx, sy);
    const target = pickAt(renderer.pickTargets(), w.x, w.y);
    if (!target) {
      if (!shift) selection.clear();
      return;
    }
    const id = target.id;
    if (target.kind !== 'unit') {
      selection.replace([id]);
      this.lastClick = { time: -Infinity, id: 0 };
      return;
    }
    const own = e.owner[id] === client.player;
    const isDouble = isDoubleClick(this.lastClick, id, time);
    this.lastClick = { time, id };

    if (isDouble && own) {
      // Todas las unidades propias de ese tipo que se ven en pantalla.
      const { width, height } = this.o.viewport();
      const a = this.toWorld(0, 0);
      const b = this.toWorld(width, height);
      const same = pickInRect(renderer.pickTargets(client.player), { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y }).filter(
        (u) => e.unitType[u] === e.unitType[id],
      );
      if (shift) selection.add(same);
      else selection.replace(same);
      return;
    }
    const onlyOwnUnits = selection.values().every((s) => e.has(s, Comp.Unit) && e.owner[s] === client.player);
    if (shift && own && onlyOwnUnits) selection.toggle(id);
    else selection.replace([id]);
  }

  private selectBox(x0: number, y0: number, x1: number, y1: number, shift: boolean): void {
    const { client, renderer } = this.o;
    const selection = client.selection;
    const e = client.sim.entities;
    const a = this.toWorld(Math.min(x0, x1), Math.min(y0, y1));
    const b = this.toWorld(Math.max(x0, x1), Math.max(y0, y1));
    // El recuadro solo selecciona unidades propias, y las ovejas solo si no hay nada más.
    let ids = pickInRect(renderer.pickTargets(client.player), { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y });
    const notSheep = ids.filter((id) => e.unitType[id] !== UnitType.Sheep);
    if (notSheep.length > 0) ids = notSheep;
    if (shift) {
      selection.replace(selection.values().filter((s) => e.has(s, Comp.Unit) && e.owner[s] === client.player));
      selection.add(ids);
    } else if (ids.length > 0 || !shift) {
      selection.replace(ids);
    }
  }

  private rightClick(sx: number, sy: number, alt: boolean): void {
    const { client, renderer } = this.o;
    const w = this.toWorld(sx, sy);
    const target = pickAt(renderer.pickTargets(), w.x, w.y);
    const t = worldToTile(w.x, w.y);
    const result = client.rightClick(target, Math.floor(t.x * FP_ONE), Math.floor(t.y * FP_ONE), alt);
    if (result === 'move') renderer.showMoveMarker(w.x, w.y);
    else if (result === 'work' && target) renderer.showMoveMarker(renderer.renderX[target.id], renderer.renderY[target.id], 0xe3b23c);
    else if (result === 'attack' && target) renderer.showMoveMarker(renderer.renderX[target.id], renderer.renderY[target.id], 0xe8735f);
  }
}

/**
 * Casillas de un tramo de muro de `a` a `b`, unidas por los lados (nunca solo en diagonal,
 * para que no queden huecos por los que pasar).
 */
export function wallLine(a: Point, b: Point): Point[] {
  const out: Point[] = [{ x: a.x, y: a.y }];
  const nx = Math.abs(b.x - a.x);
  const ny = Math.abs(b.y - a.y);
  const sx = b.x > a.x ? 1 : -1;
  const sy = b.y > a.y ? 1 : -1;
  let x = a.x;
  let y = a.y;
  for (let ix = 0, iy = 0; ix < nx || iy < ny; ) {
    if (ny === 0 || (nx > 0 && (0.5 + ix) / nx < (0.5 + iy) / ny)) {
      x += sx;
      ix++;
    } else {
      y += sy;
      iy++;
    }
    out.push({ x, y });
  }
  return out;
}
