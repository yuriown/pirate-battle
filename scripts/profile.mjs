#!/usr/bin/env node
// Combat performance profile (brief section 9).
//
// Builds the production bundle, serves it with `vite preview`, drives real matches in Chromium
// through Playwright with real keyboard input and the real clock, and writes raw evidence to
// docs/performance/. The human report (PERFORMANCE.md) is written from these results.
//
// Usage: npm run profile [-- --skip-build] [-- --headless] [-- --no-1080p] [-- --duration=180]
//        [-- --cycles=5] [-- --cycle-play=20]
//
// Nothing here changes game code: it only uses the `?e2e` instrumentation (window.__PB__).

import { spawn, execFileSync, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'docs', 'performance');
const PORT = 4173;
const BASE = `http://localhost:${PORT}`;
const SEED = 42;

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, def) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : def;
};
const CFG = {
  skipBuild: flag('skip-build'),
  headless: flag('headless'),
  with1080p: !flag('no-1080p'),
  durationSec: opt('duration', 180),
  spawnIntervalSec: 3,
  cycles: opt('cycles', 5),
  cyclePlaySec: opt('cycle-play', 20),
  skipMemory: flag('skip-memory'),
};

const log = (...a) => console.log(`[profile ${new Date().toISOString().slice(11, 19)}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ stats helpers

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}
const round = (v, d = 2) => (v == null || !Number.isFinite(v) ? v : Math.round(v * 10 ** d) / 10 ** d);

function frameSummary(samples) {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = samples.reduce((a, b) => a + b, 0);
  const mean = sum / samples.length;
  return {
    frames: samples.length,
    totalMs: round(sum, 1),
    meanFrameMs: round(mean, 3),
    meanFps: round(1000 / mean, 2),
    p50Ms: round(percentile(sorted, 50), 3),
    p95Ms: round(percentile(sorted, 95), 3),
    p99Ms: round(percentile(sorted, 99), 3),
    maxMs: round(sorted[sorted.length - 1], 3),
    minMs: round(sorted[0], 3),
    pctOver16_7: round((100 * samples.filter((s) => s > 1000 / 60).length) / samples.length, 3),
    pctOver33_3: round((100 * samples.filter((s) => s > 1000 / 30).length) / samples.length, 3),
    countOver50: samples.filter((s) => s > 50).length,
  };
}

function seriesSummary(values) {
  if (!values.length) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return { min: Math.min(...values), max: Math.max(...values), mean: round(sum / values.length, 2) };
}

// ------------------------------------------------------------------ build and server

function build() {
  log('Building production bundle (npm run build)...');
  execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
}

async function startPreview() {
  const viteBin = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(process.execPath, [viteBin, 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`vite preview exited early:\n${output}`);
    try {
      const res = await fetch(BASE);
      if (res.ok) return child;
    } catch {
      // not up yet
    }
    await sleep(300);
  }
  killTree(child);
  throw new Error(`vite preview did not respond within 30 s:\n${output}`);
}

function killTree(child) {
  if (!child || child.exitCode != null) return;
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  } catch {
    // already gone
  }
}


// ------------------------------------------------------------------ machine load

/** Whole-machine CPU busy fraction between two os.cpus() readings (includes this profiler). */
function cpuTimes() {
  return os.cpus().map((c) => ({ ...c.times }));
}
function cpuBusyPct(a, b) {
  let busy = 0;
  let total = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (k) => b[i][k] - a[i][k];
    const t = d('user') + d('nice') + d('sys') + d('idle') + d('irq');
    total += t;
    busy += t - d('idle');
  }
  return total ? round((100 * busy) / total, 1) : null;
}
async function measureIdleCpu(ms = 3000) {
  const a = cpuTimes();
  await sleep(ms);
  return cpuBusyPct(a, cpuTimes());
}

/** Other browser/test processes on the machine (shared workstation: another engineer may be running tests). */
function foreignProcesses() {
  if (process.platform !== 'win32') return null;
  try {
    const out = execFileSync('tasklist', ['/fo', 'csv', '/nh'], { encoding: 'utf8' });
    const names = out.split(/\r?\n/).map((l) => l.split('","')[0]?.replace(/^"/, '')).filter(Boolean);
    const count = (re) => names.filter((n) => re.test(n)).length;
    return { chromeHeadlessShell: count(/^chrome-headless-shell/i), node: count(/^node\.exe$/i), chrome: count(/^chrome\.exe$/i) };
  } catch {
    return null;
  }
}

/** Waits (up to maxWaitMs) until the machine is quiet, so other workloads do not pollute the numbers. */
async function waitForQuietMachine(maxWaitMs = 3 * 60_000, thresholdPct = 30) {
  const start = Date.now();
  let busy = await measureIdleCpu();
  while (busy > thresholdPct && Date.now() - start < maxWaitMs) {
    log(`  machine busy (${busy}% CPU before the run), waiting...`);
    await sleep(10_000);
    busy = await measureIdleCpu();
  }
  return { cpuBusyPctBeforeRun: busy, waitedSec: round((Date.now() - start) / 1000, 0), foreignProcesses: foreignProcesses() };
}

// ------------------------------------------------------------------ browser

const LAUNCH_ARGS = [
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--enable-precise-memory-info',
];

/**
 * Default: a visible (headed) Chromium window, real GPU and display timing. Keep the window
 * uncovered: an occluded window can still be throttled (the rAF probe reports ~1 s gaps as
 * `suspectedThrottlingFrames`). `--headless` uses Chromium's "new" headless mode (channel
 * 'chromium'), which on the reference machine also used the hardware GPU at the display rate.
 */
async function launchBrowser() {
  if (!CFG.headless) {
    const browser = await chromium.launch({ headless: false, args: LAUNCH_ARGS });
    return { browser, mode: 'headed window' };
  }
  const browser = await chromium.launch({ headless: true, channel: 'chromium', args: LAUNCH_ARGS });
  return { browser, mode: "new headless (channel 'chromium'), hardware GPU" };
}

async function newPage(browser, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.addInitScript(
    ([opts]) => {
      try {
        localStorage.setItem('pb.options.v1', JSON.stringify(opts));
      } catch {
        // ignore
      }
      // Attribution log for unexpected pauses: pause keys, clicks, window blur and visibility.
      const log = (window.__pauseClues = []);
      const now = () => Math.round(performance.now());
      window.addEventListener('keydown', (e) => (e.code === 'Escape' || e.code === 'KeyP') && log.push([now(), 'key', e.code, e.isTrusted]), true);
      window.addEventListener('click', (e) => log.push([now(), 'click', e.target?.getAttribute?.('aria-label') || e.target?.textContent?.slice(0, 30), e.isTrusted]), true);
      window.addEventListener('blur', () => log.push([now(), 'window-blur']));
      document.addEventListener('visibilitychange', () => log.push([now(), 'visibility', document.visibilityState]));
    },
    [{ sessionDurationSec: CFG.durationSec, spawnIntervalSec: CFG.spawnIntervalSec }],
  );
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`[${m.type()}] ${m.text()}`.slice(0, 400));
  });
  page.on('pageerror', (e) => consoleErrors.push(`[pageerror] ${e.message}`.slice(0, 400)));
  return { context, page, consoleErrors };
}

async function readEnvironment(page, browser, mode) {
  const pageInfo = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    let renderer = null;
    let vendor = null;
    let version = null;
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
      version = gl.getParameter(gl.VERSION);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    // Idle refresh-rate estimate: median rAF interval over ~2 s on the menu.
    const deltas = await new Promise((resolve) => {
      const out = [];
      let last = 0;
      const t0 = performance.now();
      const step = (t) => {
        if (last) out.push(t - last);
        last = t;
        if (t - t0 < 2000) requestAnimationFrame(step);
        else resolve(out);
      };
      requestAnimationFrame(step);
    });
    deltas.sort((a, b) => a - b);
    const median = deltas[Math.floor(deltas.length / 2)];
    return {
      userAgent: navigator.userAgent,
      webgl: { renderer, vendor, version },
      screen: { width: screen.width, height: screen.height, availWidth: screen.availWidth, availHeight: screen.availHeight },
      innerSize: { width: innerWidth, height: innerHeight },
      devicePixelRatio: devicePixelRatio,
      hardwareConcurrency: navigator.hardwareConcurrency,
      idleRafMedianMs: Math.round(median * 1000) / 1000,
      estimatedRefreshHz: Math.round(1000 / median),
    };
  });
  let gpuInfo;
  try {
    const bcdp = await browser.newBrowserCDPSession();
    const info = await bcdp.send('SystemInfo.getInfo');
    gpuInfo = {
      devices: info.gpu.devices.map((d) => ({ vendorString: d.vendorString, deviceString: d.deviceString, driverVersion: d.driverVersion })),
      featureStatus: Object.fromEntries(
        Object.entries(info.gpu.featureStatus || {}).filter(([k]) => /gpu_compositing|webgl|rasterization|video_decode/.test(k)),
      ),
    };
    await bcdp.detach();
  } catch (e) {
    gpuInfo = { error: String(e.message || e) };
  }
  const cpus = os.cpus();
  return {
    date: new Date().toISOString(),
    host: {
      platform: os.platform(),
      release: os.release(),
      osVersion: typeof os.version === 'function' ? os.version() : null,
      arch: os.arch(),
      cpuModel: cpus[0]?.model?.trim(),
      logicalCores: cpus.length,
      totalMemoryGiB: round(os.totalmem() / 1024 ** 3, 1),
      freeMemoryGiBAtStart: round(os.freemem() / 1024 ** 3, 1),
      node: process.version,
    },
    browser: { name: 'Chromium (Playwright bundled)', version: browser.version(), mode, launchArgs: LAUNCH_ARGS },
    playwright: createRequire(import.meta.url)('playwright/package.json').version,
    page: pageInfo,
    gpu: gpuInfo,
  };
}

// ------------------------------------------------------------------ in-page helpers

async function gotoMenu(page) {
  await page.goto(`${BASE}/?e2e&seed=${SEED}`, { waitUntil: 'load' });
  await page.getByRole('button', { name: 'Play', exact: true }).waitFor({ state: 'visible', timeout: 20_000 });
}

async function startMatchFromMenu(page) {
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(() => window.__PB__?.game?.getState().hud.status === 'running', null, { timeout: 30_000 });
  // Make sure no button keeps focus (Space on a focused button would click it).
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
}

const sampleState = (page) =>
  page.evaluate(() => {
    const g = window.__PB__?.game;
    if (!g) return null;
    const s = g.getState();
    return {
      timeSec: s.timeSec,
      status: s.hud.status,
      pauseReason: s.hud.pauseReason,
      endReason: s.endReason,
      health: s.player.health,
      score: s.score,
      enemies: s.enemies.length,
      projectiles: s.projectiles.length,
      displayObjects: s.displayObjects,
      matchIndex: s.hud.matchIndex,
      kills: s.counters.kills,
      rams: s.counters.rams,
      damageTaken: s.counters.playerDamageTaken,
    };
  });

const installRafProbe = (page) =>
  page.evaluate(() => {
    const probe = { deltas: [], last: 0, running: true };
    window.__rafProbe = probe;
    const step = (t) => {
      if (!probe.running) return;
      if (probe.last) probe.deltas.push(t - probe.last);
      probe.last = t;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

const stopRafProbe = (page) =>
  page.evaluate(() => {
    const p = window.__rafProbe;
    if (!p) return [];
    p.running = false;
    return p.deltas;
  });

/** Long rAF gaps (> 50 ms) with their position in the run, to separate hitches from throttling. */
function longFrames(deltas) {
  const out = [];
  let t = 0;
  for (const d of deltas) {
    t += d;
    if (d > 50) out.push({ atSec: round(t / 1000, 2), ms: round(d, 1) });
  }
  return out;
}

// ------------------------------------------------------------------ input driver

/** Runs in the page. Returns which steering keys the autopilot wants held. */
function botDecision() {
  const g = window.__PB__?.game;
  if (!g) return null;
  const s = g.getState();
  const p = s.player;
  const SHOT_SPEED = 620;
  let best = null;
  let bestScore = Infinity;
  for (const e of s.enemies) {
    const dist = Math.hypot(e.x - p.x, e.y - p.y);
    // Chasers inside 800 are the priority threat; otherwise nearest first.
    const score = e.kind === 'chaser' && dist < 800 ? dist - 1000 : dist;
    if (score < bestScore) {
      bestScore = score;
      best = { e, dist };
    }
  }
  if (!best) return { turn: null, forward: false };
  const { e, dist } = best;
  // Evade: a chaser about to ram -> full speed, turn away from it (chasers turn slower than the
  // player); the held broadsides (Q/E) fire at it as it passes alongside.
  if (e.kind === 'chaser' && dist < 260) {
    let rel = Math.atan2(e.y - p.y, e.x - p.x) - p.rotation;
    while (rel > Math.PI) rel -= 2 * Math.PI;
    while (rel < -Math.PI) rel += 2 * Math.PI;
    if (Math.abs(rel) < Math.PI / 2) return { turn: rel > 0 ? 'KeyA' : 'KeyD', forward: true };
  }
  // Lead the target: first-order intercept using its current heading and speed.
  const t = dist / SHOT_SPEED;
  const tx = e.x + Math.cos(e.rotation) * e.speed * t;
  const ty = e.y + Math.sin(e.rotation) * e.speed * t;
  let diff = Math.atan2(ty - p.y, tx - p.x) - p.rotation;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  const dead = 0.05;
  const turn = diff > dead ? 'KeyD' : diff < -dead ? 'KeyA' : null;
  // Hold position once something is in cannon range; close in otherwise.
  // Keep moving while a shooter can reach us (a stationary ship is an easy target).
  const shooterInRange = s.enemies.some((o) => o.kind === 'shooter' && Math.hypot(o.x - p.x, o.y - p.y) < 480);
  // Stand off (stop) only when the target is a shooter we outrange; otherwise keep sailing,
  // which also keeps the ship fast enough to out-turn a chaser.
  const standOff = e.kind === 'shooter' && dist < 650 && !shooterInRange;
  const forward = !standOff;
  return { turn, forward };
}

/**
 * Holds W (forward), Space (bow cannon), Q and E (broadsides) the whole time and weaves:
 * `weave`  = 3 s left turn, 1 s straight, 3 s right turn, 1 s straight (repeat)
 * `circle` = constant left turn (tight circle), which keeps the ship away from rams.
 * `aim`    = autopilot: every ~100 ms reads enemy positions through the test API and presses
 *            A/D to point the bow at the nearest threat (chasers closing in first).
 */
function startDriver(page, pattern) {
  let stopped = false;
  const held = new Set();
  const down = async (k) => {
    if (held.has(k)) return;
    held.add(k);
    await page.keyboard.down(k);
  };
  const up = async (k) => {
    if (!held.has(k)) return;
    held.delete(k);
    await page.keyboard.up(k);
  };
  const done = (async () => {
    for (const k of ['KeyW', 'Space', 'KeyQ', 'KeyE']) await down(k);
    const t0 = Date.now();
    while (!stopped) {
      const t = ((Date.now() - t0) / 1000) % 8;
      let turn = null;
      let forward = true;
      if (pattern === 'aim') {
        // Autopilot: read positions (observation only) and decide which keys to hold. The ship
        // itself is still driven only by key presses. Tactics: the bow cannon (range 620) outranges
        // the shooters (460), so stop and shoot anything within ~650, leading the target; chasers
        // closing in take priority; with nothing in range, sail toward the nearest enemy.
        const d = await page.evaluate(botDecision).catch(() => null);
        if (d) {
          turn = d.turn;
          forward = d.forward;
        }      } else if (pattern === 'circle') turn = 'KeyA';
      else if (t < 3) turn = 'KeyA';
      else if (t >= 4 && t < 7) turn = 'KeyD';
      for (const k of ['KeyA', 'KeyD']) if (k !== turn) await up(k).catch(() => {});
      if (turn) await down(turn).catch(() => {});
      if (forward) await down('KeyW').catch(() => {});
      else await up('KeyW').catch(() => {});
      await sleep(pattern === 'aim' ? 40 : 100);
    }
  })();
  return {
    held,
    async stop() {
      stopped = true;
      await done.catch(() => {});
      for (const k of [...held]) await up(k).catch(() => {});
    },
    /** Re-press everything after a pause (the game discards held input on pause/resume). */
    async repress() {
      const keys = [...held];
      for (const k of keys) {
        held.delete(k);
        await page.keyboard.up(k).catch(() => {});
      }
      for (const k of keys) await down(k).catch(() => {});
    },
  };
}

// ------------------------------------------------------------------ 3-minute match

/**
 * Measures CFG.durationSec seconds of active combat. The match is configured to last that long; if the
 * player is destroyed earlier, the run records that match as a segment, presses "Play Again" (the
 * in-place restart path) and keeps measuring until the cumulative active play time reaches the
 * target, so the frame/entity statistics always cover a full three minutes of combat.
 */
async function runMatch(browser, { label, viewport, pattern }) {
  log(`Match "${label}" (${viewport.width}x${viewport.height}, pattern=${pattern}, ${CFG.durationSec} s)...`);
  const machineBefore = await waitForQuietMachine();
  const { context, page, consoleErrors } = await newPage(browser, viewport);
  await gotoMenu(page);
  await startMatchFromMenu(page);

  const pixiSamples = [];
  const pullFrameStats = async () => {
    const fs = await page.evaluate(() => {
      const g = window.__PB__?.game;
      if (!g) return null;
      const s = g.frameStats();
      g.resetFrameStats();
      return s;
    });
    if (fs) pixiSamples.push(...fs.frameMsSamples);
  };

  await page.evaluate(() => window.__PB__.game.resetFrameStats());
  await installRafProbe(page);
  const driver = startDriver(page, pattern);
  const wallStart = Date.now();
  const cpuStart = cpuTimes();

  const perSecond = [];
  const pauses = [];
  let lastPull = Date.now();
  let final;
  const wallLimitMs = (CFG.durationSec + 180) * 1000;
  const segments = [];
  let doneTime = 0; // active game time of finished segments

  while (true) {
    await sleep(1000);
    const s = await sampleState(page);
    if (!s) {
      final = { error: 'test API disappeared' };
      break;
    }
    perSecond.push({ wallSec: round((Date.now() - wallStart) / 1000, 2), ...s, timeSec: round(s.timeSec, 2), health: round(s.health, 1) });
    if (s.status === 'paused') {
      const clues = await page.evaluate(() => window.__pauseClues?.slice(-5) ?? []);
      pauses.push({ atGameSec: round(s.timeSec, 2), reason: s.pauseReason, clues });
      log(`  paused (${s.pauseReason}) at ${s.timeSec.toFixed(1)} s, resuming`);
      await page.getByRole('button', { name: 'Resume' }).click().catch(() => {});
      await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
      await driver.repress();
    }
    // Pull (and reset) the ticker samples every 30 s so the in-game 20 000-sample cap is never hit.
    if (Date.now() - lastPull > 30_000) {
      await pullFrameStats();
      lastPull = Date.now();
    }
    if (s.status === 'ended') {
      segments.push({ matchIndex: s.matchIndex, endReason: s.endReason, gameTimeSec: round(s.timeSec, 2), score: s.score, kills: s.kills, rams: s.rams, damageTaken: s.damageTaken });
      doneTime += s.timeSec;
      if (s.endReason === 'destroyed' && doneTime < CFG.durationSec - 0.5) {
        log(`  player destroyed at ${s.timeSec.toFixed(1)} s (cumulative ${doneTime.toFixed(1)} s), Play Again`);
        await page.getByTestId('result-dialog').getByRole('button', { name: 'Play Again' }).click({ timeout: 10_000 });
        await page.waitForFunction(() => window.__PB__?.game?.getState().hud.status === 'running', null, { timeout: 10_000 });
        await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
        await driver.repress();
        continue;
      }
      final = s;
      break;
    }
    if (doneTime + s.timeSec >= CFG.durationSec) {
      segments.push({ matchIndex: s.matchIndex, endReason: null, stillRunning: true, gameTimeSec: round(s.timeSec, 2), score: s.score, kills: s.kills, rams: s.rams, damageTaken: s.damageTaken });
      doneTime += s.timeSec;
      final = { ...s, note: 'measurement window complete while the (restarted) match was still running' };
      break;
    }
    if (Date.now() - wallStart > wallLimitMs) {
      final = { ...s, error: 'wall-clock limit reached before the match ended' };
      break;
    }
    if (perSecond.length % 30 === 0) log(`  cumulative=${(doneTime + s.timeSec).toFixed(0)} s t=${s.timeSec.toFixed(0)} s enemies=${s.enemies} projectiles=${s.projectiles} hp=${s.health.toFixed(0)} score=${s.score}`);
  }
  await driver.stop();
  const rafDeltas = await stopRafProbe(page);
  await pullFrameStats();
  const wallSec = (Date.now() - wallStart) / 1000;
  const machine = { ...machineBefore, cpuBusyPctDuringRun: cpuBusyPct(cpuStart, cpuTimes()), foreignProcessesAfter: foreignProcesses() };
  const resultDialog = await page.getByTestId('result-dialog').isVisible().catch(() => false);
  await context.close();

  // The last samples may include the frozen "ended" frames; keep only while-running seconds for entity stats.
  const running = perSecond.filter((p) => p.status === 'running');
  const result = {
    label,
    viewport,
    deviceScaleFactor: 1,
    pattern,
    config: { sessionDurationSec: CFG.durationSec, spawnIntervalSec: CFG.spawnIntervalSec, seed: SEED, clock: 'real' },
    outcome: {
      endReason: final?.endReason ?? null,
      error: final?.error ?? null,
      gameTimeSec: round(final?.timeSec, 2),
      cumulativeActiveSec: round(doneTime, 2),
      firstMatchSurvivedFull: segments[0]?.endReason === 'time_up',
      firstMatchEnd: segments[0] ? { endReason: segments[0].endReason, gameTimeSec: segments[0].gameTimeSec } : null,
      segments,
      note: final?.note ?? null,
      wallSec: round(wallSec, 1),
      finalScore: final?.score ?? null,
      finalHealth: round(final?.health, 1),
      resultDialogShown: resultDialog,
      pauses,
    },
    machine,
    pixiTicker: frameSummary(pixiSamples),
    rafProbe: frameSummary(rafDeltas),
    rafLongFrames: longFrames(rafDeltas),
    // ~1 s rAF gaps are the browser throttling a covered/hidden window, not game work.
    suspectedThrottlingFrames: rafDeltas.filter((d) => d > 900).length,
    entities: {
      samples: running.length,
      enemies: seriesSummary(running.map((p) => p.enemies)),
      projectiles: seriesSummary(running.map((p) => p.projectiles)),
      displayObjects: seriesSummary(running.map((p) => p.displayObjects)),
    },
    consoleErrors,
    perSecond,
  };
  log(
    `  done: end=${result.outcome.endReason} t=${result.outcome.gameTimeSec}s fps=${result.pixiTicker?.meanFps} p95=${result.pixiTicker?.p95Ms}ms raf-fps=${result.rafProbe?.meanFps}`,
  );
  return result;
}

// ------------------------------------------------------------------ memory cycles

async function heapClassCounts(cdp) {
  const chunks = [];
  const onChunk = (e) => chunks.push(e.chunk);
  cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
  const snap = JSON.parse(chunks.join(''));
  const meta = snap.snapshot.meta;
  const fields = meta.node_fields;
  const nf = fields.length;
  const typeIdx = fields.indexOf('type');
  const nameIdx = fields.indexOf('name');
  const sizeIdx = fields.indexOf('self_size');
  const types = meta.node_types[typeIdx];
  const counts = new Map();
  const nodes = snap.nodes;
  for (let i = 0; i < nodes.length; i += nf) {
    const type = types[nodes[i + typeIdx]];
    if (type !== 'object' && type !== 'closure' && type !== 'native') continue;
    const name = `${type === 'closure' ? '(closure) ' : type === 'native' ? '(native) ' : ''}${snap.strings[nodes[i + nameIdx]]}`;
    const c = counts.get(name) || { count: 0, selfSize: 0 };
    c.count++;
    c.selfSize += nodes[i + sizeIdx];
    counts.set(name, c);
  }
  return { totalNodes: nodes.length / nf, counts };
}

function diffClassCounts(a, b, top = 25) {
  const names = new Set([...a.counts.keys(), ...b.counts.keys()]);
  const rows = [];
  for (const n of names) {
    const ca = a.counts.get(n) || { count: 0, selfSize: 0 };
    const cb = b.counts.get(n) || { count: 0, selfSize: 0 };
    if (cb.count !== ca.count) rows.push({ name: n, before: ca.count, after: cb.count, delta: cb.count - ca.count, selfSizeDelta: cb.selfSize - ca.selfSize });
  }
  rows.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  return { totalNodesBefore: a.totalNodes, totalNodesAfter: b.totalNodes, top: rows.slice(0, top) };
}

async function memorySample(page, cdp, label) {
  // Two GC passes: the first can leave finalizer-reachable objects for the second.
  await cdp.send('HeapProfiler.collectGarbage');
  await sleep(200);
  await cdp.send('HeapProfiler.collectGarbage');
  await sleep(300);
  const heap = await cdp.send('Runtime.getHeapUsage');
  const dom = await cdp.send('Memory.getDOMCounters');
  const pageSide = await page.evaluate(() => ({
    usedJSHeapSize: performance.memory?.usedJSHeapSize ?? null,
    totalJSHeapSize: performance.memory?.totalJSHeapSize ?? null,
    canvases: document.querySelectorAll('canvas').length,
    resourceTimingEntries: performance.getEntriesByType('resource').length,
    testApiPresent: !!window.__PB__?.game,
  }));
  return {
    label,
    usedJSHeapSize: pageSide.usedJSHeapSize,
    totalJSHeapSize: pageSide.totalJSHeapSize,
    cdpUsedSize: heap.usedSize,
    cdpTotalSize: heap.totalSize,
    documents: dom.documents,
    nodes: dom.nodes,
    jsEventListeners: dom.jsEventListeners,
    canvases: pageSide.canvases,
    resourceTimingEntries: pageSide.resourceTimingEntries,
    testApiPresent: pageSide.testApiPresent,
  };
}

async function runMemoryCycles(browser) {
  log(`Memory: ${CFG.cycles} cycles of menu -> Play -> ${CFG.cyclePlaySec} s -> pause -> Main Menu...`);
  const machine = await waitForQuietMachine();
  const { context, page, consoleErrors } = await newPage(browser, { width: 1280, height: 720 });
  const cdp = await context.newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  let requests = [];
  page.on('request', (r) => requests.push(new URL(r.url()).pathname));
  await gotoMenu(page);
  await sleep(1000);
  const samples = [await memorySample(page, cdp, 'baseline (menu, before cycle 1)')];
  const cycles = [];
  let snapAfter1 = null;
  let snapAfterLast = null;
  for (let i = 1; i <= CFG.cycles; i++) {
    requests = [];
    await startMatchFromMenu(page);
    const matchIndex = await page.evaluate(() => window.__PB__.game.getState().hud.matchIndex);
    const driver = startDriver(page, 'aim');
    let peak = { enemies: 0, projectiles: 0, displayObjects: 0 };
    for (let s = 0; s < CFG.cyclePlaySec; s++) {
      await sleep(1000);
      const st = await sampleState(page);
      if (!st) break;
      peak = {
        enemies: Math.max(peak.enemies, st.enemies),
        projectiles: Math.max(peak.projectiles, st.projectiles),
        displayObjects: Math.max(peak.displayObjects, st.displayObjects),
      };
      if (st.status !== 'running') break;
    }
    await driver.stop();
    const st = await sampleState(page);
    if (st?.status === 'running') await page.getByRole('button', { name: 'Pause (Esc)' }).click();
    if (st?.status === 'ended') {
      await page.getByTestId('result-dialog').getByRole('button', { name: 'Main Menu' }).click();
    } else {
      await page.getByTestId('pause-dialog').getByRole('button', { name: 'Main Menu' }).click();
    }
    await page.getByRole('button', { name: 'Play', exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
    await sleep(500);
    const byPath = {};
    for (const r of requests) byPath[r] = (byPath[r] || 0) + 1;
    cycles.push({ cycle: i, matchIndex, gameTimeSec: round(st?.timeSec, 1), endStatus: st?.status, peak, requests: requests.length, requestsByPath: byPath });
    samples.push(await memorySample(page, cdp, `after cycle ${i}`));
    log(`  cycle ${i}: heap=${(samples.at(-1).cdpUsedSize / 1048576).toFixed(2)} MiB nodes=${samples.at(-1).nodes} listeners=${samples.at(-1).jsEventListeners} canvases=${samples.at(-1).canvases}`);
    if (i === 1) snapAfter1 = await heapClassCounts(cdp);
    if (i === CFG.cycles) snapAfterLast = await heapClassCounts(cdp);
  }
  await context.close();

  const mib = (b) => round(b / 1048576, 3);
  const base = samples[0];
  const after1 = samples[1];
  const last = samples.at(-1);
  const steps = samples.slice(2).map((s, i) => s.cdpUsedSize - samples[i + 1].cdpUsedSize);
  return {
    viewport: { width: 1280, height: 720 },
    machine,
    cyclePlaySec: CFG.cyclePlaySec,
    cycles,
    samples,
    summary: {
      baselineMiB: mib(base.cdpUsedSize),
      afterCycle1MiB: mib(after1.cdpUsedSize),
      afterLastMiB: mib(last.cdpUsedSize),
      deltaBaselineToLastMiB: mib(last.cdpUsedSize - base.cdpUsedSize),
      deltaCycle1ToLastMiB: mib(last.cdpUsedSize - after1.cdpUsedSize),
      perCycleStepsAfterCycle1MiB: steps.map(mib),
      nodesSeries: samples.map((s) => s.nodes),
      listenersSeries: samples.map((s) => s.jsEventListeners),
      canvasesSeries: samples.map((s) => s.canvases),
      documentsSeries: samples.map((s) => s.documents),
    },
    heapClassDiffCycle1ToLast: snapAfter1 && snapAfterLast ? diffClassCounts(snapAfter1, snapAfterLast) : null,
    consoleErrors,
  };
}

// ------------------------------------------------------------------ main

function toCsv(run) {
  const cols = ['wallSec', 'timeSec', 'status', 'enemies', 'projectiles', 'displayObjects', 'health', 'score', 'kills', 'rams', 'damageTaken'];
  return [cols.join(','), ...run.perSecond.map((r) => cols.map((c) => r[c]).join(','))].join('\n') + '\n';
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  if (!CFG.skipBuild) build();
  log('Starting vite preview...');
  const server = await startPreview();
  let browser;
  const results = { generatedBy: 'scripts/profile.mjs', config: CFG, environment: null, matches: [], memory: null, notes: [] };
  const save = () => writeFileSync(path.join(OUT_DIR, 'profile-results.json'), JSON.stringify(results, null, 2));
  try {
    const launched = await launchBrowser();
    browser = launched.browser;
    {
      const { context, page } = await newPage(browser, { width: 1280, height: 720 });
      await gotoMenu(page);
      results.environment = await readEnvironment(page, browser, launched.mode);
      await context.close();
    }
    log('Environment:', results.environment.browser.mode, results.environment.browser.version, '|', results.environment.page.webgl.renderer);
    save();

    const hd = { width: 1280, height: 720 };
    const chosen = 'aim';
    results.matches.push(await runMatch(browser, { label: '720p-aim', viewport: hd, pattern: chosen }));
    save();
    if (CFG.with1080p) {
      results.matches.push(await runMatch(browser, { label: `1080p-${chosen}`, viewport: { width: 1920, height: 1080 }, pattern: chosen }));
      save();
    }
    if (!CFG.skipMemory) results.memory = await runMemoryCycles(browser);
    save();
    for (const m of results.matches) writeFileSync(path.join(OUT_DIR, `per-second-${m.label}.csv`), toCsv(m));
    log(`Wrote ${path.relative(ROOT, OUT_DIR)}/profile-results.json and per-second CSVs.`);
  } finally {
    save();
    await browser?.close().catch(() => {});
    killTree(server);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
