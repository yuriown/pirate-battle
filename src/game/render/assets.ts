import { ImageSource, Spritesheet, Texture, type SpritesheetData } from 'pixi.js';

export interface GameTextures {
  ships: Record<string, Texture>;
  tiles: Record<string, Texture>;
  ui: Record<string, Texture>;
  /** Standalone water tile with repeat wrapping (atlas sub-textures cannot tile seamlessly). */
  water: Texture;
  /** Layout metadata of the UI atlas (`frames[name].ui.layout`), logical 1x units. */
  uiLayout: Record<string, { fill_rect?: { x: number; y: number; w: number; h: number } }>;
}

export type LoadProgress = (fraction: number) => void;

const BASE = `${import.meta.env.BASE_URL}assets/`;

interface SheetSpec {
  key: keyof Pick<GameTextures, 'ships' | 'tiles' | 'ui'>;
  json: string;
}

function sheetSpecs(retina: boolean): SheetSpec[] {
  const suffix = retina ? '@2x' : '';
  return [
    // The pack's "retina" ship sheet has the same resolution as the default one; see prepare-assets.
    { key: 'ships', json: 'ships.json' },
    { key: 'tiles', json: `tiles${suffix}.json` },
    { key: 'ui', json: `ui${suffix}.json` },
  ];
}

let loaded: GameTextures | null = null;
let inFlight: Promise<GameTextures> | null = null;
let lastProgress = 0;
// Several callers can wait on the same load (e.g. React Strict Mode remounting the screen).
const listeners = new Set<LoadProgress>();
const emit = (f: number) => {
  lastProgress = f;
  listeners.forEach((l) => l(f));
};

/**
 * Loads every texture the combat needs, once per page. Textures are shared by all matches
 * (they are never destroyed between sessions). A failed load is not cached, so the caller
 * can simply call again to retry.
 */
export function loadGameTextures(onProgress?: LoadProgress): Promise<GameTextures> {
  if (loaded) {
    onProgress?.(1);
    return Promise.resolve(loaded);
  }
  if (onProgress) {
    listeners.add(onProgress);
    onProgress(lastProgress);
  }
  if (!inFlight) {
    lastProgress = 0;
    inFlight = doLoad(emit).then(
      (t) => {
        loaded = t;
        inFlight = null;
        return t;
      },
      (err: unknown) => {
        inFlight = null;
        throw err;
      },
    );
  }
  const current = inFlight;
  if (onProgress) {
    const off = () => listeners.delete(onProgress);
    current.then(off, off);
  }
  return current;
}

export function texturesReady(): boolean {
  return loaded !== null;
}

async function doLoad(onProgress?: LoadProgress): Promise<GameTextures> {
  const retina = (globalThis.devicePixelRatio ?? 1) >= 1.5;
  const specs = sheetSpecs(retina);
  const total = specs.length * 2 + 1;
  let done = 0;
  const tick = () => onProgress?.(++done / total);
  onProgress?.(0);

  const sheets = await Promise.all(
    specs.map(async (spec) => {
      const data = await fetchJson<SpritesheetData & { frames: Record<string, { ui?: { layout?: unknown } }> }>(BASE + spec.json);
      tick();
      const scale = Number(data.meta?.scale ?? 1) || 1;
      const texture = await fetchTexture(BASE + String(data.meta.image), scale);
      tick();
      const sheet = new Spritesheet(texture, data);
      await sheet.parse();
      return { spec, sheet, data };
    }),
  );

  const water = await fetchTexture(BASE + (retina ? 'ui/water@2x.png' : 'ui/water.png'), retina ? 2 : 1, 'repeat');
  tick();

  const result: GameTextures = { ships: {}, tiles: {}, ui: {}, uiLayout: {}, water };
  for (const { spec, sheet, data } of sheets) {
    result[spec.key] = sheet.textures as Record<string, Texture>;
    if (spec.key === 'ui') {
      for (const [name, frame] of Object.entries(data.frames)) {
        result.uiLayout[name] = (frame.ui?.layout ?? {}) as GameTextures['uiLayout'][string];
      }
    }
  }
  return result;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load ${url} (HTTP ${res.status})`);
  return (await res.json()) as T;
}

async function fetchTexture(url: string, resolution: number, addressMode: 'clamp-to-edge' | 'repeat' = 'clamp-to-edge'): Promise<Texture> {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load ${url} (HTTP ${res.status})`);
  const bitmap = await createImageBitmap(await res.blob());
  const source = new ImageSource({ resource: bitmap, resolution, scaleMode: 'linear', autoGenerateMipmaps: true, addressMode });
  return new Texture({ source });
}
