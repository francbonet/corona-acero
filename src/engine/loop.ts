export interface FixedLoopOptions {
  /** Ticks de simulación por segundo. */
  tickRate: number;
  /** Se llama una vez por tick, con el número de tick (empieza en 0). */
  onTick: (tick: number) => void;
  /** Tope de tiempo real por fotograma, para no encadenar cientos de ticks tras una pausa del navegador. */
  maxFrameMs?: number;
}

/**
 * Bucle de paso fijo: la simulación avanza a ritmo constante (p. ej. 20 Hz) sea cual sea la tasa de fotogramas,
 * y el render recibe un factor `alpha` para interpolar entre el tick anterior y el actual.
 */
export class FixedLoop {
  readonly tickMs: number;
  private readonly onTick: (tick: number) => void;
  private readonly maxFrameMs: number;
  private accumulator = 0;
  private currentTick = 0;

  constructor(options: FixedLoopOptions) {
    if (!(options.tickRate > 0)) throw new RangeError('tickRate debe ser mayor que 0');
    this.tickMs = 1000 / options.tickRate;
    this.onTick = options.onTick;
    this.maxFrameMs = options.maxFrameMs ?? 250;
  }

  /** Número de ticks ejecutados hasta ahora. */
  get tick(): number {
    return this.currentTick;
  }

  /**
   * Avanza `elapsedMs` de tiempo real, ejecuta los ticks que tocan y devuelve `alpha` en [0, 1):
   * la fracción del siguiente tick ya transcurrida.
   */
  advance(elapsedMs: number): number {
    if (elapsedMs > 0) this.accumulator += Math.min(elapsedMs, this.maxFrameMs);
    while (this.accumulator >= this.tickMs) {
      this.onTick(this.currentTick);
      this.currentTick++;
      this.accumulator -= this.tickMs;
    }
    return this.accumulator / this.tickMs;
  }
}
