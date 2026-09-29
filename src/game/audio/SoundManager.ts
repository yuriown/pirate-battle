// Web Audio playback of the provided WAV effects. Audio is decorative: every failure is
// swallowed so it can never block loading, the menus or the combat.

const SOUNDS = {
  cannon_fire_1: 0.45, cannon_fire_2: 0.45, cannon_fire_3: 0.45,
  cannon_broadside: 0.55,
  cannonball_water_hit_1: 0.3, cannonball_water_hit_2: 0.3,
  ship_wood_hit_1: 0.5, ship_wood_hit_2: 0.5,
  ship_explosion_1: 0.6, ship_explosion_2: 0.6,
  ship_collision: 0.45, ship_sinking: 0.5,
  score_point: 0.4, health_low: 0.5, time_warning: 0.5,
  game_start: 0.5, game_over: 0.6, game_complete: 0.6, game_pause: 0.5, game_resume: 0.5,
  ui_click: 0.4, ui_open: 0.4, ui_close: 0.4, ui_back: 0.4,
  ocean_ambience_loop: 0.35, ship_sailing_loop: 0.0,
} as const;

export type SoundName = keyof typeof SOUNDS;
type LoopName = 'ocean_ambience_loop' | 'ship_sailing_loop';

const VARIANTS: Partial<Record<string, SoundName[]>> = {
  cannon_fire: ['cannon_fire_1', 'cannon_fire_2', 'cannon_fire_3'],
  water_hit: ['cannonball_water_hit_1', 'cannonball_water_hit_2'],
  wood_hit: ['ship_wood_hit_1', 'ship_wood_hit_2'],
  explosion: ['ship_explosion_1', 'ship_explosion_2'],
};

const MUTE_KEY = 'pb.muted.v1';

class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<SoundName, AudioBuffer>();
  private loading: Promise<void> | null = null;
  private loops = new Map<LoopName, { src: AudioBufferSourceNode; gain: GainNode }>();
  /** Loops requested by the current match; a late-decoded buffer only starts if still wanted. */
  private wantedLoops = new Set<LoopName>();
  private paused = false;
  private variantIndex = 0;
  muted = readMuted();

  /** Must be called from a user gesture (browsers block audio otherwise). */
  unlock(): void {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 1;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
      this.preload();
    } catch {
      this.ctx = null;
    }
  }

  preload(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return Promise.resolve();
    this.loading ??= Promise.all(
      (Object.keys(SOUNDS) as SoundName[]).map(async (name) => {
        try {
          const res = await fetch(`${import.meta.env.BASE_URL}assets/sounds/${name}.wav`);
          if (!res.ok) return;
          this.buffers.set(name, await ctx.decodeAudioData(await res.arrayBuffer()));
        } catch {
          // Missing or undecodable sound: play() becomes a no-op for it.
        }
      }),
    ).then(() => undefined);
    return this.loading;
  }

  play(name: SoundName | keyof typeof VARIANTS, volume = 1): void {
    const variants = VARIANTS[name];
    const resolved = (variants ? variants[this.variantIndex++ % variants.length] : name) as SoundName;
    const ctx = this.ctx;
    const buffer = this.buffers.get(resolved);
    if (!ctx || !this.master || !buffer || ctx.state !== 'running') return;
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = SOUNDS[resolved] * volume;
    src.buffer = buffer;
    src.connect(gain).connect(this.master);
    src.start();
  }

  startLoop(name: LoopName): void {
    const ctx = this.ctx;
    const buffer = this.buffers.get(name);
    if (!ctx || !this.master || this.loops.has(name)) return;
    this.wantedLoops.add(name);
    if (!buffer) {
      // Buffers may still be decoding right after the first gesture. If the match is left before
      // they finish, stopLoops() clears the wish and nothing starts in the menu.
      void this.preload().then(() => {
        if (this.wantedLoops.has(name) && this.buffers.has(name)) this.startLoop(name);
      });
      return;
    }
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = this.paused ? 0 : SOUNDS[name];
    src.buffer = buffer;
    src.loop = true;
    src.connect(gain).connect(this.master);
    src.start();
    this.loops.set(name, { src, gain });
  }

  setLoopVolume(name: LoopName, volume: number): void {
    const loop = this.loops.get(name);
    if (loop && this.ctx && !this.paused) loop.gain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.1);
  }

  stopLoops(): void {
    this.wantedLoops.clear();
    this.paused = false;
    this.loops.forEach(({ src }) => {
      try {
        src.stop();
      } catch {
        // already stopped
      }
      src.disconnect();
    });
    this.loops.clear();
  }

  /**
   * Pause silences the loops (fading, not suspending the context, so the pause/resume cues
   * themselves are still audible). Loop volumes come back on resume.
   */
  setPaused(paused: boolean): void {
    this.paused = paused;
    const ctx = this.ctx;
    if (!ctx) return;
    this.loops.forEach(({ gain }, name) => {
      const target = paused ? 0 : name === 'ship_sailing_loop' ? 0 : SOUNDS[name];
      gain.gain.setTargetAtTime(target, ctx.currentTime, 0.05);
    });
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // ignore
    }
    if (this.master) this.master.gain.value = muted ? 0 : 1;
  }
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export const sound = new SoundManager();
