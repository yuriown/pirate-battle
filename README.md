# 🏴‍☠️ Pirate Battle — 2D Naval Shooter (React + PixiJS)

> Technical challenge developed for the **Frontend Game Developer** role at **Jungle Gaming**.

Live Demo: [https://pirate-battle-jungle.vercel.app/](https://pirate-battle-jungle.vercel.app/)  
Repository: [https://github.com/yuriown/pirate-battle](https://github.com/yuriown/pirate-battle)

---

## 🌟 Overview & Highlights

**Pirate Battle** is an interactive, top-down 2D naval combat simulator built with **React 18**, **TypeScript (Strict Mode)**, **PixiJS v8**, **TanStack Query (v5)**, **Axios**, **MSW (Mock Service Worker)**, and **Playwright**.

### Key Technical Achievements:
- **60 FPS Decoupled WebGL2 Rendering**: Pixi.js v8 scene graph rendered smoothly on Canvas, completely decoupled from React's render tree to prevent UI state re-render overhead.
- **Nautical Physics with Inertia & Collision Resolution**: Acceleration, drag, hull rotation, and precise obstacle avoidance against tropical islands via SAT (Separating Axis Theorem) and circle collision math.
- **Smart Enemy AI Behaviors**:
  - **Chaser**: Aggressive raider sloop navigating through obstacles, pursuing the player, and ramming on impact.
  - **Shooter**: Tactical frigate keeping optimal firing range (320px) and firing broadside salvos whenever line-of-sight is unobstructed.
- **Procedural Web Audio API Sound Synth**: 100% autonomous audio synthesis via `OscillatorNode` and `GainNode` (cannon booms, triple broadsides, ship creaks, explosions, victory shanties).
- **Network Resilience with MSW & TanStack Query**: Authoritative REST mock APIs (`/api/ranking`, `/api/matches`) with variable latency, error 500, timeouts, idempotent match submissions, and offline storage recovery.
- **12 Comprehensive E2E Playwright Tests**: Complete coverage of gameplay, combat, options, tab loss pause, ranking/history pagination, and network failure recovery.

---

## 🎮 Combat Controls

| Action | Desktop Key | Mobile Touch |
| :--- | :--- | :--- |
| **Sail Forward** | `W` / `↑ Arrow` | Virtual Joystick (Up) |
| **Steer Left / Right** | `A` / `D` / `← / →` | Virtual Joystick (Left/Right) |
| **Front Cannon (1x)** | `Space` / `J` | "Front Cannon" Button |
| **Port Broadside (3x)** | `K` | "Port Salvo" Button |
| **Starboard Broadside (3x)** | `L` | "Starboard Salvo" Button |
| **Pause Battle** | `Esc` / `P` | Top Pause Icon |

---

## 🛠️ Tech Stack

- **UI & Menus**: React 18, Tailwind CSS, Lucide Icons, Canvas Confetti
- **Game Engine**: PixiJS (v8.6+ WebGL2 / WebGPU)
- **Remote State**: TanStack Query (React Query v5)
- **HTTP Client**: Axios
- **Mock Service Layer**: Mock Service Worker (MSW v2)
- **E2E Testing**: Playwright
- **Build Tool**: Vite 6, TypeScript 5 (Strict)

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/yuriown/pirate-battle.git
cd pirate-battle

# Install dependencies
npm install
```

### 3. Development Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 4. Build for Production
```bash
npm run build
npm run preview
```

---

## 🧪 Testing with Playwright

Run the automated E2E test suite covering all 12 evaluation criteria:

```bash
# Run all E2E tests
npm run test:e2e

# View interactive HTML test report
npm run test:report
```

---

## 📡 MSW Network Simulation Scenarios

Use the **MSW Network Dev Panel** (top-right badge in the navbar) to inject real-world network conditions in real time:

1. **Default (Fast 100ms)**: Instant responses with natural network jitter.
2. **Slow Network (1.2s - 1.6s)**: Simulates 3G connections for loading states.
3. **High Latency (2.5s+)**: Verifies non-blocking background fetching and optimistic updates.
4. **HTTP 500 Internal Error**: Tests query error boundaries and manual retry buttons.
5. **Network Timeout (>5s)**: Validates client timeout handling and offline queuing.
6. **Offline / Disconnected**: Tests offline persistence without match loss.
7. **Empty Data Response**: Tests empty state UI components.

---

## 📄 License
MIT License. Developed for Jungle Gaming Technical Assessment.
