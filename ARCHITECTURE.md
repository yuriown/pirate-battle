# Architecture

## Overview

```
src/
  game/                 Everything about a match. No React inside.
    config.ts           Typed balancing (DEFAULT_GAMEPLAY), option limits, per-match snapshot
    options.ts          Options validation + localStorage persistence
    sim/                Pure simulation: World (rules), arena layout, collisions, seeded RNG, math
    render/             PixiJS: texture loading (assets.ts), Renderer, pooled effects
    input/              Keyboard + touch → one held-state snapshot per simulation step
    audio/              Web Audio playback of the provided WAVs
    GameSession.ts      Owns one Pixi Application, the loop, pause, input/audio wiring, HUD store
  components/           React: menus, dialogs, HUD, touch controls, ranking/history tabs
  api/                  Contracts, Axios client, TanStack Query hooks, match submission
  net/                  Persistent outbox (pending submissions), storage helpers
  mocks/                MSW handlers, mock DB, fixtures, scenarios, control API
  lib/                  External store (useSyncExternalStore), last result, test flags
```

Responsibilities are split along one rule: **continuous state lives in the simulation, React only
sees coarse snapshots.**

| Layer | Knows about | Does not know about |
| --- | --- | --- |
| `sim/World` | rules, config, seed | Pixi, DOM, React, time source |
| `render/Renderer` | World (read-only), textures | input, React |
| `input/InputController` | DOM events | World, Pixi |
| `GameSession` | all of the above, the clock | React components |
| React components | `HudState` store, session commands | entities, frames |

## React ↔ PixiJS integration

- `GameScreen` first loads textures (progress bar, error + Retry). Combat never starts with missing
  textures: a failed load is not cached, so Retry simply calls the loader again.
- `Combat` creates a `GameSession` in an effect and calls `await session.mount(host)`, which creates the
  Pixi `Application` and appends its canvas. The cleanup calls `session.destroy()`.
- **Strict Mode:** the effect mounts, unmounts and mounts again. `mount()` is async, so `destroy()` sets
  a flag; if `app.init()` resolves after destruction the fresh app is destroyed immediately and never
  attached. The texture loader shares one in-flight promise (and its progress listeners) between both
  mounts. Result: exactly one canvas, one ticker, one set of listeners (checked by the navigation test,
  which asserts zero canvases after leaving and no console errors across 5 cycles).
- **No per-frame React renders:** the session publishes `HudState` (status, pause reason, score, whole
  seconds remaining, rounded health, end reason, match index) into a tiny external store that ignores
  shallow-equal updates. React subscribes with `useSyncExternalStore`, so the HUD re-renders when a
  visible number changes (about once per second for the clock), never 60 times per second. Health bars
  above ships, projectiles and effects are drawn by Pixi.
- Commands flow the other way as plain method calls: `pause()`, `resume()`, `restart()`, and the touch
  buttons write directly into the session's `InputController`.
- Accessibility: the HUD values are real DOM text with labels, and a polite live region announces only
  meaningful changes (score, hull thresholds, pause/resume, 30 s / 10 s warnings, match end). The canvas
  is `aria-hidden`.

## Simulation loop

- `World.step(dt, input)` advances the match by a fixed `dt = 1/60 s`. `GameSession` accumulates the
  real frame delta (clamped to 0.25 s per frame, at most 8 steps per frame; beyond that the backlog is
  capped at one step, so below ~7.5 fps game time runs slower than real time) and runs as many fixed
  steps as fit. Rendering interpolates between the previous and the current step
  (`alpha = accumulator / step`), so motion stays smooth on 120/144 Hz displays. Movement, cooldowns, projectile lifetime/range, spawn timers and the
  match clock all use simulated time, so behaviour is independent of the frame rate (a 120 Hz display
  and a 30 Hz one play identically).
- The match clock is the sum of simulated steps and snaps to the duration to avoid floating-point drift.
- **Pause** (manual, window blur, tab hidden, portrait orientation) disables input (held keys are
  dropped, OS key auto-repeat is ignored until a fresh press), zeroes the accumulator, fades the audio
  loops out and **stops the Pixi ticker**. Nothing advances,
  including cooldowns and effects. Resuming requires an explicit action (button, Esc/P) and starts from a
  clean input state, so nothing from the paused period is replayed.
- Input is sampled once per step. Presses shorter than one step are latched, so a quick tap still fires.
- **End of match** freezes the World (no movement, attacks, damage, spawns or scoring; in-flight
  projectiles are removed); only visual effects keep animating, then the ticker stops. The session
  reports the outcome once. If the player dies on the step that reaches the time limit, the end reason
  is `destroyed`.
- **Determinism:** every random decision (spawn side/position, enemy type after the opening sequence)
  goes through a seeded mulberry32 RNG. With `?seed=N&clock=manual` tests reproduce exact matches.

Order inside a step: player (turn, thrust, move, fire) → enemies (steer, move, fire) → projectiles
(move, obstacle/arena/target checks) → Chaser rams → ship separation → remove dead → spawner → clock.

## Collisions

- **Islands and rocks** are rounded rectangles hand-fitted to the visible sand of each tile group
  (`sim/arena.ts`). Circle-vs-rounded-rectangle tests give an exact push-out normal and depth.
- **Ships** use a capsule along the heading (radius 21, half-length 30), sampled as three circles
  (bow, middle, stern) for island and arena-edge resolution. The whole hull stays inside the visible
  arena. Hitting an island slows the player and plays a bump sound.
- **Projectiles** are small circles tested against obstacles, the arena bounds and ship capsules
  (point-to-segment distance). A projectile is consumed by its first hit, so damage is applied exactly
  once. It is also removed on obstacle contact, on leaving the arena, and after its range or lifetime.
  Player shots only hit enemies and enemy shots only hit the player. Dead ships are flagged immediately
  and ignored by every later check in the same step.
- **Ram:** capsule-vs-capsule distance (segment-segment) between a Chaser and the player.
- **Ship separation** pushes overlapping hulls apart using the same three capsule samples (no damage);
  enemies never shove the player, and a Chaser touching the player is left to the ram check.
- At 60 steps/s the fastest projectile moves ~10 units per step, below the smallest hit radius (26), so
  no swept tests are needed.

## Enemy behaviour

Both types turn at a limited rate and accelerate towards a target speed.

- **Steering** probes three points ahead along a candidate heading. If the direct heading to the player
  is blocked, the enemy picks the nearest free heading on one side and **keeps that side** for 1 s after
  the path clears. This stops it alternating left/right against a shore. When its bow is blocked it slows
  down so it can turn.
- **Chaser:** full speed towards the player; rams and explodes on contact.
- **Shooter:** approaches; once within its attack range **with a clear line of fire** it slows to a hold
  and aims straight at the player. It fires when the aim is within tolerance and the line from its bow to
  the player is clear for a cannonball-sized shot. Behind an island it keeps manoeuvring instead of parking.

## Rendering and resource management

- **Textures:** three atlases (ships/effects, tiles, UI) plus a standalone repeating water tile, fetched
  with `fetch` + `createImageBitmap` and parsed with Pixi's `Spritesheet`. The Starling XML ship atlas and
  the raw tile grid are converted to Pixi JSON at build time. Retina tiles/UI are used when
  `devicePixelRatio ≥ 1.5`. The pack's "retina" ship sheet has the same resolution as the default one,
  so only one is shipped. If one sheet fails, the ones that did load are destroyed before the error is
  reported, so Retry starts clean. Textures are loaded **once per page** and shared by every match. They are never
  destroyed between matches, which is what "reuse" means here, and they are deliberately not re-uploaded.
- **Renderer:** one view per ship (hull sprite + fire sprite + health bar), created and destroyed with
  the entity. Hull textures switch with the damage stage (`ship_N` = colour + 6 × stage in the pack:
  intact, damaged, heavily damaged, wreck). Projectile sprites are a reused array. Health-bar fills are
  sub-textures clipped along the atlas `fill_rect` metadata, cached per 2 % step (no allocation per frame).
- **Effects** (muzzle flash, smoke, wood debris, explosion frames, splashes, wakes, sinking wrecks) come
  from a sprite pool capped at 500 live particles, advanced with simulated time.
- **Canvas sizing:** the arena is a fixed 1920×1080 world scaled uniformly to fit the viewport
  (letterboxed, aspect preserved). The renderer resolution follows `devicePixelRatio` (capped at 2) with
  `autoDensity`; a `ResizeObserver` on the host plus a window `resize` listener keep size and pixel
  ratio in sync (orientation changes, browser zoom, moving to another monitor). The
  simulation never sees screen coordinates, so resizing cannot change the rules. There is no pointer aiming.
- **Teardown:** `destroy()` detaches keyboard/blur/visibility/resize listeners, disconnects the ResizeObserver,
  stops loops, removes the ticker callback, destroys the renderer's display objects and the two
  procedural textures, then destroys the Pixi app (removing the canvas). `restart()` destroys only the
  World and Renderer and keeps the app.

## Local persistence

| Key | Content |
| --- | --- |
| `pb.options.v1` | Player options (validated on load; invalid data falls back to defaults) |
| `pb.muted.v1` | Mute toggle |
| `pb.lastResult.v1` / `pb.showResult.v1` | Last completed match, and whether the result screen was open (restored after refresh) |
| `pb.player.v1` | Local player id + name |
| `pb.pending.v1` / `pb.confirmed.v1` | Outbox of unconfirmed submissions / recently confirmed ids |
| `pb.mock.db.v1` / `pb.mock.control.v1` | Mock server database / selected scenario, seed, latency, timeout |

A match only produces a record when it **completes**. Leaving the combat screen or reloading
mid-match destroys the session without calling `onEnd`, so abandoned matches are never recorded.

## Ranking and history

### Contracts (`src/api/contracts.ts`)

- `MatchRecord`: `matchId` (client UUID, idempotency key), `playerId`, `playerName`, `playedAt`, `score`,
  `durationMs` (active time), `endReason` (`time_up` | `destroyed`), `config`
  (`sessionDurationSec`, `spawnIntervalSec`).
- `GET /api/ranking?sessionDurationSec&spawnIntervalSec&page&pageSize` → `Page<RankingEntry>`. Only matches
  with the **same configuration** are compared. Order: score desc, then longer duration, then earlier
  `playedAt`, then `matchId` (deterministic).
- `GET /api/matches?playerId&page&pageSize` → `Page<MatchRecord>`, newest first.
- `POST /api/matches` → `201 {record, created: true}`, or `200 {created: false}` when the id already
  exists. `422` on an invalid body, `400` on invalid paging.
- Every page carries the mock DB `revision` at the moment it was computed.

### Client

- Axios instance with a timeout (8 s default, adjustable in the Network panel). Errors are normalised into
  `ApiError {kind: timeout | network | http, status, retryable}`; 4xx is not retried except 408/429.
- Queries: key per resource + parameters, `staleTime: 0` with `refetchOnMount: 'always'`. Showing a tab
  again renders the cached page immediately and refetches in the background (an "Updating…" indicator).
  Hidden tabs are unmounted. Queries and the registration mutation use `networkMode: 'always'`: the
  API lives in the page, so a browser "offline" flag must not freeze them. `keepPreviousData` for pagination, 2 retries with exponential backoff for
  transient errors, `AbortSignal` passed to Axios. UI states: loading, empty, error with Retry, background
  refresh.
- **Late responses:** after a registration, in-flight reads are **cancelled** before both tabs are
  invalidated (invalidating a query that is still on its first load would otherwise just join the stale
  request). In addition, every confirmed registration raises a client-side minimum `revision`: a page
  computed against an older revision is fetched again, and a page older than the cached one for the
  same key is discarded. Covered by `e2e/12` (a slow history read in flight while a match is registered).
- **Registration:** at match end the record is **written to the outbox first**, then sent through a
  TanStack `MutationObserver` (module-level, so it survives the result screen unmounting when the player
  starts another match). There is one in-flight chain per `matchId`, so repeated clicks join it. On
  success: removed from the outbox, id remembered as confirmed, and both `ranking` and `history`
  invalidated. On final failure: kept as `failed` with a Retry control (result screen and a "Not saved
  yet" table in Match History). The outbox is flushed on startup and on the browser `online` event.
- **No duplicates:** the same `matchId` is reused for every attempt, and the server upserts by id.
  "Timeout after commit" therefore resolves to the existing record.
- API failures never block the game or options; the menus show inline errors only.

### Mocks

MSW's service worker (`public/mockServiceWorker.js`, served at the site root) intercepts the requests
and hands them to the handlers, which run **in the page** — in dev, in Playwright and in the static
production build alike. Because every open tab has its own copy of the handlers, the mock database
treats `localStorage` as the source of truth and re-reads it before every read and write, so two tabs
never overwrite each other's records. If the worker cannot start, the app still runs and the API calls
fail like a network error. Fixtures are generated from a seeded RNG with fixed
dates, and scenario latency uses the same seed. `latency=instant` removes artificial delay for tests.

## Balancing decisions

- Player: 100 hull, 210 u/s, 2.4 rad/s. Front cannon: 34 damage, 0.45 s cooldown, long range. It is the
  precise weapon: 2 hits sink a Chaser, 3 a Shooter.
- Broadside: 3 × 25 damage, 1.2 s cooldown per side, shorter range. A full hit sinks a Shooter at once, but
  it requires turning side-on.
- Chaser: fast (150 u/s), fragile (50), rams for 25, so four rams sink you. Shooter: slow (105 u/s),
  tougher (75), 10 damage per shot every 1.6 s from 380 u. It is pressure you must break rather than dodge.
- Spawns every 3 s by default (max 10 alive; when the arena is full the due spawn happens as soon as a
  slot frees up), first spawn after 1.5 s, the first two always one of each type, then 55/45
  Chaser/Shooter, at least 560 u from the player. That leaves roughly 3 s before a fresh
  Chaser can reach you.

## Limitations

- Enemy avoidance is local steering, not pathfinding. It is reliable for this arena's convex islands but
  could stall in a concave maze.
- Collision shapes are approximations: rounded rectangles for islands, a capsule for ships.
- Chromium's DevTools console logs "Failed to load resource: 503/500" for the *intentionally* failing mock
  scenarios. These are network log lines, not unhandled JavaScript errors; normal flows log no errors.
- TanStack pauses retries while the tab is hidden, so a pending registration resumes when the page is
  visible again (or on the next start).
- Visual baselines are OS/GPU specific (recorded on Windows + Chromium).
- Audio requires a user gesture (it unlocks on Play). The WAVs are loaded lazily after that and never
  block the match.
- Mobile gameplay is landscape-only by design. Touch buttons are shown on coarse-pointer (touch)
  devices; fine-pointer devices get a keyboard hint bar instead.
- The two procedural textures' source `Graphics` and the arena frame are released by Pixi's own
  graphics GC rather than destroyed explicitly: destroying their contexts right after use crashed
  Pixi 8's batcher in testing.
- Hull sprites are slightly larger than their colliders, so a ship pressed against the arena edge can
  overhang the letterbox by a few pixels.
