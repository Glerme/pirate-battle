# Pirate Battle

> 🇧🇷 [Versão em português](README.pt-BR.md)

Top-down pirate naval combat in React + Pixi.js. The challenge statement is in [docs/CHALLENGE.md](docs/CHALLENGE.md), the implementation plan in [docs/PLAN.md](docs/PLAN.md).
Design notes: [ARCHITECTURE.md](ARCHITECTURE.md). Asset origin: [ASSETS_LICENSE.md](ASSETS_LICENSE.md). Performance: [docs/perf/report.md](docs/perf/report.md).

**Live demo:** https://pirate-battle-glerme.vercel.app/ (Vercel, Vite preset; `vercel.json` rewrites SPA routes; the MSW mocks run in production)

## Setup

```sh
pnpm install
pnpm dev          # http://localhost:5173
```

| Command | What it does |
|---|---|
| `pnpm dev` | Vite dev server |
| `pnpm build` | `tsc -b` + production build into `dist/` |
| `pnpm preview` | Serves `dist/` on http://localhost:4173 |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc -b --noEmit` |
| `pnpm test:e2e` | Playwright (desktop 1280×720 + Pixel 7 landscape); builds and previews first |
| `pnpm test:sim` / `pnpm test:mocks` | Node self-checks for the simulation / the mock API |
| `pnpm perf` | Performance run on the preview build → `docs/perf/report.{md,json}` |
| `pnpm atlas` | Regenerates the Pixi atlases in `public/assets/` from `assets/` |

Playwright output: the HTML report goes to `playwright-report/` and failure traces/screenshots to `test-results/` (both git-ignored). Open the report with `pnpm exec playwright show-report`; open a trace with `pnpm exec playwright show-trace test-results/<test-dir>/trace.zip`.

A committed copy of the last full run (60 tests, desktop + mobile, all green) is in [docs/reports/playwright/](docs/reports/playwright/index.html).

### Environment variables

| Variable | Default | Effect |
|---|---|---|
| `VITE_ENABLE_MOCKS` | enabled | Set to `false` to skip starting the MSW worker and talk to a real `/api`. The mock worker also runs in the production build (this is a front-end-only delivery). |
| `VITE_API_TIMEOUT_MS` | `5000` | Axios request timeout in ms. Mock timeout scenarios wait this long plus 100 ms. |

## Controls

| Action | Keyboard | Touch (landscape) |
|---|---|---|
| Move forward | `W` / `↑` | forward button |
| Turn left / right | `A` `D` / `←` `→` | turn buttons |
| Fire front cannon | `Space` | front fire button |
| Broadside left / right (3 shots) | `Q` / `E` | side fire buttons |
| Pause | `P` / `Esc`, pause button | pause button |

Buttons can be held together (multitouch). The match pauses automatically when the tab is hidden, the window loses focus, or the device is in portrait; it only resumes through **Resume**. Reloading or leaving `/play` abandons the match (nothing is registered).

## Gameplay configuration

User options (Options screen, persisted in `localStorage`, validated inline):

| Option | Limits | Default |
|---|---|---|
| Game session time | 60–180 s | 120 |
| Enemy spawn time | **1–15 s** | 4 |
| Captain name | 2–16 characters | `Captain` |

Each match takes an immutable snapshot (`createMatchConfig`, `src/game/config.ts`). Everything else is tuned in `DEFAULT_GAME_CONFIG`: arena 1920×1088 logical px; player 10 HP / 220 px/s; Chaser 2 HP, rams for 2 and dies without scoring; Shooter 3 HP, fires from ≤420 px; max 8 enemies alive; the first two spawns are one of each kind; spawns happen ≥400 px from the player on free water. Score = +1 per enemy destroyed by a player projectile.

## Mock API scenarios

Requests to `/api` are served by MSW. Pick a scenario with `?scenario=<id>` (e.g. `/?scenario=timeout`) or in the main menu **Network lab**; the choice persists in `localStorage`. **Reset mock data** (Network lab) restores fixtures (≈40 players), clears registered matches and resets the scenario to `success`. `?seed=<n>` seeds the mock latency RNG (and the simulation, see `/play?seed=`).

| Scenario | How to reproduce / what you see |
|---|---|
| `success` | Normal responses. |
| `empty` | Ranking and history empty → empty state. |
| `many-pages` | Many fixtures → real pagination. |
| `slow` | 1.5 s latency → loading states and the background-refresh indicator. |
| `variable-latency` | Random 100–1100 ms latency (seeded). |
| `out-of-order` | Alternating 900/100 ms latency: page/filter changes resolve out of order; stale answers never overwrite newer ones. |
| `timeout` | Every request exceeds the timeout → error panel with Retry. |
| `network-error` | Connection failure → error panel with Retry. |
| `http-400` | 400 on every call; not retried automatically (permanent error). |
| `http-500` | 500 on every call; retried with backoff, then error panel. |
| `ranking-fail` / `history-fail` | Only that tab fails; the other tab and the game keep working. |
| `register-timeout-after-commit` | The server stores the match but answers after the timeout. Result shows Pending/Failed; **Retry** recovers the existing record (`200`) with no duplicate in Ranking/History. |
| `unavailable-then-recover` | The first match registration fails (503), the next attempt succeeds: finish a match (Pending), reload `/result` or press Retry → Saved. |

API failures never block Play, Options or combat; errors only appear inside the affected panel or the registration status.

While Ranking or Match History is refreshing, the page buttons stay disabled until the response arrives.

## Testing

`?test=1` exposes `window.__pirate` (`getState`, `advance(ms)`, `setSeed`) and switches the sim to a manual clock; helpers are in `tests/e2e/fixtures.ts`. `?inspect=1` exposes the same object (read-only use) while keeping the real-time loop (used by `pnpm perf`).
