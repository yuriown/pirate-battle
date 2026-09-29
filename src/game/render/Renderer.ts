import { Container, Graphics, Rectangle, Sprite, Texture, TilingSprite, type Renderer as PixiRenderer } from 'pixi.js';
import { ARENA, ISLAND_TILES, PROP_TILES, TILE } from '../sim/arena';
import type { Ship, ShipKind, SimEvent } from '../sim/types';
import type { World } from '../sim/World';
import type { GameTextures } from './assets';
import { EffectsLayer } from './effects';

/** Sail colour per ship kind; `ship_N` = colour + 6 × damage stage in the provided pack. */
const SHIP_COLOR: Record<ShipKind, number> = { player: 5, chaser: 3, shooter: 2 };
const shipTextureName = (kind: ShipKind, stage: number) => `ship_${SHIP_COLOR[kind] + 6 * stage}`;

/** 0 = intact, 1 = damaged, 2 = heavily damaged, 3 = wreck. */
export function damageStage(health: number, maxHealth: number): number {
  if (health <= 0) return 3;
  const ratio = health / maxHealth;
  return ratio > 2 / 3 ? 0 : ratio > 1 / 3 ? 1 : 2;
}

interface ShipView {
  root: Container;
  hull: Sprite;
  fire: Sprite;
  bar: Container;
  barFill: Sprite;
  stage: number;
  shownHealth: number;
  flash: number;
  wakeTimer: number;
}

const BAR_SCALE = 0.42;

/**
 * Draws the world with PixiJS. Reads simulation state, never mutates it. Owns every display
 * object it creates and releases them in `destroy()`; shared textures are left to the loader.
 */
export class Renderer {
  readonly root = new Container();
  private readonly ships = new Container();
  private readonly projectiles = new Container();
  private readonly bars = new Container();
  private readonly effects: EffectsLayer;
  private readonly shipViews = new Map<number, ShipView>();
  private readonly ballSprites: Sprite[] = [];
  private readonly fillCache = new Map<string, Texture>();
  private time = 0;

  constructor(
    pixi: PixiRenderer,
    private readonly tex: GameTextures,
  ) {
    const water = new TilingSprite({ texture: tex.water, width: ARENA.width, height: ARENA.height });
    water.tileScale.set(TILE / tex.water.width);

    const islands = new Container();
    for (const t of ISLAND_TILES) islands.addChild(this.tileSprite(t.tile, t.x, t.y));
    const props = new Container();
    for (const t of PROP_TILES) props.addChild(this.tileSprite(t.tile, t.x, t.y));

    const frame = new Graphics().rect(0, 0, ARENA.width, ARENA.height).stroke({ width: 8, color: 0x0b2a3d, alpha: 0.9 });

    this.effects = new EffectsLayer(pixi, tex);
    this.root.addChild(water, this.effects.below, islands, props, this.ships, this.projectiles, this.effects.above, this.bars, frame);
    this.root.label = 'arena';
  }

  /** Scales the fixed-size arena to fit the viewport (letterboxed, aspect preserved). */
  layout(viewW: number, viewH: number): void {
    const scale = Math.min(viewW / ARENA.width, viewH / ARENA.height);
    this.root.scale.set(scale);
    this.root.position.set(Math.round((viewW - ARENA.width * scale) / 2), Math.round((viewH - ARENA.height * scale) / 2));
  }

  handleEvents(events: SimEvent[]): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'shot':
          this.effects.muzzle(ev.x, ev.y, ev.angle, ev.weapon === 'left' || ev.weapon === 'right');
          break;
        case 'hit': {
          this.effects.woodHit(ev.x, ev.y);
          const view = this.shipViews.get(ev.shipId);
          if (view) view.flash = 0.18;
          break;
        }
        case 'projectile-expired':
          if (ev.reason === 'island') this.effects.sandPuff(ev.x, ev.y);
          else if (ev.reason === 'range') this.effects.splash(ev.x, ev.y);
          break;
        case 'destroyed':
          this.effects.explosion(ev.x, ev.y);
          this.effects.wreck(this.tex.ships[shipTextureName(ev.kind, 3)], ev.x, ev.y, ev.rotation);
          this.removeShipView(ev.shipId);
          break;
        case 'bump':
          this.effects.splash(ev.x, ev.y);
          break;
        default:
          break;
      }
    }
  }

  /** Synchronises display objects with the world. `dt` is simulated time consumed this frame. */
  sync(world: World, dt: number): void {
    this.time += dt;
    const alive = new Set<number>();
    const ships: Ship[] = world.player.alive ? [world.player, ...world.enemies] : world.enemies;
    for (const s of ships) {
      if (!s.alive) continue;
      alive.add(s.id);
      this.syncShip(s, dt);
    }
    for (const id of [...this.shipViews.keys()]) if (!alive.has(id)) this.removeShipView(id);

    const balls = world.projectiles;
    while (this.ballSprites.length < balls.length) {
      const s = new Sprite(this.tex.ships.cannon_ball);
      s.anchor.set(0.5);
      this.projectiles.addChild(s);
      this.ballSprites.push(s);
    }
    for (let i = 0; i < this.ballSprites.length; i++) {
      const sprite = this.ballSprites[i];
      const b = balls[i];
      sprite.visible = !!b;
      if (!b) continue;
      sprite.position.set(b.x, b.y);
      sprite.tint = b.owner === 'enemy' ? 0xffc2a8 : 0xffffff;
      sprite.scale.set(b.owner === 'enemy' ? 1.1 : 1.25);
    }

    this.effects.update(dt);
  }

  private syncShip(s: Ship, dt: number): void {
    let view = this.shipViews.get(s.id);
    if (!view) view = this.createShipView(s);
    const stage = damageStage(s.health, s.maxHealth);
    if (stage !== view.stage) {
      view.stage = stage;
      view.hull.texture = this.tex.ships[shipTextureName(s.kind, stage)];
      view.fire.visible = stage >= 1;
      view.fire.scale.set(stage === 2 ? 1 : 0.7);
    }
    view.root.position.set(s.x, s.y);
    // Sprites face +y; simulation heading 0 faces +x.
    view.root.rotation = s.rotation - Math.PI / 2;

    if (view.fire.visible) {
      const frame = Math.floor(this.time * 8) % 2;
      view.fire.texture = this.tex.ships[frame ? 'fire_1' : 'fire_2'];
    }
    view.flash = Math.max(0, view.flash - dt);
    view.hull.tint = view.flash > 0 ? 0xff9a8a : 0xffffff;

    if (view.shownHealth !== s.health) {
      view.shownHealth = s.health;
      view.barFill.texture = this.healthFill(s.kind === 'player' ? 'enemy_health_fill_green' : 'enemy_health_fill_red', s.health / s.maxHealth);
    }
    view.bar.position.set(s.x, s.y - 74);

    view.wakeTimer -= dt;
    if (s.speed > 40 && view.wakeTimer <= 0) {
      view.wakeTimer = 0.09;
      const back = s.halfLength + s.radius * 0.6;
      this.effects.wake(s.x - Math.cos(s.rotation) * back, s.y - Math.sin(s.rotation) * back, s.speed);
    }
  }

  private createShipView(s: Ship): ShipView {
    const root = new Container();
    const hull = new Sprite(this.tex.ships[shipTextureName(s.kind, 0)]);
    hull.anchor.set(0.5);
    const fire = new Sprite(this.tex.ships.fire_1);
    fire.anchor.set(0.5, 0.7);
    fire.position.set(6, -8);
    fire.visible = false;
    root.addChild(hull, fire);
    this.ships.addChild(root);

    const bar = new Container();
    const frame = new Sprite(this.tex.ui.enemy_health_frame);
    const barFill = new Sprite(this.healthFill(s.kind === 'player' ? 'enemy_health_fill_green' : 'enemy_health_fill_red', 1));
    bar.addChild(frame, barFill);
    bar.pivot.set(80, 20);
    bar.scale.set(BAR_SCALE * (s.kind === 'player' ? 1.15 : 1));
    this.bars.addChild(bar);

    const view: ShipView = { root, hull, fire, bar, barFill, stage: 0, shownHealth: s.health, flash: 0, wakeTimer: 0 };
    this.shipViews.set(s.id, view);
    return view;
  }

  private removeShipView(id: number): void {
    const view = this.shipViews.get(id);
    if (!view) return;
    view.root.destroy({ children: true });
    view.bar.destroy({ children: true });
    this.shipViews.delete(id);
  }

  /**
   * Health fill clipped from the left along its `fill_rect` (atlas metadata). Clipped textures
   * are cached per 2% step so bars never allocate per frame.
   */
  private healthFill(name: string, ratio: number): Texture {
    const pct = Math.max(0, Math.min(50, Math.round(ratio * 50)));
    const key = `${name}:${pct}`;
    let t = this.fillCache.get(key);
    if (t) return t;
    const base = this.tex.ui[name];
    const fill = this.tex.uiLayout[name]?.fill_rect ?? { x: 24, y: 12, w: 112, h: 15 };
    const logicalW = pct === 0 ? 0 : fill.x + (fill.w * pct) / 50;
    const f = base.frame;
    const k = f.width / 160;
    t = new Texture({ source: base.source, frame: new Rectangle(f.x, f.y, Math.max(1, logicalW * k), f.height) });
    if (pct === 0) t = Texture.EMPTY;
    this.fillCache.set(key, t);
    return t;
  }

  private tileSprite(tile: number, x: number, y: number): Sprite {
    const s = new Sprite(this.tex.tiles[`tile_${tile}`]);
    s.position.set(x, y);
    s.width = TILE;
    s.height = TILE;
    return s;
  }

  destroy(): void {
    this.shipViews.clear();
    this.effects.destroy();
    this.root.destroy({ children: true });
    this.fillCache.forEach((t) => {
      if (t !== Texture.EMPTY) t.destroy(false);
    });
    this.fillCache.clear();
  }
}
