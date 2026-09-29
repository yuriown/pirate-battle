import { Container, Graphics, Sprite, type Renderer as PixiRenderer, type Texture } from 'pixi.js';
import type { GameTextures } from './assets';

interface Particle {
  sprite: Sprite;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  spin: number;
  scaleFrom: number;
  scaleTo: number;
  alphaFrom: number;
  alphaTo: number;
  frames?: Texture[];
}

const MAX_PARTICLES = 500;

/**
 * Short-lived visual feedback (muzzle flashes, explosions, splashes, wakes, wrecks) with a sprite
 * pool. Advanced with simulated time, so effects freeze while the game is paused.
 */
export class EffectsLayer {
  readonly below = new Container();
  readonly above = new Container();
  private readonly live: Particle[] = [];
  private readonly pool: Sprite[] = [];
  private readonly ring: Texture;
  private readonly puff: Texture;
  private readonly explosionFrames: Texture[];

  constructor(pixi: PixiRenderer, private readonly tex: GameTextures) {
    // Two procedural textures generated once per session (and destroyed with it).
    this.ring = pixi.generateTexture(new Graphics().circle(32, 32, 26).stroke({ width: 5, color: 0xffffff }));
    this.puff = pixi.generateTexture(new Graphics().circle(32, 32, 30).fill({ color: 0xffffff }));
    this.explosionFrames = [tex.ships.explosion_3, tex.ships.explosion_2, tex.ships.explosion_1];
  }

  muzzle(x: number, y: number, angle: number, broadside: boolean): void {
    this.emit(this.above, this.tex.ships.explosion_3, x, y, { life: 0.14, scaleFrom: broadside ? 0.5 : 0.4, scaleTo: 0.15, rotation: angle });
    for (let i = 0; i < (broadside ? 3 : 2); i++) {
      this.emit(this.above, this.puff, x, y, {
        life: 0.6, scaleFrom: 0.25, scaleTo: 0.7, alphaFrom: 0.55, tint: 0xd8d8d8,
        vx: Math.cos(angle) * 40 + (i - 1) * 12, vy: Math.sin(angle) * 40 + (i - 1) * 12,
      });
    }
  }

  woodHit(x: number, y: number): void {
    this.emit(this.above, this.tex.ships.explosion_3, x, y, { life: 0.18, scaleFrom: 0.45, scaleTo: 0.2 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + x * 0.01;
      this.emit(this.above, this.tex.ships[`wood_${(i % 4) + 1}`], x, y, {
        life: 0.55, scaleFrom: 0.8, scaleTo: 0.5, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, spin: 6,
      });
    }
  }

  explosion(x: number, y: number): void {
    this.emit(this.above, this.explosionFrames[0], x, y, { life: 0.5, scaleFrom: 1.1, scaleTo: 1.6, alphaTo: 0, frames: this.explosionFrames });
    this.emit(this.above, this.puff, x, y, { life: 1.1, scaleFrom: 0.8, scaleTo: 2.2, alphaFrom: 0.5, tint: 0x555555 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.emit(this.above, this.tex.ships[`wood_${(i % 4) + 1}`], x, y, {
        life: 0.9, scaleFrom: 1, scaleTo: 0.6, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, spin: 8,
      });
    }
  }

  wreck(texture: Texture, x: number, y: number, rotation: number): void {
    this.emit(this.below, texture, x, y, { life: 1.6, scaleFrom: 1, scaleTo: 0.8, alphaFrom: 1, alphaTo: 0, rotation: rotation - Math.PI / 2 });
  }

  splash(x: number, y: number): void {
    this.emit(this.below, this.ring, x, y, { life: 0.45, scaleFrom: 0.15, scaleTo: 0.6, alphaFrom: 0.8 });
  }

  sandPuff(x: number, y: number): void {
    this.emit(this.above, this.puff, x, y, { life: 0.4, scaleFrom: 0.2, scaleTo: 0.55, alphaFrom: 0.7, tint: 0xe8c98f });
  }

  wake(x: number, y: number, speed: number): void {
    this.emit(this.below, this.puff, x, y, { life: 0.9, scaleFrom: 0.18, scaleTo: 0.5 + speed / 600, alphaFrom: 0.35 });
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life += dt;
      const t = p.life / p.maxLife;
      if (t >= 1) {
        this.release(p.sprite);
        this.live[i] = this.live[this.live.length - 1];
        this.live.pop();
        continue;
      }
      const s = p.sprite;
      s.x += p.vx * dt;
      s.y += p.vy * dt;
      s.rotation += p.spin * dt;
      s.scale.set(p.scaleFrom + (p.scaleTo - p.scaleFrom) * t);
      s.alpha = p.alphaFrom + (p.alphaTo - p.alphaFrom) * t;
      if (p.frames) s.texture = p.frames[Math.min(p.frames.length - 1, Math.floor(t * p.frames.length))];
    }
  }

  get count(): number {
    return this.live.length;
  }

  private emit(
    layer: Container,
    texture: Texture,
    x: number,
    y: number,
    o: { life: number; scaleFrom: number; scaleTo: number; alphaFrom?: number; alphaTo?: number; vx?: number; vy?: number; spin?: number; rotation?: number; tint?: number; frames?: Texture[] },
  ): void {
    if (this.live.length >= MAX_PARTICLES) return;
    const sprite = this.pool.pop() ?? new Sprite();
    sprite.texture = texture;
    sprite.anchor.set(0.5);
    sprite.position.set(x, y);
    sprite.rotation = o.rotation ?? 0;
    sprite.tint = o.tint ?? 0xffffff;
    sprite.scale.set(o.scaleFrom);
    sprite.alpha = o.alphaFrom ?? 1;
    sprite.visible = true;
    layer.addChild(sprite);
    this.live.push({
      sprite,
      life: 0,
      maxLife: o.life,
      vx: o.vx ?? 0,
      vy: o.vy ?? 0,
      spin: o.spin ?? 0,
      scaleFrom: o.scaleFrom,
      scaleTo: o.scaleTo,
      alphaFrom: o.alphaFrom ?? 1,
      alphaTo: o.alphaTo ?? 0,
      frames: o.frames,
    });
  }

  private release(sprite: Sprite): void {
    sprite.removeFromParent();
    sprite.visible = false;
    this.pool.push(sprite);
  }

  destroy(): void {
    for (const p of this.live) p.sprite.destroy();
    for (const s of this.pool) s.destroy();
    this.live.length = 0;
    this.pool.length = 0;
    this.below.destroy({ children: true });
    this.above.destroy({ children: true });
    this.ring.destroy(true);
    this.puff.destroy(true);
  }
}
