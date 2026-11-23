import type { UnitType } from '../data/units';
import type { IconRef } from '../game/client';
import { BuildingType } from '../data/buildings';
import { TECH_DEFS, type TechIcon, type TechType } from '../data/techs';
import { UnitType as UT } from '../data/units';
import { ACTION_ICONS, NUMERALS, TECH_GLYPHS, type TechGlyph, UPGRADE_ARROW } from './action-icons';
import type { BuildingArt } from '../render/building-art';
import { type CardImage, glyphCard } from '../render/icon-card';
import { NODE_COLORS } from '../render/node-sprites';
import { type ResourceIconKind, renderResourceIcon } from '../render/nature-art';
import { TEAM_COLORS } from '../render/palette';
import { createCanvas, drawTextSprite, px } from '../render/pixel-canvas';
import type { UnitArt } from '../render/unit-art';
import type { Faction } from '../data/factions';
import { shieldUrl } from './heraldry-icons';

const RESOURCE_KEYS: readonly ResourceIconKind[] = ['food', 'wood', 'stone', 'gold'];

/** Iconos del HUD como data URLs, generados una vez a partir del arte provisional. */
export class Icons {
  private readonly cache = new Map<string, string>();

  constructor(
    private readonly units: UnitArt,
    private readonly buildings: BuildingArt,
    private readonly eraOf: (player: number) => number,
  ) {}

  /** Icono de recurso por índice (0 comida, 1 madera, 2 piedra, 3 oro) o 'pop'. */
  resource(r: number | 'pop', player = 1): string {
    const key = typeof r === 'number' ? RESOURCE_KEYS[r] : r;
    return this.memo(`res:${key}:${key === 'pop' ? player : 0}`, () => {
      const img = renderResourceIcon(key, team(player));
      const { canvas, ctx } = createCanvas(img.width, img.height);
      ctx.putImageData(new ImageData(img.rgba, img.width, img.height), 0, 0);
      return canvas.toDataURL();
    });
  }

  /** Escudo de una corona. */
  shield(faction: Faction): string {
    return shieldUrl(faction);
  }

  unit(type: UnitType, player: number): string {
    return this.units.icon(type, Math.min(player, TEAM_COLORS.length - 1));
  }

  building(type: BuildingType, player: number): string {
    return this.buildings.icon(type, Math.min(player, TEAM_COLORS.length - 1), this.eraOf(player));
  }

  of(ref: IconRef, player: number): string {
    switch (ref.kind) {
      case 'unit':
        return this.unit(ref.type, player);
      case 'building':
        return this.building(ref.type, player);
      case 'tech':
        return this.tech(ref.tech, player);
      case 'market':
        return this.memo(`market:${ref.resource}`, () => {
          const img = renderResourceIcon(RESOURCE_KEYS[ref.resource]);
          return canvasOf(glyphCard({ width: img.width, height: img.height, rgba: img.rgba })).toDataURL();
        });
      case 'page':
        return this.building(ref.page === 1 ? BuildingType.House : BuildingType.Barracks, player);
      case 'action': {
        if (ref.action === 'stop') return this.memo('stop', stopIcon);
        const rows = ACTION_ICONS[ref.action];
        return this.memo(`act:${ref.action}:${player}`, () => glyphUrl(rows, NODE_COLORS, team(player)));
      }
    }
  }

  /**
   * Icono de una tecnología: un glifo de su tipo (espada, escudo, gavilla, hacha, pico…) con el numeral de su
   * nivel si hay varias del mismo tipo, o la unidad que mejora con una flecha dorada (para no confundirla con
   * el botón de entrenarla).
   */
  tech(tech: TechType, player: number): string {
    return this.memo(`tech:${tech}:${player}`, () => {
      const icon = TECH_DEFS[tech].icon;
      let base: HTMLCanvasElement;
      let mark: 'arrow' | number = 0;
      if ('unit' in icon) {
        base = this.units.iconCanvas(icon.unit, Math.min(player, TEAM_COLORS.length - 1));
        mark = 'arrow';
      } else if (icon.glyph === 'villager' || icon.glyph === 'monk' || icon.glyph === 'powder') {
        const unit = icon.glyph === 'villager' ? UT.Villager : icon.glyph === 'monk' ? UT.Monk : UT.Bombard;
        base = this.units.iconCanvas(unit, Math.min(player, TEAM_COLORS.length - 1));
      } else {
        const rows = TECH_GLYPHS[icon.glyph as TechGlyph];
        const glyph = createCanvas(rows[0].length, rows.length).canvas;
        drawTextSprite(glyph.getContext('2d') as CanvasRenderingContext2D, rows, 0, 0, NODE_COLORS, team(player));
        base = canvasOf(glyphCard(imageOf(glyph)));
      }
      if (mark === 0) mark = levelOf(tech);
      return withMark(base, mark).toDataURL();
    });
  }

  private memo(key: string, make: () => string): string {
    let url = this.cache.get(key);
    if (!url) {
      url = make();
      this.cache.set(key, url);
    }
    return url;
  }
}

/** Lienzo de una imagen RGBA. */
function canvasOf(img: CardImage): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(img.width, img.height);
  ctx.putImageData(new ImageData(new Uint8ClampedArray(img.rgba), img.width, img.height), 0, 0);
  return canvas;
}

/** Píxeles de un lienzo. */
function imageOf(canvas: HTMLCanvasElement): CardImage {
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  return { width: canvas.width, height: canvas.height, rgba: new Uint8ClampedArray(data) };
}

/** Un sprite de texto (glifo de 16×16) en su tarjeta oscura, a doble tamaño. */
function glyphUrl(rows: readonly string[], palette: Readonly<Record<string, string>>, teamColors?: readonly [string, string, string]): string {
  const { canvas, ctx } = createCanvas(rows[0].length, rows.length);
  drawTextSprite(ctx, rows, 0, 0, palette, teamColors);
  return canvasOf(glyphCard(imageOf(canvas))).toDataURL();
}

function team(player: number): readonly [string, string, string] {
  return TEAM_COLORS[Math.min(player, TEAM_COLORS.length - 1)];
}

/** Señal de "detener": escudo rojo con una barra, en su tarjeta oscura. */
function stopIcon(): string {
  const { canvas, ctx } = createCanvas(16, 16);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
      if (d > 7) continue;
      let color = d > 6 ? '#5c1a14' : '#c0392b';
      if (y >= 7 && y <= 8 && x >= 4 && x <= 11) color = '#ece6d6';
      px(ctx, x, y, color);
    }
  }
  return canvasOf(glyphCard(imageOf(canvas))).toDataURL();
}

/** Clave del tipo de icono de una tecnología (las del mismo tipo se numeran por orden). */
function iconKey(icon: TechIcon): string {
  return 'unit' in icon ? `u${icon.unit}` : icon.glyph;
}

/** Nivel (1–4) de una tecnología entre las de su mismo icono, o 0 si es la única. Las eras van de la II a la IV. */
function levelOf(tech: TechType): number {
  const def = TECH_DEFS[tech];
  if ('glyph' in def.icon && def.icon.glyph === 'era') return Math.min(4, (def.advance ?? 0) + 1);
  const key = iconKey(def.icon);
  const same = (Object.keys(TECH_DEFS) as unknown as TechType[]).map(Number).filter((t) => iconKey(TECH_DEFS[t as TechType].icon) === key);
  if (same.length < 2) return 0;
  return Math.min(4, same.indexOf(Number(tech)) + 1);
}

/**
 * Añade al icono el numeral del nivel (abajo a la derecha) o la flecha de mejora (arriba a la derecha), en oro
 * con contorno; a doble tamaño en las tarjetas grandes, para que se lean.
 */
function withMark(base: HTMLCanvasElement, mark: 'arrow' | number): HTMLCanvasElement {
  if (!mark) return base;
  const rows = mark === 'arrow' ? UPGRADE_ARROW : NUMERALS[mark - 1];
  const k = base.width >= 40 ? 2 : 1;
  const mw = rows[0].length;
  const mh = rows.length;
  const w = Math.max(base.width, (mw + 2) * k);
  const h = Math.max(base.height, (mh + 2) * k);
  const { canvas, ctx } = createCanvas(w, h);
  ctx.drawImage(base, Math.floor((w - base.width) / 2), h - base.height);
  const ox = w - (mw + 2) * k;
  const oy = mark === 'arrow' ? 0 : h - (mh + 2) * k;
  const on = (x: number, y: number) => y >= 0 && y < mh && x >= 0 && x < mw && rows[y][x] !== '.';
  const dot = (x: number, y: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(ox + (x + 1) * k, oy + (y + 1) * k, k, k);
  };
  for (let y = -1; y <= mh; y++) {
    for (let x = -1; x <= mw; x++) {
      if (on(x, y)) dot(x, y, y === mh - 1 ? '#c8962a' : '#f2dc6a');
      else if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1) || on(x - 1, y - 1) || on(x + 1, y + 1) || on(x - 1, y + 1) || on(x + 1, y - 1)) dot(x, y, '#1a120c');
    }
  }
  return canvas;
}
