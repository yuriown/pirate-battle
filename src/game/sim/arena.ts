// Static arena layout: world size, solid obstacles (colliders) and the tiles that draw them.
// Colliders are rounded rectangles hand-fitted to the visible sand of each tile group.

export const ARENA = { width: 1920, height: 1080 } as const;
export const TILE = 64;

export interface Obstacle {
  id: string;
  /** Rounded-rectangle collider, world units. */
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
}

export interface TilePlacement {
  tile: number;
  x: number;
  y: number;
}

interface IslandDef {
  id: string;
  /** Top-left of the tile group, in world units. */
  x: number;
  y: number;
  /** Tile numbers of the group, row-major. */
  tiles: number[][];
  inset: number;
  radius: number;
  decorations?: TilePlacement[];
}

// Tile numbers refer to png/default/tiles/tile_N.png (16 columns, row-major).
const SAND_3x3 = [
  [1, 2, 3],
  [17, 18, 19],
  [33, 34, 35],
];
const GRASS_4x4 = [
  [6, 7, 8, 9],
  [22, 23, 24, 25],
  [38, 39, 40, 41],
  [54, 55, 56, 57],
];

const ISLANDS: IslandDef[] = [
  { id: 'north-east', x: 1216, y: 96, tiles: GRASS_4x4, inset: 12, radius: 44,
    decorations: [{ tile: 70, x: 1236, y: 128 }, { tile: 71, x: 1380, y: 260 }] },
  { id: 'center', x: 832, y: 384, tiles: GRASS_4x4, inset: 12, radius: 44,
    decorations: [{ tile: 72, x: 990, y: 400 }, { tile: 66, x: 850, y: 540 }] },
  { id: 'west', x: 224, y: 576, tiles: SAND_3x3, inset: 10, radius: 48,
    decorations: [{ tile: 71, x: 288, y: 612 }, { tile: 49, x: 330, y: 690 }] },
  { id: 'south-east', x: 1504, y: 704, tiles: SAND_3x3, inset: 10, radius: 48,
    decorations: [{ tile: 70, x: 1560, y: 730 }] },
];

const ROCKS: { id: string; tile: number; x: number; y: number }[] = [
  { id: 'rock-nw', tile: 66, x: 480, y: 176 },
  { id: 'rock-e', tile: 65, x: 1632, y: 448 },
  { id: 'rock-s', tile: 50, x: 576, y: 928 },
];

export const OBSTACLES: Obstacle[] = [
  ...ISLANDS.map((i) => {
    const w = i.tiles[0].length * TILE;
    const h = i.tiles.length * TILE;
    return { id: i.id, x: i.x + i.inset, y: i.y + i.inset, w: w - i.inset * 2, h: h - i.inset * 2, radius: i.radius };
  }),
  ...ROCKS.map((r) => ({ id: r.id, x: r.x + 12, y: r.y + 14, w: TILE - 24, h: TILE - 26, radius: 14 })),
];

/** Background layer (islands) and prop layer (decorations, rocks) for the renderer. */
export const ISLAND_TILES: TilePlacement[] = ISLANDS.flatMap((i) =>
  i.tiles.flatMap((row, r) => row.map((tile, c) => ({ tile, x: i.x + c * TILE, y: i.y + r * TILE }))),
);
export const PROP_TILES: TilePlacement[] = [
  ...ISLANDS.flatMap((i) => i.decorations ?? []),
  ...ROCKS.map((r) => ({ tile: r.tile, x: r.x, y: r.y })),
];

export const PLAYER_SPAWN = { x: 960, y: 940, rotation: -Math.PI / 2 } as const;
