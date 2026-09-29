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
    if (!buffer) {
      // Buffers may still be decoding right after the first gesture.
      void this.preload().then(() => this.loops.has(name) || this.startLoop(name));
      return;
    }
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = SOUNDS[name];
    src.buffer = buffer;
    src.loop = true;
    src.connect(gain).connect(this.master);
    src.start();
    this.loops.set(name, { src, gain });
  }

  setLoopVolume(name: LoopName, volume: number): void {
    const loop = this.loops.get(name);
    if (loop && this.ctx) loop.gain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.1);
  }

  stopLoops(): void {
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

  /** Suspends/resumes every sound (used by pause so loops freeze with the simulation). */
  setSuspended(suspended: boolean): void {
    if (!this.ctx) return;
    void (suspended ? this.ctx.suspend() : this.ctx.resume()).catch(() => undefined);
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
