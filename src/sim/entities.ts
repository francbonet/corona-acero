/**
 * ECS mínimo con arrays de componentes (struct of arrays).
 * Cada entidad es un id entero (0 = ninguna); cada componente es un bit de `mask` y uno o varios arrays tipados.
 * Los sistemas recorren los ids en orden ascendente, siempre el mismo: eso hace la simulación determinista.
 */

export const Comp = {
  Position: 1 << 0,
  /** Unidad (seleccionable en grupo, se separa de las demás). */
  Unit: 1 << 1,
  Mover: 1 << 2,
  /** Fuente de recursos: árbol, mina, arbusto, oveja, granja. */
  Resource: 1 << 3,
  Building: 1 << 4,
  /** Recolecta y construye (aldeanos). */
  Worker: 1 << 5,
  /** Entrena unidades. */
  Producer: 1 << 6,
} as const;

export const MoveState = {
  Idle: 0,
  WaitingPath: 1,
  Moving: 2,
} as const;
export type MoveState = (typeof MoveState)[keyof typeof MoveState];

/** Orden en curso de una unidad (lo que le mandó el jugador o la IA). */
export const Order = {
  None: 0,
  /** Moverse sin entretenerse con enemigos. */
  Move: 1,
  /** Avanzar atacando lo que se encuentre. */
  AttackMove: 2,
  /** Atacar un objetivo concreto. */
  Attack: 3,
  /** Entrar en un edificio. */
  Garrison: 4,
  /** Ir y venir entre dos mercados (carros de comercio). */
  Trade: 5,
} as const;
export type Order = (typeof Order)[keyof typeof Order];

/** Tarea de un aldeano. */
export const Task = {
  None: 0,
  Gather: 1,
  Deliver: 2,
  /** Construir unos cimientos o reparar un edificio propio dañado. */
  Build: 3,
} as const;
export type Task = (typeof Task)[keyof typeof Task];

type IntArray = Int32Array | Uint32Array | Int16Array | Uint16Array | Uint8Array;

export class Entities {
  /** Los ids válidos están en 1..highWater-1. */
  highWater = 1;
  readonly capacity: number;

  readonly mask: Uint32Array;
  /** Distingue una entidad de otra que reutiliza su id tras morir. */
  readonly generation: Uint32Array;
  private nextGeneration = 1;

  // ── Position (punto fijo, casillas × 256) ──
  readonly x: Int32Array;
  readonly y: Int32Array;
  /** Posición al empezar el tick, para interpolar en el render. */
  readonly prevX: Int32Array;
  readonly prevY: Int32Array;

  // ── Comunes ──
  readonly owner: Uint8Array;
  readonly hp: Int32Array;
  readonly maxHp: Int32Array;

  // ── Unit ──
  readonly unitType: Uint8Array;
  readonly radius: Int32Array;

  // ── Mover ──
  readonly speed: Int32Array;
  readonly moveState: Uint8Array;
  readonly goalX: Int32Array;
  readonly goalY: Int32Array;
  /** Último id de petición de camino: si llega un resultado con otro id, está obsoleto. */
  readonly pathRequest: Uint32Array;
  /** Puntos de paso en punto fijo, empaquetados [x0, y0, x1, y1, …]. */
  readonly path: (Int32Array | null)[];
  readonly pathIndex: Uint16Array;
  readonly stuckTicks: Uint16Array;
  readonly repaths: Uint8Array;
  /** Velocidad máxima mientras marcha en formación (la del más lento del grupo); 0 = la suya. */
  readonly speedCap: Int32Array;

  // ── Worker ──
  readonly task: Uint8Array;
  /** Objetivo de la tarea actual: fuente, punto de entrega o edificio. */
  readonly taskTarget: Int32Array;
  /** Intentos fallidos de llegar al objetivo. */
  readonly taskFails: Uint8Array;
  /** 1 si ya se pidió un camino hacia el objetivo actual. */
  readonly taskPathed: Uint8Array;
  /** 1 durante los ticks en que está trabajando (para la animación). */
  readonly working: Uint8Array;
  readonly carryKind: Uint8Array;
  readonly carryAmount: Uint16Array;
  readonly gatherAccum: Int32Array;
  /** Última fuente de la que recolectó, para volver tras entregar o buscar otra igual cerca. */
  readonly homeNode: Int32Array;
  readonly homeType: Uint8Array;
  readonly homeX: Int32Array;
  readonly homeY: Int32Array;
  /** Edificios pendientes de construir después del actual (Shift al colocar). */
  readonly buildQueue: (number[] | null)[];

  // ── Resource ──
  readonly nodeType: Uint8Array;
  readonly resKind: Uint8Array;
  readonly resAmount: Int32Array;
  /** Variante visual (especie de árbol…). */
  readonly variant: Uint8Array;

  // ── Huella en la rejilla (edificios y fuentes fijas) ──
  readonly tileX: Int16Array;
  readonly tileY: Int16Array;
  /** Lado de la huella en casillas (0 = sin huella: unidades y ovejas). */
  readonly size: Uint8Array;

  // ── Building ──
  readonly buildingType: Uint8Array;
  readonly buildProgress: Int32Array;
  readonly built: Uint8Array;
  /** Reparación: fracción de punto de vida acumulada (1/256) y vida repuesta desde que empezó a dañarse (para cobrarla). */
  readonly repairAccum: Int32Array;
  readonly repairDone: Int32Array;
  /** Aldeano asignado (granjas: un solo granjero). */
  readonly occupant: Int32Array;

  // ── Combate ──
  /** Enemigo con el que está enzarzado (0 = ninguno). */
  readonly attackTarget: Int32Array;
  /** Ticks que faltan para poder volver a atacar. */
  readonly attackCooldown: Uint16Array;
  readonly stance: Uint8Array;
  readonly order: Uint8Array;
  readonly orderTarget: Int32Array;
  /** Destino de la orden (ataque-mover) o punto de guardia (postura defensiva). */
  readonly orderX: Int32Array;
  readonly orderY: Int32Array;
  /** Edificio en el que está guarecida (0 = fuera). Mientras, no tiene Position. */
  readonly garrisonedIn: Int32Array;
  /** Ticks de huida que le quedan (ciervos). */
  readonly fleeTicks: Uint16Array;
  /** Radio de visión en casillas. */
  readonly los: Uint8Array;
  /** Asedio que se monta: 0 desmontado, 1 montándose, 2 montado, 3 desmontándose. */
  readonly deployState: Uint8Array;
  readonly deployTicks: Uint16Array;
  /** Ticks que le quedan a una conversión en curso (monjes). */
  readonly channel: Uint16Array;
  /** Puesto cuerpo a cuerpo alrededor de su objetivo: objetivo × 8 + dirección + 1 (0 = ninguno). */
  readonly meleeSlot: Int32Array;
  /** Intentos fallidos de alcanzar al objetivo de ataque (para rendirse si es inalcanzable). */
  readonly chaseFails: Uint8Array;
  /** Hasta qué tick se considera inalcanzable esta fuente (presas metidas donde no se llega). */
  readonly blockedUntil: Uint32Array;

  // ── Producer ──
  readonly queue: (number[] | null)[];
  readonly trainProgress: Int32Array;
  readonly trainStarted: Uint8Array;
  readonly hasRally: Uint8Array;
  readonly rallyX: Int32Array;
  readonly rallyY: Int32Array;
  readonly rallyTarget: Int32Array;

  private readonly numeric: IntArray[] = [];
  private readonly lists: unknown[][] = [];
  private readonly freeIds: number[] = [];
  private freeHead = 0;

  constructor(capacity = 16384) {
    this.capacity = capacity;
    const i32 = () => this.track(new Int32Array(capacity));
    const u32 = () => this.track(new Uint32Array(capacity));
    const i16 = () => this.track(new Int16Array(capacity));
    const u16 = () => this.track(new Uint16Array(capacity));
    const u8 = () => this.track(new Uint8Array(capacity));
    const list = <T>() => {
      const l = new Array<T | null>(capacity).fill(null);
      this.lists.push(l);
      return l;
    };

    this.mask = u32();
    this.generation = u32();
    this.x = i32();
    this.y = i32();
    this.prevX = i32();
    this.prevY = i32();
    this.owner = u8();
    this.hp = i32();
    this.maxHp = i32();
    this.unitType = u8();
    this.radius = i32();
    this.speed = i32();
    this.moveState = u8();
    this.goalX = i32();
    this.goalY = i32();
    this.pathRequest = u32();
    this.path = list<Int32Array>();
    this.pathIndex = u16();
    this.stuckTicks = u16();
    this.repaths = u8();
    this.speedCap = i32();
    this.task = u8();
    this.taskTarget = i32();
    this.taskFails = u8();
    this.taskPathed = u8();
    this.working = u8();
    this.carryKind = u8();
    this.carryAmount = u16();
    this.gatherAccum = i32();
    this.homeNode = i32();
    this.homeType = u8();
    this.homeX = i32();
    this.homeY = i32();
    this.buildQueue = list<number[]>();
    this.nodeType = u8();
    this.resKind = u8();
    this.resAmount = i32();
    this.variant = u8();
    this.tileX = i16();
    this.tileY = i16();
    this.size = u8();
    this.buildingType = u8();
    this.buildProgress = i32();
    this.built = u8();
    this.repairAccum = i32();
    this.repairDone = i32();
    this.occupant = i32();
    this.attackTarget = i32();
    this.attackCooldown = u16();
    this.stance = u8();
    this.order = u8();
    this.orderTarget = i32();
    this.orderX = i32();
    this.orderY = i32();
    this.garrisonedIn = i32();
    this.fleeTicks = u16();
    this.los = u8();
    this.deployState = u8();
    this.deployTicks = u16();
    this.channel = u16();
    this.meleeSlot = i32();
    this.chaseFails = u8();
    this.blockedUntil = u32();
    this.queue = list<number[]>();
    this.trainProgress = i32();
    this.trainStarted = u8();
    this.hasRally = u8();
    this.rallyX = i32();
    this.rallyY = i32();
    this.rallyTarget = i32();
  }

  /** Crea una entidad con los componentes indicados. Reutiliza ids liberados en orden FIFO (el más antiguo primero). */
  create(components: number): number {
    let id: number;
    if (this.freeHead < this.freeIds.length) {
      id = this.freeIds[this.freeHead++];
      if (this.freeHead > 1024 && this.freeHead * 2 > this.freeIds.length) {
        this.freeIds.splice(0, this.freeHead);
        this.freeHead = 0;
      }
    } else {
      if (this.highWater >= this.capacity) throw new Error('No caben más entidades');
      id = this.highWater++;
    }
    this.clear(id);
    this.mask[id] = components;
    this.generation[id] = this.nextGeneration++;
    return id;
  }

  destroy(id: number): void {
    if (!this.isAlive(id)) return;
    this.clear(id);
    this.freeIds.push(id);
  }

  isAlive(id: number): boolean {
    return id > 0 && id < this.highWater && this.mask[id] !== 0;
  }

  has(id: number, components: number): boolean {
    return id > 0 && id < this.highWater && (this.mask[id] & components) === components;
  }

  /** Número de entidades vivas. */
  count(): number {
    let n = 0;
    for (let id = 1; id < this.highWater; id++) if (this.mask[id] !== 0) n++;
    return n;
  }

  /**
   * Partidas guardadas antes de que existiera algún array: lo añade vacío (a cero), para que sigan cargando.
   * Se llama al restaurar una partida.
   */
  fillMissing(): void {
    const fresh = new Entities(this.capacity);
    const self = this as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(fresh)) {
      if (key in self) continue;
      self[key] = value;
      if (ArrayBuffer.isView(value)) this.numeric.push(value as IntArray);
      else if (Array.isArray(value)) this.lists.push(value);
    }
  }

  private track<T extends IntArray>(array: T): T {
    this.numeric.push(array);
    return array;
  }

  private clear(id: number): void {
    for (const a of this.numeric) a[id] = 0;
    for (const l of this.lists) l[id] = null;
  }
}
