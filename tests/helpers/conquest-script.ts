import { BUILDING_DEFS, BuildingType } from '../../src/data/buildings';
import { TECH_DEFS, TechType } from '../../src/data/techs';
import { UNIT_DEFS, UnitType } from '../../src/data/units';
import { tileCenterFixed } from '../../src/engine/fixed';
import { Comp, Order, Task } from '../../src/sim/entities';
import type { Simulation } from '../../src/sim/simulation';
import { researchBlocker } from '../../src/sim/tech';
import { canPlaceBuilding } from '../../src/sim/world';
import { EcoScript } from './eco-script';

/**
 * Guion de partida completa para pruebas: la economía del EcoScript más el avance de eras,
 * los edificios que exige cada era, asedio e infantería, y el ataque final contra la base rival.
 * Solo usa la cola de órdenes, igual que un jugador. Germen de la IA de la Fase 5.
 */
export class ConquestScript {
  private readonly eco: EcoScript;
  private attacking = false;

  constructor(
    private readonly sim: Simulation,
    private readonly player: number,
    private readonly enemyStart: { x: number; y: number },
  ) {
    this.eco = new EcoScript(sim, player);
  }

  /** Llamar una vez por segundo de juego. */
  update(): void {
    this.eco.update();
    const sim = this.sim;
    const P = this.player;
    const e = sim.entities;
    const era = sim.players.era[P];
    const mine = (type: BuildingType) => sim.buildingIds.filter((b) => e.isAlive(b) && e.owner[b] === P && e.buildingType[b] === type);
    const built = (type: BuildingType) => mine(type).filter((b) => e.built[b]);
    const tc = built(BuildingType.TownCenter)[0];
    if (!tc) return;

    // Eras: en cuanto se cumplan los requisitos; mientras tanto se ahorra comida (sin aldeanos nuevos).
    const advance = [TechType.AdvanceBurgos, TechType.AdvanceCoronas, TechType.AdvancePolvora][era];
    const villagers = sim.unitIds.filter((id) => e.has(id, Comp.Worker) && e.owner[id] === P).length;
    const wantsAdvance = advance !== undefined && era < 2 && !sim.players.isResearching(P, advance) && researchBlocker(sim, P, advance) === null;
    this.eco.holdVillagers = wantsAdvance && villagers >= 20 + era * 15;
    if (wantsAdvance) this.research(tc, advance, true);

    // Obras abandonadas (el economista se llevó al constructor): mandar a alguien a terminarlas.
    if (sim.tick % (10 * sim.tickRate) === 0) {
      for (const b of sim.buildingIds) {
        if (!e.isAlive(b) || e.owner[b] !== P || e.built[b]) continue;
        const busy = sim.unitIds.some((id) => e.task[id] === Task.Build && e.taskTarget[id] === b);
        const worker = busy ? 0 : this.woodcutter();
        if (worker) sim.schedule({ type: 'construct', player: P, units: [worker], target: b, queue: false });
      }
    }

    // Edificios que piden las eras: herrería y mercado en los Burgos; taller de asedio en las Coronas.
    const hx = e.tileX[tc] + 2;
    const hy = e.tileY[tc] + 2;
    if (era >= 1 && mine(BuildingType.Blacksmith).length === 0) this.build(BuildingType.Blacksmith, hx + 8, hy - 6);
    if (era >= 1 && mine(BuildingType.Market).length === 0) this.build(BuildingType.Market, hx - 8, hy - 7);
    if (era >= 2 && mine(BuildingType.SiegeWorkshop).length === 0) this.build(BuildingType.SiegeWorkshop, hx + 9, hy + 6);

    // Mejoras militares.
    const barracks = built(BuildingType.Barracks)[0];
    if (barracks && era >= 1) this.research(barracks, TechType.ManAtArms);
    const smith = built(BuildingType.Blacksmith)[0];
    if (smith) this.research(smith, TechType.Forging);

    // Asedio.
    const workshop = built(BuildingType.SiegeWorkshop)[0];
    const army = sim.unitIds.filter((id) => e.has(id, Comp.Unit | Comp.Position) && e.owner[id] === P && !e.has(id, Comp.Worker) && UNIT_DEFS[e.unitType[id] as UnitType].pop > 0);
    const rams = army.filter((id) => e.unitType[id] === UnitType.Ram);
    const infantry = army.filter((id) => e.unitType[id] !== UnitType.Ram && e.unitType[id] !== UnitType.Scout);
    if (workshop && rams.length < 4 && (e.queue[workshop]?.length ?? 0) < 1) {
      sim.schedule({ type: 'train', player: P, building: workshop, unitType: UnitType.Ram });
    }

    // Ataque: con 3 arietes y 8 soldados, a por la base rival.
    if (!this.attacking && rams.length >= 3 && infantry.length >= 8) this.attacking = true;
    if (!this.attacking || sim.tick % (5 * sim.tickRate) !== 0) return;
    const targets = sim.buildingIds.filter((b) => e.isAlive(b) && e.owner[b] !== P && e.owner[b] !== 0 && !BUILDING_DEFS[e.buildingType[b] as BuildingType].wall);
    const enemyUnits = sim.unitIds.filter((id) => e.has(id, Comp.Unit | Comp.Position) && e.owner[id] !== P && e.owner[id] !== 0 && UNIT_DEFS[e.unitType[id] as UnitType].pop > 0);
    const near = (list: number[], x: number, y: number) =>
      list.slice().sort((a, b) => (e.x[a] - x) ** 2 + (e.y[a] - y) ** 2 - ((e.x[b] - x) ** 2 + (e.y[b] - y) ** 2) || a - b)[0];
    const ex = tileCenterFixed(this.enemyStart.x);
    const ey = tileCenterFixed(this.enemyStart.y);
    const building = near(targets, ex, ey);
    if (building) {
      const idleRams = rams.filter((id) => e.attackTarget[id] !== building);
      if (idleRams.length > 0) sim.schedule({ type: 'attack', player: P, units: idleRams, target: building });
    }
    const goal = building ?? near(enemyUnits, ex, ey);
    if (!goal) return;
    const idle = infantry.filter((id) => e.order[id] === Order.None && e.attackTarget[id] === 0);
    if (idle.length > 0) sim.schedule({ type: 'attackMove', player: P, units: idle, x: e.x[goal], y: e.y[goal] });
  }

  private research(building: number, tech: TechType, urgent = false): void {
    const sim = this.sim;
    if ((sim.entities.queue[building]?.length ?? 0) > (urgent ? 2 : 1)) return;
    if (researchBlocker(sim, this.player, tech) || !sim.players.canAfford(this.player, TECH_DEFS[tech].cost)) return;
    sim.schedule({ type: 'research', player: this.player, building, tech });
  }

  /** Un leñador (o 0): de quien se tira para construir. */
  private woodcutter(): number {
    const e = this.sim.entities;
    return this.sim.unitIds.find((id) => e.has(id, Comp.Worker | Comp.Position) && e.owner[id] === this.player && e.task[id] === Task.Gather && e.homeType[id] === 1) ?? 0;
  }

  private build(type: BuildingType, x: number, y: number): void {
    const sim = this.sim;
    const P = this.player;
    if (!sim.players.canAfford(P, sim.stats.buildingCost(P, type))) return;
    const worker = this.woodcutter();
    if (!worker) return;
    const size = BUILDING_DEFS[type].size;
    for (let r = 0; r <= 20; r++) {
      for (let oy = y - r; oy <= y + r; oy++) {
        for (let ox = x - r; ox <= x + r; ox++) {
          if (Math.max(Math.abs(ox - x), Math.abs(oy - y)) !== r) continue;
          let free = canPlaceBuilding(sim, type, ox, oy);
          for (let ty = oy - 1; ty <= oy + size && free; ty++) for (let tx = ox - 1; tx <= ox + size && free; tx++) free = sim.grid.buildable(tx, ty);
          if (!free) continue;
          sim.schedule({ type: 'build', player: P, units: [worker], buildingType: type, tileX: ox, tileY: oy, queue: false });
          return;
        }
      }
    }
  }
}
