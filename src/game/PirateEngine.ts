import {
  Application,
  Container,
  Graphics,
  Sprite,
  Ticker,
} from 'pixi.js';
import {
  GameConfig,
  GameSnapshot,
  ShipEntity,
  ProjectileEntity,
  ParticleEntity,
  EndReason,
} from '@/types/game.types';
import { ARENA_CONFIG } from './config';
import { AssetManager } from './AssetManager';
import { Physics } from './Physics';
import { soundService } from '@/services/soundService';

export interface EngineCallbacks {
  onSnapshotUpdate: (snapshot: GameSnapshot) => void;
  onGameOver: (score: number, durationSeconds: number, reason: EndReason) => void;
}

export class PirateEngine {
  public app: Application | null = null;
  private containerElement: HTMLElement;
  private config: GameConfig;
  private callbacks: EngineCallbacks;

  // Scene Graph Containers
  private worldContainer: Container;
  private waterBackground: Graphics;
  private islandContainer: Container;
  private wakeContainer: Container;
  private shipContainer: Container;
  private projectileContainer: Container;
  private effectContainer: Container;
  private hudContainer: Container;

  // Entities & State
  private player!: ShipEntity;
  private enemies: ShipEntity[] = [];
  private projectiles: ProjectileEntity[] = [];
  private particles: ParticleEntity[] = [];

  // Sprites Maps
  private shipSprites = new Map<string, Container>();
  private projectileSprites = new Map<string, Sprite>();
  private particleGraphics: Graphics;

  // Loop & Timer state
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private isGameOver: boolean = false;
  private isDestroyed: boolean = false;
  private score: number = 0;
  private sessionElapsed: number = 0;
  private lastEnemySpawnTime: number = 0;
  private boundTickerUpdate: (ticker: Ticker) => void;

  // Input State
  private input = {
    forward: false,
    turnLeft: false,
    turnRight: false,
  };

  constructor(containerElement: HTMLElement, config: GameConfig, callbacks: EngineCallbacks) {
    this.containerElement = containerElement;
    this.config = { ...config };
    this.callbacks = callbacks;

    this.worldContainer = new Container();
    this.waterBackground = new Graphics();
    this.islandContainer = new Container();
    this.wakeContainer = new Container();
    this.shipContainer = new Container();
    this.projectileContainer = new Container();
    this.effectContainer = new Container();
    this.hudContainer = new Container();
    this.particleGraphics = new Graphics();

    this.boundTickerUpdate = this.update.bind(this);
  }

  public async init(): Promise<void> {
    const app = new Application();

    await app.init({
      resizeTo: this.containerElement,
      backgroundColor: 0x071626,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      antialias: true,
    });

    if (this.isDestroyed) {
      app.destroy(true, { children: true });
      return;
    }

    this.app = app;
    this.containerElement.appendChild(app.canvas);

    AssetManager.init();
    this.buildScene();
    this.handleResize();
    this.resetGame();

    this.app.ticker.add(this.boundTickerUpdate);
    this.isRunning = true;
  }

  public handleResize(): void {
    if (!this.app || !this.containerElement) return;

    const screenW = this.containerElement.clientWidth || window.innerWidth;
    const screenH = this.containerElement.clientHeight || window.innerHeight;

    const scaleX = screenW / ARENA_CONFIG.width;
    const scaleY = screenH / ARENA_CONFIG.height;
    const scale = Math.min(scaleX, scaleY);

    this.worldContainer.scale.set(scale);
    this.worldContainer.x = (screenW - ARENA_CONFIG.width * scale) / 2;
    this.worldContainer.y = (screenH - ARENA_CONFIG.height * scale) / 2;
  }

  private buildScene(): void {
    if (!this.app) return;
    this.app.stage.addChild(this.worldContainer);

    // 1. Deep Ocean Background
    this.renderWaterBackground();
    this.worldContainer.addChild(this.waterBackground);

    // 2. Island Layer
    this.buildIslands();
    this.worldContainer.addChild(this.islandContainer);

    // 3. Wakes, Ships, Projectiles, Effects
    this.worldContainer.addChild(this.wakeContainer);
    this.worldContainer.addChild(this.shipContainer);
    this.worldContainer.addChild(this.projectileContainer);
    this.worldContainer.addChild(this.effectContainer);
    this.effectContainer.addChild(this.particleGraphics);

    // 4. World border outline
    const border = new Graphics();
    border.rect(0, 0, ARENA_CONFIG.width, ARENA_CONFIG.height);
    border.stroke({ width: 6, color: 0x0284c7, alpha: 0.6 });
    this.worldContainer.addChild(border);

    // 5. In-game HUD markers
    this.worldContainer.addChild(this.hudContainer);
  }

  private renderWaterBackground(): void {
    this.waterBackground.clear();
    this.waterBackground.rect(0, 0, ARENA_CONFIG.width, ARENA_CONFIG.height);
    this.waterBackground.fill({ color: 0x0a233f });

    // Subtle wave lines
    for (let y = 30; y < ARENA_CONFIG.height; y += 40) {
      this.waterBackground.moveTo(0, y);
      this.waterBackground.lineTo(ARENA_CONFIG.width, y);
      this.waterBackground.stroke({ width: 1.5, color: 0x38bdf8, alpha: 0.08 });
    }
  }

  private buildIslands(): void {
    this.islandContainer.removeChildren();
    for (const island of ARENA_CONFIG.islands) {
      const sprite = new Sprite(AssetManager.getTexture(island.radius > 90 ? 'island_large' : 'island_sand'));
      sprite.anchor.set(0.5);
      sprite.position.set(island.x, island.y);
      sprite.width = island.radius * 2.2;
      sprite.height = island.radius * 2.2;
      this.islandContainer.addChild(sprite);
    }
  }

  public resetGame(): void {
    this.score = 0;
    this.sessionElapsed = 0;
    this.lastEnemySpawnTime = 0;
    this.isPaused = false;
    this.isGameOver = false;

    // Clear entities
    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    this.shipSprites.forEach(s => s.destroy({ children: true }));
    this.shipSprites.clear();
    this.projectileSprites.forEach(s => s.destroy());
    this.projectileSprites.clear();
    this.wakeContainer.removeChildren();

    // Create Player Ship (Facing UP: -Math.PI / 2)
    this.player = {
      id: 'player',
      type: 'PLAYER',
      x: ARENA_CONFIG.width / 2,
      y: ARENA_CONFIG.height - 180,
      rotation: -Math.PI / 2,
      speed: 0,
      targetSpeed: 0,
      turnDirection: 0,
      health: this.config.playerMaxHealth,
      maxHealth: this.config.playerMaxHealth,
      width: 54,
      height: 80,
      lastFrontShotTime: 0,
      lastBroadsideShotTime: 0,
      isDead: false,
      scoreValue: 0,
    };

    this.createShipDisplay(this.player);
    this.emitSnapshot();
  }

  /**
   * Main Simulation Loop (runs at 60 FPS)
   */
  private update(ticker: Ticker): void {
    if (!this.isRunning || this.isPaused || this.isGameOver) return;

    const dt = Math.min(ticker.deltaTime / 60, 0.1);

    this.sessionElapsed += dt;
    const timeRemaining = Math.max(0, this.config.sessionDuration - this.sessionElapsed);

    if (timeRemaining <= 0) {
      this.endGame('TIME_EXPIRED');
      return;
    }

    this.updatePlayer(dt);
    this.updateSpawner(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateParticles(dt);
    this.syncDisplay();
    this.emitSnapshot();
  }

  private updatePlayer(dt: number): void {
    if (this.player.isDead) return;

    let turn = 0;
    if (this.input.turnLeft) turn -= 1;
    if (this.input.turnRight) turn += 1;
    this.player.rotation += turn * this.config.playerTurnSpeed * dt;

    const maxSpeed = this.config.playerSpeed;
    const accel = 180;
    const drag = 120;

    if (this.input.forward) {
      this.player.speed = Math.min(maxSpeed, this.player.speed + accel * dt);
    } else {
      this.player.speed = Math.max(0, this.player.speed - drag * dt);
    }

    const fwdX = Math.cos(this.player.rotation);
    const fwdY = Math.sin(this.player.rotation);

    let newX = this.player.x + fwdX * this.player.speed * dt;
    let newY = this.player.y + fwdY * this.player.speed * dt;

    const pad = 40;
    newX = Math.max(pad, Math.min(ARENA_CONFIG.width - pad, newX));
    newY = Math.max(pad, Math.min(ARENA_CONFIG.height - pad, newY));

    const resolved = Physics.resolveIslandCollisions(newX, newY, 28, ARENA_CONFIG.islands);
    this.player.x = resolved.x;
    this.player.y = resolved.y;
    if (resolved.collided) {
      this.player.speed *= 0.85;
    }

    if (this.player.speed > 30 && Math.random() < 0.4) {
      this.spawnWake(this.player.x, this.player.y, this.player.rotation);
    }
  }

  private updateSpawner(dt: number): void {
    this.lastEnemySpawnTime += dt;
    if (this.lastEnemySpawnTime >= this.config.enemySpawnInterval) {
      this.lastEnemySpawnTime = 0;
      this.spawnRandomEnemy();
    }
  }

  private spawnRandomEnemy(): void {
    if (this.enemies.length >= 12) return;

    const type = Math.random() < 0.5 ? 'CHASER' : 'SHOOTER';

    let spawnX = 0;
    let spawnY = 0;
    let attempts = 0;
    let valid = false;

    while (attempts < 10 && !valid) {
      attempts++;
      const side = Math.floor(Math.random() * 4);
      if (side === 0) { spawnX = Math.random() * ARENA_CONFIG.width; spawnY = 60; }
      else if (side === 1) { spawnX = ARENA_CONFIG.width - 60; spawnY = Math.random() * ARENA_CONFIG.height; }
      else if (side === 2) { spawnX = Math.random() * ARENA_CONFIG.width; spawnY = ARENA_CONFIG.height - 60; }
      else { spawnX = 60; spawnY = Math.random() * ARENA_CONFIG.height; }

      const distToPlayer = Physics.distance(spawnX, spawnY, this.player.x, this.player.y);
      if (distToPlayer > 350) {
        let insideIsland = false;
        for (const island of ARENA_CONFIG.islands) {
          if (Physics.distance(spawnX, spawnY, island.x, island.y) < island.radius + 50) {
            insideIsland = true;
            break;
          }
        }
        if (!insideIsland) valid = true;
      }
    }

    const enemyId = `enemy_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const enemy: ShipEntity = {
      id: enemyId,
      type,
      x: spawnX,
      y: spawnY,
      rotation: Math.atan2(this.player.y - spawnY, this.player.x - spawnX),
      speed: type === 'CHASER' ? this.config.chaserSpeed : this.config.shooterSpeed,
      targetSpeed: type === 'CHASER' ? this.config.chaserSpeed : this.config.shooterSpeed,
      turnDirection: 0,
      health: type === 'CHASER' ? this.config.chaserHealth : this.config.shooterHealth,
      maxHealth: type === 'CHASER' ? this.config.chaserHealth : this.config.shooterHealth,
      width: type === 'CHASER' ? 44 : 50,
      height: type === 'CHASER' ? 65 : 75,
      lastFrontShotTime: 0,
      lastBroadsideShotTime: 0,
      isDead: false,
      scoreValue: 1,
    };

    this.enemies.push(enemy);
    this.createShipDisplay(enemy);
  }

  private updateEnemies(dt: number): void {
    const now = performance.now();

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (enemy.isDead) continue;

      const distToPlayer = Physics.distance(enemy.x, enemy.y, this.player.x, this.player.y);

      if (enemy.type === 'CHASER') {
        const targetAngle = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
        let angleDiff = Physics.normalizeAngle(targetAngle - enemy.rotation);
        enemy.rotation += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), 2.2 * dt);

        const vx = Math.cos(enemy.rotation) * enemy.speed;
        const vy = Math.sin(enemy.rotation) * enemy.speed;
        let newX = enemy.x + vx * dt;
        let newY = enemy.y + vy * dt;

        const resolved = Physics.resolveIslandCollisions(newX, newY, 22, ARENA_CONFIG.islands);
        enemy.x = resolved.x;
        enemy.y = resolved.y;

        if (distToPlayer < 48) {
          this.player.health = Math.max(0, this.player.health - this.config.chaserDamage);
          soundService.playExplosion();
          this.spawnExplosion(enemy.x, enemy.y, 0xef4444);
          this.removeShip(enemy);
          this.enemies.splice(i, 1);

          if (this.player.health <= 0) {
            this.endGame('SHIP_DESTROYED');
            return;
          }
          continue;
        }
      } else {
        const desiredDistance = this.config.shooterAttackRange;
        const targetAngle = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
        let angleDiff = Physics.normalizeAngle(targetAngle - enemy.rotation);
        enemy.rotation += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), 1.8 * dt);

        let speed = enemy.speed;
        if (distToPlayer < desiredDistance * 0.7) {
          speed = -enemy.speed * 0.4;
        } else if (distToPlayer < desiredDistance) {
          speed = 0;
        }

        const vx = Math.cos(enemy.rotation) * speed;
        const vy = Math.sin(enemy.rotation) * speed;
        let newX = enemy.x + vx * dt;
        let newY = enemy.y + vy * dt;

        const resolved = Physics.resolveIslandCollisions(newX, newY, 25, ARENA_CONFIG.islands);
        enemy.x = resolved.x;
        enemy.y = resolved.y;

        if (distToPlayer <= this.config.shooterAttackRange + 30) {
          if (now - enemy.lastFrontShotTime >= this.config.shooterCooldown) {
            const hasLos = Physics.hasLineOfSight(enemy.x, enemy.y, this.player.x, this.player.y, ARENA_CONFIG.islands);
            if (hasLos) {
              enemy.lastFrontShotTime = now;
              this.fireCannonball(enemy.id, 'SHOOTER', enemy.x, enemy.y, targetAngle, this.config.shooterDamage);
            }
          }
        }
      }
    }
  }

  // ==========================================
  // WEAPONS & COMBAT
  // ==========================================

  public playerFireFront(): void {
    if (this.isPaused || this.isGameOver || this.player.isDead) return;
    const now = performance.now();
    if (now - this.player.lastFrontShotTime < this.config.playerFrontCooldown) return;

    this.player.lastFrontShotTime = now;
    const angle = this.player.rotation; // Straight ahead along ship heading

    const spawnDist = 45;
    const sx = this.player.x + Math.cos(angle) * spawnDist;
    const sy = this.player.y + Math.sin(angle) * spawnDist;

    this.fireCannonball(this.player.id, 'PLAYER', sx, sy, angle, 35);
    soundService.playCannonShot();
    this.spawnMuzzleFlash(sx, sy);
  }

  public playerFireBroadside(side: 'LEFT' | 'RIGHT'): void {
    if (this.isPaused || this.isGameOver || this.player.isDead) return;
    const now = performance.now();
    if (now - this.player.lastBroadsideShotTime < this.config.playerBroadsideCooldown) return;

    this.player.lastBroadsideShotTime = now;
    const baseAngle = this.player.rotation;
    const fireAngle = side === 'LEFT' ? baseAngle - Math.PI / 2 : baseAngle + Math.PI / 2;

    const perpX = Math.cos(fireAngle);
    const perpY = Math.sin(fireAngle);
    const fwdX = Math.cos(baseAngle);
    const fwdY = Math.sin(baseAngle);

    [-18, 0, 18].forEach(offset => {
      const sx = this.player.x + fwdX * offset + perpX * 28;
      const sy = this.player.y + fwdY * offset + perpY * 28;
      this.fireCannonball(this.player.id, 'PLAYER', sx, sy, fireAngle, 30);
      this.spawnMuzzleFlash(sx, sy);
    });

    soundService.playBroadsideSalvo();
  }

  private fireCannonball(
    ownerId: string,
    ownerType: 'PLAYER' | 'SHOOTER',
    x: number,
    y: number,
    angle: number,
    damage: number
  ): void {
    const id = `ball_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const speed = this.config.projectileSpeed;

    const projectile: ProjectileEntity = {
      id,
      ownerId,
      ownerType,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      damage,
      radius: 6,
      createdAt: performance.now(),
      lifetime: this.config.projectileLifetime,
      isDestroyed: false,
    };

    this.projectiles.push(projectile);

    const sprite = new Sprite(AssetManager.getTexture(ownerType === 'PLAYER' ? 'cannonball' : 'cannonball_enemy'));
    sprite.anchor.set(0.5);
    sprite.position.set(x, y);
    this.projectileContainer.addChild(sprite);
    this.projectileSprites.set(id, sprite);
  }

  private updateProjectiles(dt: number): void {
    const now = performance.now();

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const age = (now - p.createdAt) / 1000;
      if (
        age >= p.lifetime ||
        p.x < 0 || p.x > ARENA_CONFIG.width ||
        p.y < 0 || p.y > ARENA_CONFIG.height
      ) {
        this.destroyProjectile(p, i);
        continue;
      }

      let hitIsland = false;
      for (const island of ARENA_CONFIG.islands) {
        if (Physics.distance(p.x, p.y, island.x, island.y) < island.radius + p.radius) {
          hitIsland = true;
          this.spawnHitSparks(p.x, p.y, 0xd97706);
          break;
        }
      }
      if (hitIsland) {
        this.destroyProjectile(p, i);
        continue;
      }

      if (p.ownerType === 'PLAYER') {
        for (let eIdx = this.enemies.length - 1; eIdx >= 0; eIdx--) {
          const enemy = this.enemies[eIdx];
          if (enemy.isDead) continue;

          if (Physics.distance(p.x, p.y, enemy.x, enemy.y) < enemy.width / 2 + p.radius) {
            enemy.health -= p.damage;
            this.spawnHitSparks(p.x, p.y, 0xf59e0b);
            soundService.playWoodImpact();
            this.destroyProjectile(p, i);

            if (enemy.health <= 0) {
              enemy.isDead = true;
              this.score += enemy.scoreValue;
              soundService.playExplosion();
              this.spawnExplosion(enemy.x, enemy.y, 0xf59e0b);
              this.removeShip(enemy);
              this.enemies.splice(eIdx, 1);
            }
            break;
          }
        }
      } else if (p.ownerType === 'SHOOTER') {
        if (!this.player.isDead && Physics.distance(p.x, p.y, this.player.x, this.player.y) < 26 + p.radius) {
          this.player.health = Math.max(0, this.player.health - p.damage);
          this.spawnHitSparks(p.x, p.y, 0xef4444);
          soundService.playWoodImpact();
          this.destroyProjectile(p, i);

          if (this.player.health <= 0) {
            this.endGame('SHIP_DESTROYED');
            return;
          }
        }
      }
    }
  }

  private destroyProjectile(p: ProjectileEntity, idx: number): void {
    p.isDestroyed = true;
    const sprite = this.projectileSprites.get(p.id);
    if (sprite) {
      sprite.destroy();
      this.projectileSprites.delete(p.id);
    }
    this.projectiles.splice(idx, 1);
  }

  // ==========================================
  // PARTICLES & EFFECTS
  // ==========================================

  private spawnMuzzleFlash(x: number, y: number): void {
    for (let i = 0; i < 4; i++) {
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 80,
        vy: (Math.random() - 0.5) * 80,
        size: 3 + Math.random() * 4,
        color: 0xfef08a,
        alpha: 1,
        lifetime: 0,
        maxLifetime: 0.15,
      });
    }
  }

  private spawnHitSparks(x: number, y: number, color: number): void {
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 80;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 2 + Math.random() * 3,
        color,
        alpha: 1,
        lifetime: 0,
        maxLifetime: 0.25,
      });
    }
  }

  private spawnExplosion(x: number, y: number, color: number): void {
    for (let i = 0; i < 24; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 140;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 4 + Math.random() * 8,
        color: Math.random() < 0.5 ? color : 0xf97316,
        alpha: 1,
        lifetime: 0,
        maxLifetime: 0.5 + Math.random() * 0.3,
      });
    }
  }

  private spawnWake(x: number, y: number, rotation: number): void {
    const sternX = x - Math.cos(rotation) * 36;
    const sternY = y - Math.sin(rotation) * 36;

    this.particles.push({
      x: sternX,
      y: sternY,
      vx: (Math.random() - 0.5) * 10,
      vy: (Math.random() - 0.5) * 10,
      size: 4 + Math.random() * 4,
      color: 0x38bdf8,
      alpha: 0.5,
      lifetime: 0,
      maxLifetime: 0.6,
    });
  }

  private updateParticles(dt: number): void {
    this.particleGraphics.clear();

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.lifetime += dt;
      if (p.lifetime >= p.maxLifetime) {
        this.particles.splice(i, 1);
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const progress = p.lifetime / p.maxLifetime;
      const alpha = p.alpha * (1 - progress);

      this.particleGraphics.circle(p.x, p.y, p.size * (1 - progress * 0.4));
      this.particleGraphics.fill({ color: p.color, alpha });
    }
  }

  // ==========================================
  // DISPLAY & SYNC
  // ==========================================

  private createShipDisplay(ship: ShipEntity): void {
    const container = new Container();
    container.position.set(ship.x, ship.y);

    const sprite = new Sprite(AssetManager.getShipTexture(ship.type));
    sprite.anchor.set(0.5);
    container.addChild(sprite);

    const hpBar = new Graphics();
    hpBar.name = 'hpBar';
    container.addChild(hpBar);

    this.shipContainer.addChild(container);
    this.shipSprites.set(ship.id, container);
  }

  private removeShip(ship: ShipEntity): void {
    const container = this.shipSprites.get(ship.id);
    if (container) {
      container.destroy({ children: true });
      this.shipSprites.delete(ship.id);
    }
  }

  private syncDisplay(): void {
    const playerContainer = this.shipSprites.get(this.player.id);
    if (playerContainer) {
      playerContainer.position.set(this.player.x, this.player.y);
      playerContainer.rotation = this.player.rotation + Math.PI / 2;
      this.renderHpBar(playerContainer, this.player.health, this.player.maxHealth, 0x22c55e);
    }

    for (const enemy of this.enemies) {
      const container = this.shipSprites.get(enemy.id);
      if (container) {
        container.position.set(enemy.x, enemy.y);
        container.rotation = enemy.rotation + Math.PI / 2;
        this.renderHpBar(container, enemy.health, enemy.maxHealth, enemy.type === 'CHASER' ? 0xef4444 : 0x38bdf8);
      }
    }

    for (const p of this.projectiles) {
      const sprite = this.projectileSprites.get(p.id);
      if (sprite) {
        sprite.position.set(p.x, p.y);
      }
    }
  }

  private renderHpBar(container: Container, hp: number, maxHp: number, fillColor: number): void {
    const hpBar = container.getChildByName('hpBar') as Graphics;
    if (!hpBar) return;

    hpBar.clear();
    const width = 42;
    const height = 5;
    const y = -48;
    const pct = Math.max(0, Math.min(1, hp / maxHp));

    hpBar.rect(-width / 2, y, width, height);
    hpBar.fill({ color: 0x0f172a, alpha: 0.8 });

    hpBar.rect(-width / 2, y, width * pct, height);
    hpBar.fill({ color: fillColor });

    hpBar.rect(-width / 2, y, width, height);
    hpBar.stroke({ width: 1, color: 0x000000, alpha: 0.5 });
  }

  // ==========================================
  // INPUT & CONTROLS
  // ==========================================

  public setInput(forward: boolean, turnLeft: boolean, turnRight: boolean): void {
    this.input.forward = forward;
    this.input.turnLeft = turnLeft;
    this.input.turnRight = turnRight;
  }

  public setPaused(paused: boolean): void {
    this.isPaused = paused;
    this.emitSnapshot();
  }

  public togglePause(): boolean {
    this.setPaused(!this.isPaused);
    return this.isPaused;
  }

  public endGame(reason: EndReason): void {
    if (this.isGameOver) return;
    this.isGameOver = true;
    this.isRunning = false;

    if (reason === 'TIME_EXPIRED' && this.score > 0) {
      soundService.playVictory();
    } else {
      soundService.playExplosion();
    }

    this.callbacks.onGameOver(this.score, Math.floor(this.sessionElapsed), reason);
    this.emitSnapshot();
  }

  private emitSnapshot(): void {
    const timeRemaining = Math.max(0, this.config.sessionDuration - this.sessionElapsed);
    const snapshot: GameSnapshot = {
      score: this.score,
      timeRemaining,
      sessionDuration: this.config.sessionDuration,
      playerHealth: this.player ? this.player.health : 0,
      playerMaxHealth: this.config.playerMaxHealth,
      isPaused: this.isPaused,
      isGameOver: this.isGameOver,
      endReason: this.isGameOver ? (this.player.health <= 0 ? 'SHIP_DESTROYED' : 'TIME_EXPIRED') : null,
      chaserCount: this.enemies.filter(e => e.type === 'CHASER').length,
      shooterCount: this.enemies.filter(e => e.type === 'SHOOTER').length,
    };
    this.callbacks.onSnapshotUpdate(snapshot);
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.isRunning = false;
    if (this.app) {
      this.app.ticker.remove(this.boundTickerUpdate);
      this.app.destroy(true, { children: true });
      this.app = null;
    }
  }
}
