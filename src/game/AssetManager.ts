import { Texture, CanvasSource } from 'pixi.js';
import { ShipType } from '@/types/game.types';

export class AssetManager {
  private static textureCache = new Map<string, Texture>();

  /**
   * Pre-generates all high-resolution vector canvas textures
   */
  static init(): void {
    if (this.textureCache.size > 0) return;

    this.textureCache.set('ship_player', this.createPlayerShipTexture());
    this.textureCache.set('ship_chaser', this.createChaserShipTexture());
    this.textureCache.set('ship_shooter', this.createShooterShipTexture());
    this.textureCache.set('cannonball', this.createCannonballTexture());
    this.textureCache.set('cannonball_enemy', this.createEnemyCannonballTexture());
    this.textureCache.set('water_tile', this.createWaterTileTexture());
    this.textureCache.set('island_sand', this.createIslandTexture(140, '#d97706', '#15803d'));
    this.textureCache.set('island_large', this.createIslandTexture(200, '#b45309', '#166534'));
  }

  static getTexture(name: string): Texture {
    const tex = this.textureCache.get(name);
    if (!tex) {
      console.warn(`Texture '${name}' not found, generating fallback`);
      return Texture.WHITE;
    }
    return tex;
  }

  static getShipTexture(type: ShipType): Texture {
    switch (type) {
      case 'PLAYER': return this.getTexture('ship_player');
      case 'CHASER': return this.getTexture('ship_chaser');
      case 'SHOOTER': return this.getTexture('ship_shooter');
      default: return Texture.WHITE;
    }
  }

  /**
   * Player Galleon (Detailed dark oak wood, golden cannons, white sails with black skull)
   */
  private static createPlayerShipTexture(): Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 144;
    const ctx = canvas.getContext('2d')!;

    ctx.save();
    ctx.translate(48, 72);

    // Ship Hull (Top-down Galleon)
    ctx.fillStyle = '#451a03'; // Dark oak wood
    ctx.strokeStyle = '#f59e0b'; // Golden trim
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    ctx.moveTo(0, -60); // Prow (bow)
    ctx.bezierCurveTo(24, -40, 26, 30, 18, 55); // Starboard
    ctx.lineTo(-18, 55); // Stern
    ctx.bezierCurveTo(-26, 30, -24, -40, 0, -60); // Port
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Wooden deck planks
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 1;
    for (let y = -40; y <= 40; y += 12) {
      ctx.beginPath();
      ctx.moveTo(-16, y);
      ctx.lineTo(16, y);
      ctx.stroke();
    }

    // Side Cannon Ports (3 on left, 3 on right)
    ctx.fillStyle = '#1e293b';
    [-20, 0, 20].forEach(y => {
      // Left ports
      ctx.fillRect(-24, y - 2, 4, 4);
      // Right ports
      ctx.fillRect(20, y - 2, 4, 4);
    });

    // Front Bow Cannon
    ctx.fillStyle = '#d97706';
    ctx.fillRect(-3, -58, 6, 8);

    // Main Mast & White Sails
    ctx.fillStyle = '#f8fafc'; // Crisp sail cloth
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;

    // Fore-sail
    ctx.beginPath();
    ctx.ellipse(0, -24, 20, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Main-sail
    ctx.beginPath();
    ctx.ellipse(0, 8, 24, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Skull and crossbones emblem on mainsail
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(0, 8, 4, 0, Math.PI * 2); // skull head
    ctx.fill();
    ctx.fillRect(-1.5, 11, 3, 2); // jaw

    ctx.restore();
    return Texture.from(new CanvasSource({ resource: canvas }));
  }

  /**
   * Chaser Sloop (Aggressive red pirate raider with prow ram)
   */
  private static createChaserShipTexture(): Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 80;
    canvas.height = 110;
    const ctx = canvas.getContext('2d')!;

    ctx.save();
    ctx.translate(40, 55);

    // Hull (Pointy & fast)
    ctx.fillStyle = '#7f1d1d'; // Crimson dark wood
    ctx.strokeStyle = '#ef4444'; // Red glowing borders
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    ctx.moveTo(0, -50); // Sharp ram
    ctx.lineTo(18, -15);
    ctx.lineTo(14, 42);
    ctx.lineTo(-14, 42);
    ctx.lineTo(-18, -15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Iron Ram on Bow
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.moveTo(0, -52);
    ctx.lineTo(6, -38);
    ctx.lineTo(-6, -38);
    ctx.closePath();
    ctx.fill();

    // Red Ragged Sails
    ctx.fillStyle = '#dc2626';
    ctx.strokeStyle = '#991b1b';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.ellipse(0, -4, 18, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
    return Texture.from(new CanvasSource({ resource: canvas }));
  }

  /**
   * Shooter Frigate (Heavy royal blue warship with long-range cannons)
   */
  private static createShooterShipTexture(): Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 90;
    canvas.height = 130;
    const ctx = canvas.getContext('2d')!;

    ctx.save();
    ctx.translate(45, 65);

    // Hull
    ctx.fillStyle = '#0f172a'; // Navy hull
    ctx.strokeStyle = '#38bdf8'; // Cyan trim
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    ctx.moveTo(0, -55);
    ctx.bezierCurveTo(20, -35, 22, 25, 16, 48);
    ctx.lineTo(-16, 48);
    ctx.bezierCurveTo(-22, 25, -20, -35, 0, -55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Blue Sails
    ctx.fillStyle = '#0284c7';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.ellipse(0, -18, 18, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(0, 12, 22, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
    return Texture.from(new CanvasSource({ resource: canvas }));
  }

  /**
   * Cannonball Textures
   */
  private static createCannonballTexture(): Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 24;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createRadialGradient(10, 10, 2, 12, 12, 10);
    grad.addColorStop(0, '#fef08a');
    grad.addColorStop(0.3, '#f59e0b');
    grad.addColorStop(0.8, '#1e293b');
    grad.addColorStop(1, '#020617');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(12, 12, 9, 0, Math.PI * 2);
    ctx.fill();

    return Texture.from(new CanvasSource({ resource: canvas }));
  }

  private static createEnemyCannonballTexture(): Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 24;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createRadialGradient(10, 10, 2, 12, 12, 10);
    grad.addColorStop(0, '#fecdd3');
    grad.addColorStop(0.4, '#ef4444');
    grad.addColorStop(0.9, '#450a0a');
    grad.addColorStop(1, '#020617');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(12, 12, 9, 0, Math.PI * 2);
    ctx.fill();

    return Texture.from(new CanvasSource({ resource: canvas }));
  }

  /**
   * Animated Seamless Water Tile
   */
  private static createWaterTileTexture(): Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Deep ocean gradient
    ctx.fillStyle = '#0a233f';
    ctx.fillRect(0, 0, 256, 256);

    // Wave ripples
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.lineWidth = 2;
    for (let y = 16; y < 256; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(64, y - 8, 128, y + 8, 192, y - 8);
      ctx.lineTo(256, y);
      ctx.stroke();
    }

    return Texture.from(new CanvasSource({ resource: canvas }));
  }

  /**
   * Tropical Island texture generator
   */
  private static createIslandTexture(size: number, sandColor: string, jungleColor: string): Texture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const center = size / 2;
    const radius = center - 8;

    // Shallow Reef glow
    ctx.fillStyle = 'rgba(6, 182, 212, 0.3)';
    ctx.beginPath();
    ctx.arc(center, center, radius + 6, 0, Math.PI * 2);
    ctx.fill();

    // Sand Beach
    ctx.fillStyle = sandColor;
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fill();

    // Inner Jungle
    ctx.fillStyle = jungleColor;
    ctx.beginPath();
    ctx.arc(center, center, radius * 0.7, 0, Math.PI * 2);
    ctx.fill();

    // Palm trees dots
    ctx.fillStyle = '#14532d';
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const px = center + Math.cos(angle) * (radius * 0.45);
      const py = center + Math.sin(angle) * (radius * 0.45);
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    return Texture.from(new CanvasSource({ resource: canvas }));
  }
}
