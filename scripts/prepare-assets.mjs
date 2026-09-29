// Copies the runtime subset of the provided `assets/` pack into `public/assets/`
// and converts the Starling XML / raw tile sheets into Pixi-compatible JSON atlases.
// The provided pack stays untouched; `public/assets/` is generated (git-ignored).
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'assets');
const out = join(root, 'public', 'assets');

if (!existsSync(src)) {
  console.error('[prepare-assets] missing ./assets folder');
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const copy = (from, to) => cpSync(join(src, from), join(out, to), { recursive: true });

/** Starling/Sparrow XML -> TexturePacker "hash" JSON understood by Pixi's Spritesheet parser. */
function xmlToAtlas(xmlFile, imageName, scale) {
  const xml = readFileSync(join(src, xmlFile), 'utf8');
  const frames = {};
  const re = /<SubTexture\s+name="([^"]+)"\s+x="(\d+)"\s+y="(\d+)"\s+width="(\d+)"\s+height="(\d+)"/g;
  for (const m of xml.matchAll(re)) {
    const [, name, x, y, w, h] = m;
    const key = name.replace(/\.png$/, '');
    frames[key] = {
      frame: { x: +x, y: +y, w: +w, h: +h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: +w, h: +h },
      sourceSize: { w: +w, h: +h },
    };
  }
  return { frames, meta: { image: imageName, format: 'RGBA8888', scale: String(scale) } };
}

/** Uniform grid sheet -> atlas with tile_1..tile_N in row-major order (matches png/default/tiles). */
function gridAtlas(imageName, cols, rows, cell, scale) {
  const frames = {};
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const n = r * cols + c + 1;
      frames[`tile_${n}`] = {
        frame: { x: c * cell, y: r * cell, w: cell, h: cell },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: cell, h: cell },
        sourceSize: { w: cell, h: cell },
      };
    }
  }
  return { frames, meta: { image: imageName, format: 'RGBA8888', scale: String(scale) } };
}

const writeJson = (name, data) => writeFileSync(join(out, name), JSON.stringify(data));

// Ships & effects. NOTE: the "_retina" ship sheet in the pack is byte-for-byte the same
// resolution as the default one (1024x512, identical coordinates), so only one is shipped.
copy('spritesheet/ships_miscellaneous_sheet.png', 'ships.png');
writeJson('ships.json', xmlToAtlas('spritesheet/ships_miscellaneous_sheet.xml', 'ships.png', 1));

// Tiles: 16x6 grid of 64px (128px retina).
copy('tilesheet/tiles_sheet.png', 'tiles.png');
copy('tilesheet/tiles_sheet_retina.png', 'tiles@2x.png');
writeJson('tiles.json', gridAtlas('tiles.png', 16, 6, 64, 1));
writeJson('tiles@2x.json', gridAtlas('tiles@2x.png', 16, 6, 128, 2));

// UI atlas for in-canvas indicators (health bars). The JSON already follows the TexturePacker
// format; image paths are rewritten to the copied files.
for (const [json, png, outName] of [
  ['spritesheet/ui_sheet.json', 'spritesheet/ui_sheet.png', 'ui'],
  ['spritesheet/ui_sheet_retina.json', 'spritesheet/ui_sheet_retina.png', 'ui@2x'],
]) {
  const data = JSON.parse(readFileSync(join(src, json), 'utf8'));
  data.meta.image = `${outName}.png`;
  copy(png, `${outName}.png`);
  writeJson(`${outName}.json`, data);
}

// Individual UI PNGs for the React menus (CSS backgrounds / border-image), 1x and 2x.
copy('png/default/ui', 'ui/1x');
copy('png/retina/ui', 'ui/2x');
copy('png/default/tiles/tile_73.png', 'ui/water.png');
copy('png/retina/tiles/tile_73.png', 'ui/water@2x.png');
copy('logo_jungle_gaming.svg', 'logo_jungle_gaming.svg');

// Sound effects and loops (WAV, as provided).
copy('sounds', 'sounds');

console.log('[prepare-assets] public/assets ready');
