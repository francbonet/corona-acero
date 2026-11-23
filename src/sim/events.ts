/** Sucesos de un tick para el render y el HUD (efectos, avisos). No forman parte del estado de la partida. */
export type SimEvent =
  | {
      readonly kind: 'death';
      /** Entidad que muere (ya no existe cuando se recibe el suceso). */
      readonly id: number;
      readonly x: number;
      readonly y: number;
      readonly owner: number;
      readonly unitType: number;
      readonly building: boolean;
      readonly size: number;
    }
  /** Golpe cuerpo a cuerpo. */
  | { readonly kind: 'hit'; readonly x: number; readonly y: number }
  /** Sale un proyectil (flecha, piedra o bala) desde (x, y). */
  | { readonly kind: 'shoot'; readonly x: number; readonly y: number; readonly projectile: number }
  /** Llega un proyectil a (x, y). */
  | { readonly kind: 'impact'; readonly x: number; readonly y: number; readonly projectile: number }
  /** Sale una unidad de un edificio de `player`. */
  | { readonly kind: 'trained'; readonly player: number; readonly unitType: number; readonly x: number; readonly y: number }
  /** Se termina de construir un edificio de `player`. */
  | { readonly kind: 'built'; readonly player: number; readonly buildingType: number; readonly x: number; readonly y: number }
  /** Una unidad o edificio de `player` ha recibido daño de otro jugador. */
  | { readonly kind: 'attacked'; readonly player: number; readonly x: number; readonly y: number }
  | { readonly kind: 'research'; readonly player: number; readonly tech: number }
  /** Unos aldeanos de `player` no pueden seguir reparando el edificio de (x, y): faltan recursos. */
  | { readonly kind: 'repairBlocked'; readonly player: number; readonly x: number; readonly y: number }
  | { readonly kind: 'convert'; readonly x: number; readonly y: number; readonly from: number; readonly to: number }
  | { readonly kind: 'heal'; readonly x: number; readonly y: number }
  | { readonly kind: 'defeat'; readonly player: number; readonly resigned?: boolean }
  | { readonly kind: 'victory'; readonly player: number; readonly reason: 'conquest' | 'wonder' };
