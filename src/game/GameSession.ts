import { Application, type Ticker } from 'pixi.js';
import { sound } from './audio/SoundManager';
import type { EnemyKind, GameplayConfig } from './config';
import { InputController } from './input/InputController';
import type { GameTextures } from './render/assets';
import { Renderer } from './render/Renderer';
import type { EndReason, SimEvent, WorldSnapshot } from './sim/types';
import { SIM_STEP, World } from './sim/World';
import { createStore, type Store } from '@/lib/store';

export type PauseReason = 'manual' | 'blur' | 'hidden' | 'orientation';

/** Coarse state for React. Values only change when what the player sees changes (not per frame). */
export interface HudState {
  status: 'running' | 'paused' | 'ended';
  pauseReason: PauseReason | null;
  score: number;
  timeRemainingSec: number;
  health: number;
  maxHealth: number;
  endReason: EndReason | null;
  matchIndex: number;
}

export interface MatchOutcome {
  score: number;
  durationMs: number;
  endReason: EndReason;
  config: GameplayConfig;
  seed: number;
}

export interface SessionOptions {
  /** Called at every (re)start: each match takes a snapshot of the configuration in force. */
  getConfig: () => GameplayConfig;
  seed?: number;
  manualClock?: boolean;
  onEnd: (outcome: MatchOutcome) => void;
}

const MAX_STEPS_PER_FRAME = 8;
const MAX_FRAME_SEC = 0.25;

/**
 * Runs one combat screen: owns the Pixi application, the simulation loop, input and audio hooks.
 * One instance per mounted combat screen; `restart()` starts a fresh match in place and
 * `destroy()` releases every listener, the ticker and all display objects.
 */
export class GameSession {
  readonly hud: Store<HudState>;
  readonly input = new InputController();
  world!: World;
  seed = 0;

  private app: Application | null = null;
  private renderer: Renderer | null = null;
  private host: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private accumulator = 0;
  private manualClock: boolean;
  private endNotified = false;
  private destroyed = false;
  private lowHealthWarned = false;
  private timeWarned = false;
  private matchIndex = 0;
  private stats = { frames: 0, frameMsSamples: [] as number[] };

  constructor(
    private readonly textures: GameTextures,
    private readonly options: SessionOptions,
  ) {
    this.manualClock = options.manualClock ?? false;
    this.hud = createStore<HudState>({
      status: 'running', pauseReason: null, score: 0, timeRemainingSec: 0, health: 0, maxHealth: 0, endReason: null, matchIndex: 0,
    });
  }

  async mount(host: HTMLElement): Promise<void> {
    const app = new Application();
    await app.init({
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
      antialias: true,
      autoDensity: true,
      resolution: Math.min(globalThis.devicePixelRatio || 1, 2),
      backgroundColor: 0x0d2233,
      preference: 'webgl',
    });
    if (this.destroyed) {
      app.destroy(true, { children: true });
      return;
    }
    this.app = app;
    this.host = host;
    app.canvas.setAttribute('aria-hidden', 'true');
    app.canvas.dataset.testid = 'arena-canvas';
    host.appendChild(app.canvas);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('visibilitychange', this.handleVisibility);
    this.input.attach(window, () => this.togglePause());

    this.startMatch();
    app.ticker.add(this.tick);
  }

  // ---------------------------------------------------------------- match lifecycle

  restart(): void {
    if (!this.app) return;
    this.renderer?.destroy();
    this.renderer = null;
    this.startMatch();
    if (!this.app.ticker.started) this.app.ticker.start();
  }

  private startMatch(): void {
    const app = this.app;
    if (!app) return;
    this.seed = this.options.seed ?? (crypto.getRandomValues(new Uint32Array(1))[0] >>> 0);
    this.world = new World(this.options.getConfig(), this.seed);
    this.renderer = new Renderer(app.renderer, this.textures);
    app.stage.addChild(this.renderer.root);
    this.resize();
    this.accumulator = 0;
    this.endNotified = false;
    this.lowHealthWarned = false;
    this.timeWarned = false;
    this.matchIndex++;
    this.input.setEnabled(true);
    sound.setSuspended(false);
    sound.play('game_start');
    sound.startLoop('ocean_ambience_loop');
    sound.startLoop('ship_sailing_loop');
    this.publishHud('running', null);
  }

  pause(reason: PauseReason): void {
    const status = this.hud.get().status;
    if (status !== 'running' || !this.app) return;
    this.input.setEnabled(false);
    this.accumulator = 0;
    sound.play('game_pause');
    sound.setSuspended(true);
    this.publishHud('paused', reason);
    // Stop the ticker: nothing advances (timers, cooldowns, effects) and no frames are wasted.
    this.app.ticker.stop();
    this.app.render();
  }

  /** Resuming always requires an explicit player action; inputs held during the pause are discarded. */
  resume(): void {
    if (this.hud.get().status !== 'paused' || !this.app) return;
    this.input.setEnabled(true);
    this.accumulator = 0;
    sound.setSuspended(false);
    sound.play('game_resume');
    this.publishHud('running', null);
    this.app.ticker.start();
  }

  togglePause(): void {
    const status = this.hud.get().status;
    if (status === 'running') this.pause('manual');
    else if (status === 'paused') this.resume();
  }

  // ---------------------------------------------------------------- loop

  private tick = (ticker: Ticker): void => {
    this.stats.frames++;
    if (this.stats.frameMsSamples.length < 20000) this.stats.frameMsSamples.push(ticker.deltaMS);
    if (this.manualClock) {
      this.renderFrame(0);
      return;
    }
    const frameSec = Math.min(ticker.deltaMS / 1000, MAX_FRAME_SEC);
    this.advance(frameSec);
  };

  /** Advances the simulation by `seconds` of game time in fixed steps, then syncs the view. */
  private advance(seconds: number): void {
    const status = this.hud.get().status;
    if (status === 'paused') return;
    let simulated = 0;
    if (status === 'running') {
      this.accumulator += seconds;
      let steps = 0;
      while (this.accumulator >= SIM_STEP && steps < MAX_STEPS_PER_FRAME) {
        this.world.step(SIM_STEP, this.input.sample());
        this.accumulator -= SIM_STEP;
        simulated += SIM_STEP;
        steps++;
        if (this.world.status !== 'running') break;
      }
      // Too far behind (slow device / long frame): drop the backlog instead of spiralling.
      if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;
    } else {
      // Ended: the world is frozen, but let the final explosions finish animating.
      simulated = seconds;
    }
    this.renderFrame(simulated);
  }

  private renderFrame(simulatedSec: number): void {
    const renderer = this.renderer;
    if (!renderer) return;
    const events = this.world.drainEvents();
    if (events.length) {
      renderer.handleEvents(events);
      this.playSounds(events);
    }
    renderer.sync(this.world, simulatedSec);
    sound.setLoopVolume('ship_sailing_loop', this.world.status === 'running' ? (this.world.player.speed / this.world.config.player.maxSpeed) * 0.35 : 0);

    if (this.world.status === 'ended' && !this.endNotified) this.finish();
    else if (this.hud.get().status === 'running') this.publishHud('running', null);
  }

  private finish(): void {
    this.endNotified = true;
    this.input.setEnabled(false);
    const w = this.world;
    this.publishHud('ended', null);
    sound.stopLoops();
    sound.play(w.endReason === 'time_up' ? 'game_complete' : 'game_over');
    this.options.onEnd({
      score: w.score,
      durationMs: Math.round(w.time * 1000),
      endReason: w.endReason ?? 'time_up',
      config: w.config,
      seed: this.seed,
    });
  }

  private publishHud(status: HudState['status'], pauseReason: PauseReason | null): void {
    const w = this.world;
    this.hud.set({
      status,
      pauseReason,
      score: w.score,
      timeRemainingSec: Math.ceil(w.timeRemaining - 1e-9),
      health: Math.ceil(w.player.health),
      maxHealth: w.player.maxHealth,
      endReason: w.endReason,
      matchIndex: this.matchIndex,
    });
  }

  private playSounds(events: SimEvent[]): void {
    let splashes = 0;
    for (const ev of events) {
      switch (ev.type) {
        case 'shot':
          if (ev.weapon === 'front') sound.play('cannon_fire');
          else if (ev.weapon === 'enemy') sound.play('cannon_fire', 0.55);
          else sound.play('cannon_broadside');
          break;
        case 'hit':
          sound.play('wood_hit', ev.shipId === this.world.player.id ? 1 : 0.7);
          break;
        case 'projectile-expired':
          if (ev.reason !== 'bounds' && splashes++ < 2) sound.play('water_hit');
          break;
        case 'destroyed':
          sound.play('explosion');
          if (ev.kind === 'player') sound.play('ship_sinking');
          break;
        case 'score':
          sound.play('score_point');
          break;
        case 'bump':
          sound.play('ship_collision');
          break;
        default:
          break;
      }
    }
    const p = this.world.player;
    if (!this.lowHealthWarned && p.alive && p.health / p.maxHealth <= 0.3) {
      this.lowHealthWarned = true;
      sound.play('health_low');
    }
    if (!this.timeWarned && this.world.timeRemaining <= 10) {
      this.timeWarned = true;
      sound.play('time_warning');
    }
  }

  // ---------------------------------------------------------------- environment

  private handleBlur = (): void => this.pause('blur');

  private handleVisibility = (): void => {
    if (document.visibilityState === 'hidden') this.pause('hidden');
  };

  private resize(): void {
    const app = this.app;
    const host = this.host;
    if (!app || !host) return;
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    app.renderer.resize(w, h);
    this.renderer?.layout(w, h);
    if (!app.ticker.started) app.render();
  }

  // ---------------------------------------------------------------- instrumentation

  /** Test instrumentation: observe state and drive the clock. Rules, input and rendering stay real. */
  createTestApi() {
    return {
      getState: (): WorldSnapshot & { hud: HudState; seed: number; displayObjects: number } => ({
        ...this.world.snapshot(),
        hud: this.hud.get(),
        seed: this.seed,
        displayObjects: countDisplayObjects(this.app?.stage),
      }),
      setManualClock: (manual: boolean) => {
        this.manualClock = manual;
        this.accumulator = 0;
      },
      /** Advances game time in fixed steps (only while running, like the real loop). */
      advance: (ms: number) => {
        let remaining = ms / 1000;
        while (remaining > 1e-9) {
          const chunk = Math.min(remaining, SIM_STEP * MAX_STEPS_PER_FRAME);
          this.advance(chunk + 1e-9);
          remaining -= chunk;
        }
        this.app?.render();
      },
      spawnEnemy: (kind: EnemyKind, x: number, y: number, rotation: number) => this.world.spawnEnemy(kind, x, y, rotation).id,
      frameStats: () => ({ ...this.stats, frameMsSamples: [...this.stats.frameMsSamples] }),
      resetFrameStats: () => {
        this.stats = { frames: 0, frameMsSamples: [] };
      },
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.input.detach();
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    sound.stopLoops();
    sound.setSuspended(false);
    if (this.app) {
      this.app.ticker.remove(this.tick);
      this.renderer?.destroy();
      this.renderer = null;
      this.app.destroy({ removeView: true }, { children: true });
      this.app = null;
    }
    this.host = null;
  }
}

export type GameTestApi = ReturnType<GameSession['createTestApi']>;

function countDisplayObjects(node: { children?: unknown[] } | undefined): number {
  if (!node?.children) return 0;
  let n = node.children.length;
  for (const c of node.children) n += countDisplayObjects(c as { children?: unknown[] });
  return n;
}
