import type { Camera } from '../render/camera';

/**
 * Teclas de desplazamiento, por `KeyboardEvent.code`. Solo flechas: Q W E R / A S D F / Z X C V
 * son la rejilla de atajos del panel de órdenes (GDD §12).
 */
const PAN_KEYS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

/** Rueda acumulada (en píxeles) necesaria para un paso de zoom; evita saltos con los trackpads. */
const WHEEL_STEP = 80;

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/** Controles de cámara clásicos de RTS: flechas, borde de pantalla, rueda para zoom y arrastre con el botón central. */
export class CameraControls {
  /** Velocidad de desplazamiento en píxeles de pantalla por segundo (no depende del zoom). */
  panSpeed = 720;
  edgeScroll = true;
  edgeSize = 10;
  /** Última posición del puntero en la ventana (aunque esté sobre el HUD), en píxeles CSS. */
  readonly pointer = { x: 0, y: 0, inside: false };

  private readonly pressed = new Set<string>();
  private drag: { x: number; y: number } | null = null;
  private wheelAccum = 0;
  private readonly abort = new AbortController();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: Camera,
    private readonly viewport: () => Viewport,
  ) {
    const signal = this.abort.signal;
    window.addEventListener('keydown', (e) => this.onKeyDown(e), { signal });
    window.addEventListener('keyup', (e) => this.pressed.delete(e.code), { signal });
    window.addEventListener(
      'blur',
      () => {
        this.pressed.clear();
        this.drag = null;
      },
      { signal },
    );
    // El borde se vigila en toda la ventana: el panel inferior del HUD tapa el borde del lienzo.
    window.addEventListener('pointermove', (e) => this.onPointerMove(e), { signal });
    document.addEventListener(
      'pointerout',
      (e) => {
        if (!e.relatedTarget) this.pointer.inside = false;
      },
      { signal },
    );
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e), { signal });
    canvas.addEventListener('pointerup', (e) => this.onPointerUp(e), { signal });
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { signal, passive: false });
  }

  /** Llamar una vez por fotograma. */
  update(frameMs: number): void {
    const dt = Math.min(frameMs, 100) / 1000;
    let dx = 0;
    let dy = 0;
    for (const code of this.pressed) {
      const dir = PAN_KEYS[code];
      if (!dir) continue;
      dx += dir[0];
      dy += dir[1];
    }
    if (this.edgeScroll && this.pointer.inside && !this.drag && document.hasFocus()) {
      const width = window.innerWidth;
      const height = window.innerHeight;
      if (this.pointer.x < this.edgeSize) dx -= 1;
      else if (this.pointer.x > width - this.edgeSize) dx += 1;
      if (this.pointer.y < this.edgeSize) dy -= 1;
      else if (this.pointer.y > height - this.edgeSize) dy += 1;
    }
    dx = Math.sign(dx);
    dy = Math.sign(dy);
    if (dx === 0 && dy === 0) return;
    const norm = dx !== 0 && dy !== 0 ? Math.SQRT1_2 : 1;
    const dist = (this.panSpeed * dt * norm) / this.camera.zoom;
    this.camera.pan(dx * dist, dy * dist);
  }

  destroy(): void {
    this.abort.abort();
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code in PAN_KEYS) {
      this.pressed.add(e.code);
      e.preventDefault();
    }
  }

  private updatePointer(e: PointerEvent | WheelEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = e.clientX - rect.left;
    this.pointer.y = e.clientY - rect.top;
    this.pointer.inside = true;
  }

  private onPointerMove(e: PointerEvent): void {
    this.updatePointer(e);
    if (!this.drag) return;
    const z = this.camera.zoom;
    this.camera.pan(-(e.clientX - this.drag.x) / z, -(e.clientY - this.drag.y) / z);
    this.drag = { x: e.clientX, y: e.clientY };
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 1) return;
    e.preventDefault();
    this.drag = { x: e.clientX, y: e.clientY };
    this.canvas.setPointerCapture(e.pointerId);
  }

  private onPointerUp(e: PointerEvent): void {
    if (e.button !== 1 || !this.drag) return;
    this.drag = null;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.updatePointer(e);
    const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    this.wheelAccum += delta;
    if (Math.abs(this.wheelAccum) < WHEEL_STEP) return;
    const step = this.wheelAccum < 0 ? 1 : -1;
    this.wheelAccum = 0;
    const { width, height } = this.viewport();
    this.camera.zoomAt(this.camera.zoom + step, this.pointer.x, this.pointer.y, width, height);
  }
}
