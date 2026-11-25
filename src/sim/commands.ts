/**
 * Órdenes que entran en la simulación. El jugador, la IA y (en el futuro) la red usan exactamente esta vía.
 * Las coordenadas de mundo van en punto fijo (casillas × 256); las de casilla, en enteros.
 */
export type Command =
  | {
      readonly type: 'move';
      readonly player: number;
      readonly units: readonly number[];
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly type: 'stop';
      readonly player: number;
      readonly units: readonly number[];
    }
  | {
      /** Recolectar de una fuente (árbol, mina, bayas, oveja, granja). */
      readonly type: 'gather';
      readonly player: number;
      readonly units: readonly number[];
      readonly target: number;
    }
  | {
      /** Llevar lo que cargan a un punto de entrega concreto. */
      readonly type: 'deliver';
      readonly player: number;
      readonly units: readonly number[];
      readonly target: number;
    }
  | {
      /** Colocar los cimientos de un edificio y mandar a construirlo. */
      readonly type: 'build';
      readonly player: number;
      readonly units: readonly number[];
      readonly buildingType: number;
      readonly tileX: number;
      readonly tileY: number;
      /** Shift: añadir a la cola de construcción en vez de sustituir la tarea actual. */
      readonly queue: boolean;
    }
  | {
      /** Ayudar a construir unos cimientos que ya existen, o reparar un edificio propio dañado. */
      readonly type: 'construct';
      readonly player: number;
      readonly units: readonly number[];
      readonly target: number;
      readonly queue: boolean;
    }
  | {
      readonly type: 'train';
      readonly player: number;
      readonly building: number;
      readonly unitType: number;
    }
  | {
      readonly type: 'cancelTrain';
      readonly player: number;
      readonly building: number;
      readonly index: number;
    }
  | {
      /** Punto de reunión: las unidades nuevas van allí (o a recolectar, si `target` es una fuente). */
      readonly type: 'rally';
      readonly player: number;
      readonly buildings: readonly number[];
      readonly x: number;
      readonly y: number;
      readonly target: number;
    }
  | {
      /** Atacar un objetivo concreto (unidad o edificio). */
      readonly type: 'attack';
      readonly player: number;
      readonly units: readonly number[];
      readonly target: number;
    }
  | {
      /** Avanzar hacia un punto atacando a los enemigos que aparezcan. */
      readonly type: 'attackMove';
      /** La formación acompaña también al asedio y los sanadores a su paso. */
      readonly escort?: boolean;
      readonly player: number;
      readonly units: readonly number[];
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly type: 'stance';
      readonly player: number;
      readonly units: readonly number[];
      readonly stance: number;
    }
  | {
      /** Entrar en un edificio (centro de la villa, torre). */
      readonly type: 'garrison';
      readonly player: number;
      readonly units: readonly number[];
      readonly target: number;
    }
  | {
      /** Sacar a todas las unidades guarecidas. */
      readonly type: 'ungarrison';
      readonly player: number;
      readonly buildings: readonly number[];
    }
  | {
      /** Investigar una tecnología (o avanzar de era) en un edificio. */
      readonly type: 'research';
      readonly player: number;
      readonly building: number;
      readonly tech: number;
    }
  | {
      /** Comprar (100 unidades por oro) o vender (100 unidades a cambio de oro) en el mercado. */
      readonly type: 'market';
      readonly player: number;
      /** 0 comida, 1 madera, 2 piedra. */
      readonly resource: number;
      readonly buy: boolean;
    }
  | {
      /** Ruta de comercio entre el mercado del que salió el carro y `target`. */
      readonly type: 'trade';
      readonly player: number;
      readonly units: readonly number[];
      readonly target: number;
    }
  | {
      /** Derribar edificios propios (en unos cimientos, cancelar la obra). */
      readonly type: 'demolish';
      readonly player: number;
      readonly buildings: readonly number[];
    }
  | {
      /** Rendirse: el jugador queda derrotado y desaparece todo lo suyo. */
      readonly type: 'resign';
      readonly player: number;
    }
  | {
      /** Solo para pruebas: crea unidades alrededor de una casilla. */
      readonly type: 'debugSpawn';
      readonly player: number;
      readonly unitType: number;
      readonly tileX: number;
      readonly tileY: number;
      readonly count: number;
    };

export interface ScheduledCommand {
  readonly tick: number;
  readonly command: Command;
}

/** Cola de órdenes por tick. Dentro de un mismo tick se aplican en el orden en que llegaron. */
export class CommandQueue {
  private readonly pending = new Map<number, Command[]>();

  schedule(tick: number, command: Command): void {
    const list = this.pending.get(tick);
    if (list) list.push(command);
    else this.pending.set(tick, [command]);
  }

  /** Saca las órdenes del tick indicado. */
  take(tick: number): Command[] {
    const list = this.pending.get(tick) ?? [];
    this.pending.delete(tick);
    return list;
  }

  get size(): number {
    let n = 0;
    for (const list of this.pending.values()) n += list.length;
    return n;
  }
}
