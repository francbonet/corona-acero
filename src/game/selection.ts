/**
 * Selección del jugador local. Es estado del cliente, no de la simulación:
 * en multijugador cada jugador tiene la suya y no afecta al resultado de la partida.
 */
export class Selection {
  private readonly ids = new Set<number>();

  get size(): number {
    return this.ids.size;
  }

  /** Vista de solo lectura para el render. */
  get set(): ReadonlySet<number> {
    return this.ids;
  }

  has(id: number): boolean {
    return this.ids.has(id);
  }

  /** Ids en orden ascendente. */
  values(): number[] {
    return [...this.ids].sort((a, b) => a - b);
  }

  replace(ids: Iterable<number>): void {
    this.ids.clear();
    this.add(ids);
  }

  add(ids: Iterable<number>): void {
    for (const id of ids) this.ids.add(id);
  }

  toggle(id: number): void {
    if (!this.ids.delete(id)) this.ids.add(id);
  }

  clear(): void {
    this.ids.clear();
  }

  /** Quita las entidades que ya no existen. */
  prune(isAlive: (id: number) => boolean): void {
    for (const id of this.ids) if (!isAlive(id)) this.ids.delete(id);
  }
}
