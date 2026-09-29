# Combat performance profile

All numbers come from one run of `npm run profile` (`scripts/profile.mjs`) on 2026-09-29, against the production build (`npm run build` + `vite preview`). The raw data is in [`profile-results.json`](profile-results.json). Per-second samples are in [`per-second-720p-aim.csv`](per-second-720p-aim.csv) and [`per-second-1080p-aim.csv`](per-second-1080p-aim.csv).

## Reference environment

| Item | Value |
|---|---|
| Machine | Laptop, 13th Gen Intel Core i5-1334U (10 cores / 12 threads), 15.7 GiB RAM (1.9 GiB free at start) |
| GPU | Intel Iris Xe Graphics, driver 32.0.101.7085. WebGL: `ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x0000A7A1) Direct3D11 vs_5_0 ps_5_0, D3D11)`, WebGL 2.0, GPU compositing enabled (hardware, not software rendering) |
| OS | Windows 11 Pro (10.0.26200), on AC power |
| Browser | Chromium 153.0.8010.12 (bundled with Playwright 1.63), **headed window**, flags `--disable-renderer-backgrounding --disable-background-timer-throttling --disable-backgrounding-occluded-windows --enable-precise-memory-info` |
| Display | 120 Hz (median idle rAF interval 8.3 ms). vsync caps the frame rate at about 120 FPS |
| Viewport | 1280×720 CSS px at deviceScaleFactor 1 (main run). A second run used 1920×1080 |
| Match config | Session 180 s, spawn every 3 s (the default), `maxAlive` 10, `?e2e&seed=42`, real clock (no manual clock) |
| DevTools | Not open. Playwright's CDP connection is attached |

## Method

- **Input.** Real keyboard events via `page.keyboard`. W (sail), Space (bow cannon), Q and E (broadsides) are held throughout. An autopilot reads enemy positions through the `?e2e` test API about every 40 ms and presses A or D to aim the bow at the nearest threat. It does not change the simulation.
- **Three minutes of combat.** The autopilot does not survive the whole 180 s match. When the player is destroyed, the script presses **Play Again** (the in-place restart path) and keeps measuring until cumulative active play time reaches 180 s. Each match is recorded as a segment. Frames from the short end-of-match animations and restarts are included.
- **Frame time.** Two independent sources:
  1. The Pixi ticker `deltaMS` for every frame (`frameStats()`). The script collects and resets it every 30 s so the in-game sample cap (20,000 at the time of this run, 30,000 since; samples are only recorded with `?e2e`) is never hit.
  2. A `requestAnimationFrame` probe injected into the page, recording `performance.now()` deltas.

  Mean FPS = 1000 / mean frame time. Percentiles use the nearest-rank method.
- **Entities.** `getState()` is sampled once per second: enemies alive, projectiles, and Pixi display objects (recursive stage count). Only seconds with status `running` are used.
- **Background load.** Before each run the script waits up to 3 min for machine CPU to drop below 30%, then records CPU before and during the run.
- **Memory.** Five cycles of: menu → Play → 20 s of autopilot combat → Pause → Main Menu. Before the first cycle and after each one, the script forces GC twice (`HeapProfiler.collectGarbage`), then records:
  - `Runtime.getHeapUsage`, `performance.memory`, and `Memory.getDOMCounters`
  - the number of `<canvas>` elements
  - resource-timing entries

  It also takes heap snapshots after cycle 1 and cycle 5 and compares counts per constructor.

## Results: three minutes of combat

| | 1280×720 (main) | 1920×1080 |
|---|---|---|
| Active play measured | 181.0 s (5 segments) | 180.4 s (5 segments) |
| Frames | 21,785 | 16,146 |
| **Mean FPS** (Pixi ticker / rAF probe) | **118.6 / 117.8** | **88.2 / 88.2** |
| Frame time p50 | 8.3 ms | 8.4 ms |
| **Frame time p95** | **8.7 ms** | **24.9 ms** |
| Frame time p99 | 9.9 ms | 33.2 ms |
| Frames > 16.7 ms (below 60 FPS) | 0.48 % | 16.1 % |
| Frames > 33.3 ms (below 30 FPS) | 0.05 % | 0.74 % |
| Frames > 50 ms | 2 | 9 |
| Machine CPU busy before / during | 48 % / 76 % | 39 % / 88 % |

Both sources agree to within 1 FPS. The only disagreement is in max frame time: the Pixi ticker clamps `deltaMS` at 100 ms, while the rAF probe measured the real gaps. At 720p the two long frames were 358 ms at the first death and restart, and 990 ms at the end of the measurement window, when the script was collecting data.

### Entities (per-second samples while running)

| | Enemies alive | Projectiles | Display objects |
|---|---|---|---|
| 720p: max / mean | 4 / 1.56 | 9 / 3.69 | 174 / 125.6 |
| 1080p: max / mean | 4 / 1.61 | 9 / 3.77 | 155 / 125.3 |

### Segments (player destroyed, then Play Again)

| Run | Match lengths (s) | Kills | Rams taken |
|---|---|---|---|
| 720p | 41.5, 52.4, 34.6, 45.1, 7.4 (still running at 180 s) | 9, 15, 7, 10, 2 | 3, 1, 3, 2, 0 |
| 1080p | 46.7, 36.7, 48.9, 40.9, 7.2 (still running at 180 s) | 9, 7, 12, 9, 2 | 3, 3, 2, 3, 0 |

No automatic pauses occurred (no `blur` or `visibilitychange`). The browser console logged no errors or warnings.

**Reading.** At 1280×720 the 60 FPS target is met with a wide margin: p95 is 8.7 ms, about half the 16.7 ms budget, and the game runs at the 120 Hz display rate. At 1920×1080 the mean stays above 60 FPS, but 16 % of frames exceeded 16.7 ms and p95 was 24.9 ms. That run also had the heaviest background load (88 % machine CPU; see limitations). So the 1080p result is a lower bound for this laptop, not a clean measurement of the game.

## Results: memory over 5 start/play/leave cycles

| Sample (after forced GC, on the menu) | JS heap used (CDP) | DOM nodes | JS listeners | Canvases | Documents |
|---|---|---|---|---|---|
| Baseline, before cycle 1 | 4.11 MiB | 114 | 167 | 0 | 2 |
| After cycle 1 | 6.89 MiB | 117 | 180 | 0 | 2 |
| After cycle 2 | 7.16 MiB | 117 | 180 | 0 | 2 |
| After cycle 3 | 7.46 MiB | 125 | 180 | 0 | 2 |
| After cycle 4 | 7.59 MiB | 125 | 180 | 0 | 2 |
| After cycle 5 | 7.76 MiB | 125 | 180 | 0 | 2 |

- **Cycle 1 (+2.8 MiB)** is one-time loading. Textures are loaded once per page and kept by design (`render/assets.ts`), the audio buffers are decoded, and the lazy Pixi chunks load. Cycle 1 made 56 requests; later cycles made 12 to 15.
- **Cycles 2 to 5** grew by 0.27, 0.30, 0.14 and 0.17 MiB, a total of **+0.87 MiB** after cycle 1. This is slow growth that had not clearly levelled off after 5 cycles.
- **Investigation.** Between the snapshots after cycle 1 and cycle 5:
  - No game or Pixi class grew. The canvas and the WebGL view are removed on every exit (0 canvases on the menu). The event-listener counter stayed flat (180), and the DOM grew by only 8 nodes.
  - What grew were per-request browser objects, each by exactly **+52**: `ReadableStream`, `MessagePort`, `CrossRealmTransformReadable` and `PerformanceResourceTiming`. The number of network requests in cycles 2 to 5 was also exactly 52 (12 + 15 + 13 + 12).
  - These objects fit a request routed through the MSW service worker (it transfers response streams over a `MessagePort`), plus the browser's resource-timing buffer. They are not game state. The earlier run also showed `NetworkResourcesData::ResourceData` growing: that is the DevTools network buffer that Playwright's CDP attachment keeps, so part of the growth comes from the measurement itself.
  - The 12 requests per match are the HUD and touch-control PNG icons, requested again each time the combat screen mounts. These requests may be answered from the browser cache.
- **Conclusion.** No leak found in the combat session: its display objects, canvas, WebGL view, ticker and listeners are all released on exit. The remaining growth is about 0.2 MiB per cycle, and it is tied to the number of requests made, not to how long the match runs.

## Observations and limitations

- **One machine, one run.** Numbers vary between runs. An earlier headed run on the same laptop, before the latest `World.ts` change and under heavier load, is kept in [`profile-results-headed-attempt.json`](profile-results-headed-attempt.json). It measured 720p at 107.8 FPS, p95 16.2 ms, 3.4 % of frames over 16.7 ms. Treat about 5 FPS and a few ms of p95 as noise.
- **Shared, loaded machine.** Another engineer's dev server (port 5173) and Playwright test suites ran on the same laptop at the same time. Machine CPU was 39 to 48 % busy before the runs, even after the script had waited 3 min for it to calm down, and 76 to 88 % busy during them. This makes the results pessimistic. The 1080p result in particular should be re-measured on an idle machine.
- **120 Hz display.** FPS is capped by vsync at about 120, so "mean FPS" does not show how much headroom is left. The share of frames over 16.7 ms and p95 are the metrics that matter for the 60 FPS target.
- **Low entity counts.** The autopilot kills enemies quickly and dies after 35 to 52 s. The load stayed at 4 or fewer enemies alive, 9 or fewer projectiles, and about 175 or fewer display objects. The `maxAlive` 10 limit was never reached, so this is typical combat, not a worst case. A stress test (for example using `spawnEnemy` from the test API to keep 10 enemies alive) was not run.
- **Not a single uninterrupted match.** The 3 minutes cover about 4 matches joined by Play Again. Restarts and end-of-match animations are included in the frame data.
- **Instrumentation overhead.** The measurement itself adds load:
  - The autopilot calls `getState()` about 25 times per second. Each call builds a full snapshot and counts display objects recursively.
  - Playwright's CDP connection, the rAF probe, and the per-second sampling add their own cost.
  - Frame times without the instrumentation should be equal or better.
- **Window state.** The run used a headed window with Chromium's background throttling disabled. A covered window can still be throttled: in an earlier headed 1080p attempt, about 50 s of frames ran at 1 FPS. The script counts about-1 s rAF gaps as `suspectedThrottlingFrames`; there were 0 in the 1080p run and 1 at the end of the 720p run. `--headless` (Chromium's new headless mode) also used the Intel GPU at 120 Hz on this machine, and is available if the desktop cannot be left alone.
- **Screen size.** The reported screen size is the emulated 1280×720 viewport, not the physical panel. deviceScaleFactor was forced to 1, so the game loaded its 1x assets.
- **GPU memory** is not visible from the page and was not measured.
