import { Difficulty } from '../ai/difficulty';
import { BuildingType } from '../data/buildings';
import { NodeType } from '../data/nodes';
import { UnitType } from '../data/units';
import { Comp, Task } from '../sim/entities';
import type { Simulation } from '../sim/simulation';
import type { GameClient, IconRef } from './client';
import { Faction } from '../data/factions';
import type { MatchConfig } from './match';
import { LOCAL_PLAYER } from './scenario';

/**
 * Tutorial interactivo: una partida en un mapa pequeño con un rival que no juega, guiada paso a paso por un
 * narrador. Cada paso explica una cosa, dice qué hacer y espera a que el jugador lo haga (lo comprueba en la
 * simulación); algunos resaltan el botón que hay que pulsar. Al final, unos lobos rondan la aldea para
 * practicar el combate.
 */

export const TUTORIAL_MATCH: MatchConfig = {
  seed: 'tutorial-aldea',
  mapSize: 'small',
  faction: Faction.Castilla,
  rivals: [{ faction: Faction.Inglaterra, difficulty: Difficulty.Easy }],
  passive: true,
};

/** Recursos con los que empieza el tutorial (algo más que una partida, para no tener que esperar). */
export const TUTORIAL_STOCK = [400, 400, 200, 150] as const;

export interface TutorialView {
  readonly step: number;
  readonly total: number;
  readonly title: string;
  readonly text: string;
  /** Lo que hay que hacer (vacío en los pasos que solo explican). */
  readonly task: string;
  /** El paso se pasa con "Siguiente" (no espera a que se haga nada). */
  readonly manual: boolean;
  readonly done: boolean;
}

interface Step {
  readonly title: string;
  readonly text: string;
  readonly task?: string;
  /** ¿Hecho? Si no hay, el paso se pasa con "Siguiente". */
  readonly check?: (t: TutorialContext) => boolean;
  /** Botones del panel de órdenes que se resaltan. */
  readonly hint?: (ref: IconRef) => boolean;
  /** Al empezar el paso. */
  readonly start?: (t: TutorialContext) => void;
}

interface TutorialContext {
  readonly sim: Simulation;
  readonly client: GameClient;
  /** Valores apuntados al empezar el paso (para comparar). */
  readonly mark: Map<string, number>;
  readonly wolves: number[];
}

const own = (t: TutorialContext) => t.sim.unitIds.filter((id) => t.sim.entities.isAlive(id) && t.sim.entities.owner[id] === LOCAL_PLAYER);
const count = (t: TutorialContext, type: UnitType) => own(t).filter((id) => t.sim.entities.unitType[id] === type).length;
/** ¿Tiene ya un edificio de este tipo terminado (no solo los cimientos)? */
const hasBuilt = (t: TutorialContext, type: BuildingType) =>
  t.sim.buildingIds.some(
    (id) => t.sim.entities.isAlive(id) && t.sim.entities.owner[id] === LOCAL_PLAYER && t.sim.entities.buildingType[id] === type && t.sim.entities.built[id] === 1,
  );
const gathering = (t: TutorialContext, nodes: readonly NodeType[]) =>
  own(t).some((id) => {
    const e = t.sim.entities;
    return (e.mask[id] & Comp.Worker) !== 0 && e.task[id] === Task.Gather && nodes.includes(e.homeType[id] as NodeType);
  });
const selected = (t: TutorialContext, pred: (id: number) => boolean) => [...t.client.selection.set].some(pred);
const isUnit = (ref: IconRef, type: UnitType) => ref.kind === 'unit' && ref.type === type;
const isBuilding = (ref: IconRef, type: BuildingType) => ref.kind === 'building' && ref.type === type;

const STEPS: readonly Step[] = [
  {
    title: 'Bienvenido a Corona y Acero',
    text: 'Eres el señor de una pequeña aldea castellana. En este tutorial aprenderás a reunir recursos, construir, entrenar tropas y defenderte. Mueve la cámara con las flechas o llevando el ratón al borde de la pantalla; con la rueda te acercas y te alejas.',
  },
  {
    title: 'Tus aldeanos',
    text: 'Los aldeanos lo hacen todo: recogen recursos y construyen. Haz clic sobre uno para seleccionarlo; arrastrando un recuadro seleccionas varios a la vez.',
    task: 'Selecciona un aldeano.',
    check: (t) => selected(t, (id) => t.sim.entities.unitType[id] === UnitType.Villager),
  },
  {
    title: 'Madera',
    text: 'La madera sirve para casas, edificios y arcos. Con un aldeano seleccionado, haz clic derecho sobre un árbol: talará y llevará la madera al centro de la villa.',
    task: 'Manda a un aldeano a talar un árbol.',
    check: (t) => gathering(t, [NodeType.Tree]),
  },
  {
    title: 'Comida',
    text: 'La comida da de comer a los nuevos aldeanos y soldados. Las bayas de los arbustos y las ovejas son la comida más rápida al principio: manda a otro aldeano a por ellas con un clic derecho.',
    task: 'Manda a un aldeano a recoger bayas o a por una oveja.',
    check: (t) => gathering(t, [NodeType.Berries, NodeType.Sheep, NodeType.Carcass, NodeType.Farm]),
  },
  {
    title: 'Más aldeanos',
    text: 'Cuantos más aldeanos, más recursos. Selecciona el centro de la villa (o pulsa H) y pulsa el botón del aldeano en el panel de órdenes, abajo a la izquierda.',
    task: 'Entrena un aldeano en el centro de la villa.',
    start: (t) => t.mark.set('villagers', count(t, UnitType.Villager)),
    check: (t) =>
      count(t, UnitType.Villager) > (t.mark.get('villagers') ?? 0) ||
      t.sim.buildingIds.some((id) => t.sim.entities.owner[id] === LOCAL_PLAYER && (t.sim.entities.queue[id]?.length ?? 0) > 0),
    hint: (ref) => isUnit(ref, UnitType.Villager),
  },
  {
    title: 'Casas',
    text: '¿Ves que el aldeano nuevo no sale? No cabe más gente: arriba a la izquierda, la población está llena (5/5). Cada casa da sitio a 5 personas más. Selecciona un aldeano, abre los edificios económicos y elige la casa; luego haz clic en el suelo para colocarla y deja que el aldeano la termine.',
    task: 'Construye una casa y espera a que esté terminada.',
    check: (t) => hasBuilt(t, BuildingType.House),
    hint: (ref) => isBuilding(ref, BuildingType.House) || (ref.kind === 'page' && ref.page === 1),
  },
  {
    title: 'El cuartel',
    text: 'Para defenderte necesitas soldados. Con un aldeano seleccionado, abre los edificios militares y coloca un cuartel. Puedes mandar a varios aldeanos a construirlo: acabarán antes.',
    task: 'Construye un cuartel y espera a que esté terminado.',
    check: (t) => hasBuilt(t, BuildingType.Barracks),
    hint: (ref) => isBuilding(ref, BuildingType.Barracks) || (ref.kind === 'page' && ref.page === 2),
  },
  {
    title: 'Milicias',
    text: 'Selecciona el cuartel y entrena milicias: infantería barata que sirve contra casi todo al principio. Cuesta comida y oro.',
    task: 'Ten 3 milicias.',
    check: (t) => count(t, UnitType.Militia) >= 3,
    hint: (ref) => isUnit(ref, UnitType.Militia),
  },
  {
    title: 'Explorar',
    text: 'Lo que no has visto está a oscuras. Selecciona al batidor, tu jinete, y mándalo lejos con un clic derecho, o en el minimapa. Descubrirás bosques, minas de oro y piedra… y quizá al enemigo.',
    task: 'Explora con el batidor.',
    start: (t) => t.mark.set('explored', explored(t)),
    check: (t) => explored(t) > (t.mark.get('explored') ?? 0) + 250,
  },
  {
    title: '¡Lobos!',
    text: 'Unos lobos rondan la aldea. Selecciona a tus milicias (arrastra un recuadro o pulsa 1 si les has asignado un grupo con Ctrl+1) y haz clic derecho sobre un lobo para atacarlo.',
    task: 'Acaba con los lobos.',
    start: (t) => {
      const e = t.sim.entities;
      const tc = t.sim.buildingIds.find((id) => e.owner[id] === LOCAL_PLAYER && e.buildingType[id] === BuildingType.TownCenter);
      if (!tc) return;
      t.wolves.push(...t.sim.spawnGroup(UnitType.Wolf, 0, e.tileX[tc] + 9, e.tileY[tc] + 7, 2));
    },
    check: (t) => t.wolves.length > 0 && t.wolves.every((id) => !t.sim.entities.isAlive(id) || t.sim.entities.unitType[id] !== UnitType.Wolf),
  },
  {
    title: '¡Bien hecho, mi señor!',
    text: 'Ya sabes lo esencial. En una partida de verdad avanzarás de era en el centro de la villa (Burgos, Coronas y Pólvora), mejorarás tus tropas en la herrería y harás frente a señores que también juegan. Esc o F10 abren el menú.',
  },
];

function explored(t: TutorialContext): number {
  const layer = t.sim.visibility.layers(LOCAL_PLAYER).explored;
  let n = 0;
  for (let i = 0; i < layer.length; i++) n += layer[i];
  return n;
}

export class Tutorial {
  private index = 0;
  private started = -1;
  private readonly ctx: TutorialContext;

  constructor(sim: Simulation, client: GameClient) {
    this.ctx = { sim, client, mark: new Map(), wolves: [] };
  }

  get finished(): boolean {
    return this.index >= STEPS.length - 1;
  }

  /** Comprueba el paso en curso y pasa al siguiente si ya está hecho. Devuelve true si ha cambiado de paso. */
  update(): boolean {
    this.begin();
    const step = STEPS[this.index];
    if (step.check?.(this.ctx)) {
      this.advance();
      return true;
    }
    return false;
  }

  /** "Siguiente" en los pasos que solo explican. */
  next(): void {
    if (!STEPS[this.index].check) this.advance();
  }

  /** ¿Se resalta este botón del panel de órdenes? */
  hint(ref: IconRef): boolean {
    return STEPS[this.index].hint?.(ref) ?? false;
  }

  view(): TutorialView {
    const s = STEPS[this.index];
    return { step: this.index + 1, total: STEPS.length, title: s.title, text: s.text, task: s.task ?? '', manual: !s.check, done: this.finished };
  }

  private begin(): void {
    if (this.started === this.index) return;
    this.started = this.index;
    STEPS[this.index].start?.(this.ctx);
  }

  private advance(): void {
    if (this.index < STEPS.length - 1) this.index++;
    this.begin();
  }
}

export const TUTORIAL_STEP_COUNT = STEPS.length;
