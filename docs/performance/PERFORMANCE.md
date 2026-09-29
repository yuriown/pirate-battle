# Combat performance profile

All numbers come from `npm run profile` (`scripts/profile.mjs`) on 2026-09-29, against the production
build (`npm run build` + `vite preview`) of the reviewed code (commit `a19db0e`, which added render
interpolation and capsule-based ship separation). Raw data: [`profile-results.json`](profile-results.json).
Per-second samples: [`per-second-720p-aim.csv`](per-second-720p-aim.csv),
[`per-second-1080p-aim.csv`](per-second-1080p-aim.csv). The 1080p match was re-run on its own the same
day (`npm run profile -- --skip-build --only-1080p --skip-memory --out=profile-results-1080p-rerun.json`):
[`profile-results-1080p-rerun.json`](profile-results-1080p-rerun.json),
[`per-second-1080p-aim-rerun.csv`](per-second-1080p-aim-rerun.csv). The stress test
(`npm run profile -- --skip-build --stress-only`) is in
[`profile-results-stress.json`](profile-results-stress.json),
[`per-second-stress-720p.csv`](per-second-stress-720p.csv) and
[`per-second-stress-1080p.csv`](per-second-stress-1080p.csv); the re-run and the stress test used the
same build and source (`src/` unchanged since `a19db0e`). The pre-review build's run is summarised below for comparison (its raw data is
`docs/performance/profile-results.json` at commit `66c4f6f`); an even earlier exploratory run is kept in
[`profile-results-headed-attempt.json`](profile-results-headed-attempt.json).

## Reference environment

| Item | Value |
|---|---|
| Machine | Laptop, 13th Gen Intel Core i5-1334U (10 cores / 12 threads), 15.7 GiB RAM (3.6 GiB free at start; 1.7–2.1 GiB for the re-run and stress test) |
| GPU | Intel Iris Xe Graphics, driver 32.0.101.7085. WebGL: `ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x0000A7A1) Direct3D11 vs_5_0 ps_5_0, D3D11)`, WebGL 2.0, hardware GPU compositing |
| OS | Windows 11 Pro (10.0.26200), on AC power |
| Browser | Chromium 153.0.8010.12 (bundled with Playwright 1.63), **headed window**, flags `--disable-renderer-backgrounding --disable-background-timer-throttling --disable-backgrounding-occluded-windows --enable-precise-memory-info` |
| Display | 120 Hz (median idle rAF interval 8.3 ms): vsync caps the frame rate at about 120 FPS |
| Viewport | 1280×720 CSS px at deviceScaleFactor 1 (main run); second run at 1920×1080 |
| Match config | Session 180 s, spawn every 3 s (the default), `maxAlive` 10, `?e2e&seed=42`, **real clock** |
| DevTools | Not open (Playwright's CDP connection is attached) |

## Method

- **Input.** Real keyboard events via `page.keyboard`: W, Space, Q and E held; an autopilot reads enemy
  positions through the `?e2e` test API about every 40 ms and presses A/D to aim at the nearest threat.
  It never changes the simulation.
- **Three minutes of combat.** The autopilot does not survive a whole 180 s match, so when it is
  destroyed the script presses **Play Again** (the in-place restart path) and keeps measuring until 180 s
  of *active* play have accumulated. Each match is a segment; restarts and end animations are included.
- **Frame time**, from two independent sources: the Pixi ticker `deltaMS` of every frame (`frameStats()`,
  collected and reset every 30 s; samples are only recorded with `?e2e`), and a `requestAnimationFrame`
  probe injected into the page. Mean FPS = 1000 / mean frame time; percentiles are nearest-rank.
- **Entities.** `getState()` sampled once per second (enemies, projectiles, recursive Pixi display-object
  count), only while the match is running.
- **Background load.** Before each run the script waits up to 3 min for machine CPU < 30 %, then records
  CPU before and during the run.
- **Memory.** Five cycles of menu → Play → 20 s of autopilot combat → Pause → Main Menu. Before the
  first cycle and after each one: two forced GCs (`HeapProfiler.collectGarbage`), then
  `Runtime.getHeapUsage`, `Memory.getDOMCounters`, `<canvas>` count and resource-timing entries; heap
  snapshots after cycle 1 and cycle 5 are compared per constructor.

## Results: three minutes of combat

| | **1280×720 (main)** | 1920×1080 (re-run) | 1920×1080 (first run, superseded) |
|---|---|---|---|
| Active play measured | 180.1 s (5 segments) | 180.7 s (4 segments) | 181.0 s (4 segments) |
| Frames | 21,752 | 20,154 | 19,305 |
| **Mean FPS** (Pixi ticker / rAF probe) | **119.8 / 119.8** | 110.6 / 110.6 | 105.5 / 97.9 |
| Frame time p50 | 8.3 ms | 8.3 ms | 8.3 ms |
| **Frame time p95** | **8.5 ms** | 16.5 ms | 16.7 ms |
| Frame time p99 | 8.8 ms | 25.0 ms | 25.0 ms |
| Frames > 16.7 ms (below 60 FPS) | 0.16 % | 3.8 % | 5.6 % |
| Frames > 33.3 ms (below 30 FPS) | 0.01 % | 0.21 % | 0.35 % |
| Frames > 50 ms | 0 | 5 (max 83 ms) | 20 |
| Suspected throttled frames (~1 s rAF gaps) | 0 | 0 | 15 |
| Machine CPU busy before / during | 30 % / 33 % | 20 % / 58 % | 27 % / 65 % |
| Console errors | none | none | none |

**Entities while running (per-second samples):**

| | Enemies alive | Projectiles | Display objects |
|---|---|---|---|
| 720p: max / mean | 4 / 1.58 | 9 / 3.86 | 169 / 126.5 |
| 1080p re-run: max / mean | 4 / 1.55 | 9 / 3.64 | 167 / 124.7 |

**Segments** (match length s, kills, rams taken) — 720p: (33.5, 6, 3), (40.5, 9, 2), (56.1, 15, 2),
(42.9, 9, 3), (7.1, 2, 0, still running). 1080p re-run: (60.7, 14, 3), (45.8, 11, 1), (34.5, 7, 3),
(39.8, 10, 1, still running).

**Reading.** At 1280×720 the 60 FPS target is met with a wide margin: the game runs at the display's
120 Hz, p95 is 8.5 ms (half of the 16.7 ms budget) and only 0.16 % of frames missed 60 FPS. At 1920×1080
the mean stays well above 60 FPS and p95 sits just under the budget, but 3.8 % of frames missed it. The
first 1080p run (5.6 %, 15 throttled frames) was repeated because of those throttled frames; the re-run
had none and started from 20 % CPU. "CPU during" includes the browser running the game, and every 1080p
run so far (65 %, 58 %, and 52 % under stress) sat well above every 720p run (33 %, 29 % under stress),
so the higher figure is mostly the game's own cost at 2.25× the pixels, not proof of outside load.

### Results: stress (10 enemies alive)

The normal runs never had more than 4 enemies alive, so a separate stress run keeps the arena at the
`maxAlive` limit: `?e2e&seed=42&spawns=off` turns the spawner off and the script tops enemies up to
exactly 10 every 250 ms through `spawnEnemy` (alternating chaser/shooter, arena-edge points ≥ 560 units
from the player and clear of the islands and rocks). Same input, same autopilot and same method as
above, 60 s of active play per resolution. With 10 enemies the autopilot is sunk every 7–15 s (6.7 s at the shortest), so each
run is 6–7 matches joined by Play Again (restarts and end animations are included in the frame data).

| | **1280×720** | 1920×1080 |
|---|---|---|
| Active play measured | 60.1 s (7 segments) | 60.3 s (6 segments) |
| Frames | 7,582 | 7,259 |
| **Mean FPS** (Pixi ticker / rAF probe) | **120.0 / 120.0** | 112.2 / 112.2 |
| Frame time p50 | 8.3 ms | 8.3 ms |
| **Frame time p95** | **8.5 ms** | 16.5 ms |
| Frame time p99 | 8.7 ms | 24.7 ms |
| Frames > 16.7 ms (below 60 FPS) | 0.08 % | 3.1 % |
| Frames > 33.3 ms (below 30 FPS) | 0 % | 0.11 % |
| Frames > 50 ms | 0 (max 33 ms) | 0 (max 50 ms) |
| Suspected throttled frames (~1 s rAF gaps) | 0 | 0 |
| Enemies alive: min / mean / max | 9 / 9.95 / 10 | 9 / 9.95 / 10 |
| Projectiles: max / mean | 13 / 3.95 | 11 / 3.93 |
| Display objects: max / mean | 263 / 246.5 | 276 / 247.4 |
| Enemies spawned by the script | 103 | 96 |
| Machine CPU busy before / during | 28 % / 29 % | 25 % / 52 % |
| Console errors | none | none |

**Reading.** Holding 10 enemies alive (about twice the display objects of normal play) did not move
the numbers: 720p stays locked at 120 FPS with p95 8.5 ms, and 1080p matches the normal 1080p run
(p95 16.5 ms, ~3–4 % of frames over budget). The 1080p cost therefore scales with resolution, not with
entity count. Slow frames did not line up with explosions: at 1080p, seconds with a kill had fewer
frames over 16.7 ms (3.0 per second) than seconds without one (3.7); seconds with a death or restart
had slightly more (4.5). At 720p there were 6 such frames in the whole minute.

### Comparison with the pre-review build

| | 720p FPS / p95 / >16.7 ms | 1080p FPS / p95 / >16.7 ms | CPU during (720p / 1080p) |
|---|---|---|---|
| Pre-review build | 118.6 / 8.7 ms / 0.48 % | 88.2 / 24.9 ms / 16.1 % | 76 % / 88 % |
| **Reviewed build** | **119.8 / 8.5 ms / 0.16 %** | **105.5 / 16.7 ms / 5.6 %** | 33 % / 65 % |
| Reviewed build, 1080p re-run | — | 110.6 / 16.5 ms / 3.8 % | — / 58 % |

Render interpolation and the capsule-based separation did not cost measurable frame time. Most of the
improvement tracks the lower background load of this run, so treat the difference as noise plus load,
not as an optimisation.

## Results: memory over 5 start/play/leave cycles

| Sample (after forced GC, on the menu) | JS heap used (CDP) | DOM nodes | JS listeners | Canvases | Resource-timing entries |
|---|---|---|---|---|---|
| Baseline, before cycle 1 | 4.14 MiB | 116 | 167 | 0 | 13 |
| After cycle 1 | 6.98 MiB | 119 | 180 | 0 | 67 |
| After cycle 2 | 7.20 MiB | 119 | 180 | 0 | 79 |
| After cycle 3 | 7.46 MiB | 119 | 180 | 0 | 91 |
| After cycle 4 | 7.54 MiB | 119 | 180 | 0 | 105 |
| After cycle 5 | 7.73 MiB | 119 | 180 | 0 | 119 |

- **Cycle 1 (+2.8 MiB)** is one-time loading: textures are loaded once per page and kept by design
  (`render/assets.ts`), audio buffers are decoded and the lazy Pixi chunks load (56 requests; later
  cycles make 12–14).
- **Cycles 2–5** add 0.22, 0.27, 0.08 and 0.19 MiB (**+0.75 MiB** after cycle 1), not yet clearly
  levelled off after five cycles.
- **Investigation** (heap snapshots after cycle 1 vs cycle 5): no game or Pixi class grew; the canvas
  and WebGL view are gone after every exit (0 canvases), DOM nodes and DOM event listeners stay flat
  (119 / 180). What grew in step with the ~52 requests of cycles 2–5 are per-request browser objects:
  `ReadableStream` +52, `MessagePort` +52 and the native listeners registered on those ports (+104),
  plus `PerformanceResourceTiming` entries (+52; the browser's resource-timing buffer). This matches
  requests routed through the MSW service worker (responses are transferred over a `MessagePort`) and
  Playwright's attached network recording — not game state.
- **Conclusion.** No leak found in the combat session: display objects, canvas, WebGL view, ticker and
  listeners are released on exit. The residual growth (~0.2 MiB per cycle) scales with the number of
  requests, not with play time.

## Observations and limitations

- **One machine, one run per build.** Numbers vary between runs; treat a few FPS and a few ms of p95 as
  noise.
- **Background load.** Other Chromium and Node processes (the Code editor, a dev server) were running;
  the script waited for CPU to calm down but could not guarantee an idle machine (before the re-run and
  the stress runs it waited 3–42 s, starting at 20–28 %).
- **120 Hz display.** FPS is capped by vsync at about 120, so mean FPS hides the headroom; the share of
  frames over 16.7 ms and p95 are the metrics that matter for the 60 FPS target.
- **Entity counts.** In the normal runs the autopilot sinks enemies quickly, so at most 4 enemies and
  9 projectiles were alive at once (typical combat). The stress runs cover the `maxAlive` limit of 10
  (mean 9.95 alive), but only for 60 s per resolution, with the script placing the enemies rather than
  the game's spawner, and with projectiles still low (max 13) because the player sinks fast.
- **Not a single uninterrupted match**: the 3 minutes span 4–5 matches joined by Play Again (6–7 per
  minute in the stress runs).
- **Instrumentation overhead.** The autopilot calls `getState()` ~25 times per second (full snapshot plus
  a recursive display-object count); Playwright's CDP connection, the rAF probe and the sampling add
  their own cost. Uninstrumented play should be equal or better.
- **Window state.** A headed window can still be throttled when covered; the script reports ~1 s rAF gaps
  as `suspectedThrottlingFrames` (0 at 720p, 15 in the first 1080p run, 0 in the 1080p re-run and in
  both stress runs).
- **Screen size** is the emulated viewport, not the physical panel; deviceScaleFactor was forced to 1, so
  the 1x assets were used.
- **GPU memory** is not visible from the page and was not measured.
