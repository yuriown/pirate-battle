# Pirate Battle

[![CI](https://github.com/yuriown/pirate-battle/actions/workflows/ci.yml/badge.svg)](https://github.com/yuriown/pirate-battle/actions/workflows/ci.yml)

A top-down 2D naval shooter built with **React**, **TypeScript (strict)** and **PixiJS**. Sail between
islands, sink Chasers and Shooters, and climb the ranking before time runs out.

- Live build: https://pirate-battle-plum.vercel.app/ (Vercel, static build with the MSW mocks)
- Architecture and design decisions: [ARCHITECTURE.md](ARCHITECTURE.md)
- Performance report: [docs/performance/PERFORMANCE.md](docs/performance/PERFORMANCE.md)
- Last Playwright run (83 passed, 1 skipped by design — the touch-controls test runs on mobile only; desktop + mobile Chromium): [docs/test-report/index.html](docs/test-report/index.html) — open with `npx playwright show-report docs/test-report`

| Concern | Technology |
| --- | --- |
| UI, menus, dialogs, HUD | React 18 + Tailwind CSS |
| Game rendering | PixiJS 8 |
| Language | TypeScript 5, `strict` |
| Ranking / history remote state | TanStack Query 5 |
| HTTP client | Axios |
| API mocking (dev, tests and the published build) | MSW 2 (service worker) |
| E2E and visual regression | Playwright |
| Build | Vite 6 |

## Setup

Requirements: Node.js 20+ and npm 10+.

```bash
npm install
npx playwright install chromium   # only needed to run the E2E tests
npm run dev                       # http://localhost:5173
```

`npm run dev`, `npm run build` and the Playwright web server first run `scripts/prepare-assets.mjs`,
which copies the runtime subset of the provided `assets/` pack into `public/assets/` (git-ignored) and
converts the Starling XML / tile sheets into Pixi JSON atlases. The provided pack is kept untouched.

### Environment variables

None are required. The app has no backend and no secrets: ranking and history are served by MSW in
every environment, including the static production build. Optional, test-only switches are URL
parameters (see [Test instrumentation](#test-instrumentation)).

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with HMR on port 5173 |
| `npm run build` | Type-check (`tsc -b`) and production build into `dist/` |
| `npm run preview` | Serve `dist/` on port 4173 |
| `npm run lint` | ESLint (typescript-eslint + react-hooks) |
| `npm run typecheck` | TypeScript project check without emitting |
| `npm run test:e2e` | Playwright suite (desktop and mobile Chromium) |
| `npm run test:e2e:update` | Re-record the visual regression baselines |
| `npm run test:report` | Open the last HTML report (`playwright-report/`) |
| `npm run profile` | Build, serve and measure a 3-minute match plus 5 memory cycles (see the performance report) |

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Sail forward | `W` / `↑` | Joystick (bottom left): push it |
| Turn left / right | `A` / `D` or `←` / `→` | Joystick: point it where the ship should go |
| Front cannon (1 ball) | `Space` / `J` | centre fire button (bottom right) |
| Port broadside (3 balls, left) | `Q` / `K` | left fire button |
| Starboard broadside (3 balls, right) | `E` / `L` | right fire button |
| Pause / resume | `Esc` / `P` | pause button (top right) |

Touch buttons appear on touch (coarse pointer) devices; on desktop a keyboard hint bar is shown
during the match instead. Hold any fire control to keep shooting at the weapon's cooldown. Moving, turning and firing can be
combined, including multi-touch. Game keys are only captured while a match is running; menus use normal
keyboard navigation (Tab, Enter/Space, arrow keys in the Ranking/History tabs, Esc closes dialogs).

**Mobile:** gameplay is landscape-only. In portrait on a touch device the match pauses and asks to
rotate; menus work in both orientations.

## Gameplay rules

- Match length: 60–180 s of **active** play (pauses don't count). Ends when time runs out or hull reaches 0.
- Every enemy sunk by the player's cannons is worth 1 point. A Chaser that rams you explodes, damages
  you and scores nothing.
- **Chaser** (red sails): pursues and rams (25 damage). **Shooter** (black sails): approaches until it has a
  clear line of fire within 380 units, holds position and fires. Both steer around islands.
- Enemies spawn every configured interval at arena edges that are free of islands and at least 560 units
  from the player. The first two spawns are one of each type, so both always appear.
- Ships show their health above them and visibly deteriorate (damaged sails, fire, wreck) as they lose it.

## Gameplay configuration

All balancing lives in one typed object, `DEFAULT_GAMEPLAY` in [src/game/config.ts](src/game/config.ts):
match duration, spawn interval / delay / weights / opening sequence / max alive / safe distance, per-ship
health, speed, acceleration and turn rate, weapon damage, cooldown, projectile speed, range and lifetime,
Shooter attack range and aim tolerance. Systems only read it, so rebalancing never touches simulation
code. Each match receives a frozen snapshot built from these defaults plus the player's options at the
moment it starts; changing options mid-match only affects the next one.

The Options screen exposes and validates:

| Option | Limits | Default |
| --- | --- | --- |
| Game session time | 60–180 s, whole seconds (steppers move in 10 s) | 90 s |
| Enemy spawn time | 1–10 s, in 0.5 s steps | 3 s |

Options also holds the **Captain name** shown in the ranking (2–16 characters) and a mute toggle.
Options, the name, the mute setting and the last completed result are persisted in `localStorage`.

## Network scenarios (MSW)

Ranking (`GET /api/ranking`) and history (`GET/POST /api/matches`) are mocked by MSW handlers in
[src/mocks/](src/mocks/), shared by dev, tests and production. Confirmed records and pending
submissions persist in `localStorage`, so they survive refreshes.

**Selecting a scenario:** use the **Network** panel (button at the bottom left of the menu screens), or
the URL: `?scenario=<id>&seed=<n>&latency=instant|realistic&timeout=<ms>` (read once at startup and
persisted). **Reset:** the panel's *Reset mock data* button restores the initial state — mock database,
pending submissions, confirmed ids, scenario settings and the local last result — and reloads the page.
`window.__pbMock.reset()` does the same for the mock state without reloading (used by scripts).

| Id | Behaviour |
| --- | --- |
| `normal` | Success with seeded latency (150–450 ms) |
| `empty` | Ranking and history return no rows (registering still works) |
| `many-pages` | ~120 ranking entries for whatever configuration is requested |
| `slow` | Every request takes 2.5 s |
| `jitter` | Seeded variable latency, 100 ms – 3 s |
| `out-of-order` | Reads alternate slow/fast so older responses arrive after newer ones |
| `timeout` | Requests hang past the client timeout |
| `network-error` | Connection failure |
| `http-400` / `http-500` | Client / server errors (4xx is not retried) |
| `ranking-fails` / `history-fails` | Only one endpoint fails |
| `post-timeout-after-commit` | The server saves the match, but answers after the client timeout; retries recover it without duplicates |
| `unavailable` | Every endpoint returns 503 until you switch back to `normal` (registration after recovery) |
| `flaky-post` | The first two registration attempts of each match fail |

### Reproducing failures by hand

- **Unavailable at match end:** select `unavailable`, play a short match (60 s). The result screen shows
  the record as not saved and kept on this device. Refresh: it is still pending in Match History.
  Switch to `normal` and press *Retry* (or just reload): it is sent once.
- **Timeout after commit:** select `post-timeout-after-commit` and set the timeout to e.g. 1500 ms in the
  panel. Finish a match: the first request times out after the server stored it; the automatic retry
  gets the existing record back (200, `created: false`) and history shows a single row.
- **Late responses:** select `out-of-order`, open Ranking and page quickly; the last requested page wins.
- **Asset failure:** block `/assets/ships.png` in the browser DevTools (Network → Block request URL) and
  press Play: the loading screen reports the failure and offers Retry.

## Testing

```bash
npm run test:e2e                                  # both projects
npx playwright test --project=desktop-chromium    # desktop only
npm run test:report                               # HTML report; traces are kept for failures
```

The suite ([e2e/](e2e/)) covers the 12 required flows (one file per item) plus visual regression of the
menu, a stable arena frame and the result screen, on desktop (1280×720) and mobile (Pixel 5 landscape)
Chromium. Every test runs in a fresh browser context. Visual baselines are versioned per OS in
`e2e/__screenshots__/<platform>/` (`win32` and `linux`, since fonts and rasterisation differ); on
another OS record them with `npm run test:e2e:update` before comparing.

**Continuous integration.** [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push
and pull request on a clean Ubuntu runner: `npm ci`, lint, type check, production build and the whole
Playwright suite (desktop + mobile). The HTML report is attached to each run as an artifact, plus traces
when a test fails. Running the workflow manually with *update_snapshots* re-records the Linux baselines
and publishes them as an artifact.

### Test instrumentation

Opt-in through the URL, never active in normal play:

| Parameter | Effect |
| --- | --- |
| `?e2e` | Exposes `window.__PB__.game`: `getState()`, `advance(ms)`, `setManualClock()`, `spawnEnemy()`, frame stats |
| `&seed=N` | With `?e2e`, fixes the simulation RNG (spawns are reproducible). Also seeds mock latency. |
| `&clock=manual` | The simulation only advances through `advance(ms)` (fixed 1/60 s steps) |
| `&spawns=off` | Disables automatic spawns so a test can arrange enemies |

Tests still press real keys / touch buttons; rules, collisions and rendering run unmodified.

## Assets and licenses

- `assets/` is the asset pack provided by Jungle Gaming as part of this challenge (ships, ship parts,
  effects, tiles, UI atlas, sounds, reference screenshots), used only for this assessment and kept
  unmodified. Derived files in `public/assets/` are generated by `scripts/prepare-assets.mjs` (atlas
  format conversion and copying only; no image or sound is altered).
- Two small procedural textures (a ring and a soft puff for splashes/smoke) are generated at runtime.
- No external fonts or CDNs are used.

## Known limitations

See the *Limitations* section of [ARCHITECTURE.md](ARCHITECTURE.md).
