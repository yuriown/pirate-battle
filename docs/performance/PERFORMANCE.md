# Combat performance profile

All numbers come from `npm run profile` (`scripts/profile.mjs`) on 2026-09-29, against the production
build (`npm run build` + `vite preview`) of the reviewed code (commit `a19db0e`, which added render
interpolation and capsule-based ship separation). Raw data: [`profile-results.json`](profile-results.json).
Per-second samples: [`per-second-720p-aim.csv`](per-second-720p-aim.csv),
[`per-second-1080p-aim.csv`](per-second-1080p-aim.csv). An earlier run on the pre-review build is kept in
[`profile-results-headed-attempt.json`](profile-results-headed-attempt.json) and summarised below for comparison.

## Reference environment

| Item | Value |
|---|---|
| Machine | Laptop, 13th Gen Intel Core i5-1334U (10 cores / 12 threads), 15.7 GiB RAM (3.6 GiB free at start) |
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

| | **1280×720 (main)** | 1920×1080 |
|---|---|---|
| Active play measured | 180.1 s (5 segments) | 181.0 s (4 segments) |
| Frames | 21,752 | 19,305 |
| **Mean FPS** (Pixi ticker / rAF probe) | **119.8 / 119.8** | 105.5 / 97.9 |
| Frame time p50 | 8.3 ms | 8.3 ms |
| **Frame time p95** | **8.5 ms** | 16.7 ms |
| Frame time p99 | 8.8 ms | 25.0 ms |
| Frames > 16.7 ms (below 60 FPS) | 0.16 % | 5.6 % |
| Frames > 33.3 ms (below 30 FPS) | 0.01 % | 0.35 % |
| Frames > 50 ms | 0 | 20 |
| Suspected throttled frames (~1 s rAF gaps) | 0 | 15 |
| Machine CPU busy before / during | 30 % / 33 % | 27 % / 65 % |
| Console errors | none | none |

**Entities while running (per-second samples):**

| | Enemies alive | Projectiles | Display objects |
|---|---|---|---|
| 720p: max / mean | 4 / 1.58 | 9 / 3.86 | 169 / 126.5 |
| 1080p: max / mean | 4 / 1.58 | 9 / 4.02 | 163 / 125.4 |

**Segments** (match length s, kills, rams taken) — 720p: (33.5, 6, 3), (40.5, 9, 2), (56.1, 15, 2),
(42.9, 9, 3), (7.1, 2, 0, still running). 1080p: (76.7, 21, 1), (31.3, 5, 4), (51.5, 13, 2),
(21.5, 3, 2, still running).

**Reading.** At 1280×720 the 60 FPS target is met with a wide margin: the game runs at the display's
120 Hz, p95 is 8.5 ms (half of the 16.7 ms budget) and only 0.16 % of frames missed 60 FPS. At 1920×1080
the mean stays well above 60 FPS and p95 sits right at the budget, but 5.6 % of frames missed it; that
run coincided with 65 % machine CPU and 15 frames with ~1 s rAF gaps (the window being throttled or
occluded), so it is a lower bound for this laptop rather than a clean measurement of the game.

### Comparison with the pre-review build

| | 720p FPS / p95 / >16.7 ms | 1080p FPS / p95 / >16.7 ms | CPU during (720p / 1080p) |
|---|---|---|---|
| Pre-review build | 118.6 / 8.7 ms / 0.48 % | 88.2 / 24.9 ms / 16.1 % | 76 % / 88 % |
| **Reviewed build** | **119.8 / 8.5 ms / 0.16 %** | **105.5 / 16.7 ms / 5.6 %** | 33 % / 65 % |

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
  the script waited for CPU to calm down but could not guarantee an idle machine. The 1080p run in
  particular should be repeated on an idle machine with the window kept in front.
- **120 Hz display.** FPS is capped by vsync at about 120, so mean FPS hides the headroom; the share of
  frames over 16.7 ms and p95 are the metrics that matter for the 60 FPS target.
- **Low entity counts.** The autopilot sinks enemies quickly and dies after 30–75 s, so at most 4 enemies
  and 9 projectiles were alive at once; the `maxAlive` limit of 10 was never reached. This is typical
  combat, not a worst case; a stress test (e.g. keeping 10 enemies alive through `spawnEnemy`) was not run.
- **Not a single uninterrupted match**: the 3 minutes span 4–5 matches joined by Play Again.
- **Instrumentation overhead.** The autopilot calls `getState()` ~25 times per second (full snapshot plus
  a recursive display-object count); Playwright's CDP connection, the rAF probe and the sampling add
  their own cost. Uninstrumented play should be equal or better.
- **Window state.** A headed window can still be throttled when covered; the script reports ~1 s rAF gaps
  as `suspectedThrottlingFrames` (0 at 720p, 15 at 1080p in this run).
- **Screen size** is the emulated viewport, not the physical panel; deviceScaleFactor was forced to 1, so
  the 1x assets were used.
- **GPU memory** is not visible from the page and was not measured.
