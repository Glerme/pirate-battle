# Architecture

## Layout
```
src/app        App + routes          src/screens  MainMenu, Options, Play, Result, touch controls
src/ui         presentational UI     src/settings options / player id / last result (localStorage)
src/game       config, types, session, sim/, input/, render/, assets/, audio/, GameCanvas
src/api        contracts, axios client, TanStack hooks, outbox     src/mocks  MSW handlers, db, scenarios
```
`src/main.tsx` awaits `enableMocks()`, creates the `QueryClient`, starts the match outbox, then renders `<StrictMode><QueryClientProvider><App/>`.

## React / Pixi integration
`GameCanvas` (React) owns one effect keyed by `(config, seed)`: `loadGameAssets` → `renderer.init(container)` → `createGameSession` → `session.start()`, then publishes the session through `onSession`. Cleanup sets a `cancelled` flag and destroys session then renderer, so StrictMode's mount→unmount→mount leaves exactly one canvas; `Application.init` is async and the renderer tears the app down itself if destroyed mid-init. Load progress/errors go to `onLoadState`; its `retry` re-runs the flow with `Assets.unloadBundle` first (no remount). The Pixi `Application` uses `autoStart: false`: the session calls `renderer.render()` once per frame. React never renders per frame: the HUD reads `HudStore` through `useSyncExternalStore`, and the store only publishes when score, hp, whole seconds or status change.

## Simulation loop
`session.ts` runs its own `requestAnimationFrame` and feeds the elapsed time (clamped to 250 ms) to `Simulation.advance`, which runs fixed 1/60 s steps from an accumulator and returns `alpha` for render interpolation (`prevX/prevY/prevRotation`). All timers (cooldowns, projectile life, spawn, match clock) use the simulation clock (`simTimeMs`), so they freeze on pause. Pause stops the loop and releases input; resume zeroes the accumulator. In test mode (`?test=1`) rAF is off and `window.__pirate.advance(ms)` steps the same code. Randomness is a seeded LCG (`?seed=`); spawn points are authored data.

## Collisions
Ships and projectiles are circles; islands are axis-aligned rectangles derived from solid tiles (`sim/map.ts`, `sim/geometry.ts`). Ships are pushed out of rectangles and clamped to the arena; projectiles die on islands, targets or leaving the arena or expiring (splash event). A `spent` flag guarantees single damage; a dead enemy is removed from AI, collisions and weapons in the same step. Chasers steer with short "feelers" around islands.

## Resource lifecycle
Atlas textures live in the Pixi `Assets` cache across matches (retry unloads and reloads the bundle); views, pools, generated textures, observers and the `Application` are destroyed with the renderer. Session `destroy()` removes `blur`/`visibilitychange`/key listeners and cancels the frame. Restart = new session, new snapshot, new seed.

## Local persistence (all versioned, guarded against blocked/corrupt storage)
`pirate.options.v1`, `pirate.playerId.v1` (UUID), `pirate.lastResult.v1` (shown again after refreshing `/result`), `pirate.muted` (audio module), `pendingMatches` (outbox), and the mock server state (`pirate.mock*`, confirmed matches) kept apart from the client's outbox.

## Contracts
`src/api/contracts.ts` defines `MatchRecord`, `RankingEntry`, `Page`, routes and `ScenarioId`; `PUT /api/matches/:id` is idempotent (201 created, 200 same record, 409 different payload). Ranking order: score desc, duration asc, endedAt asc, matchId asc, only matches with the same `(sessionTimeSec, spawnIntervalSec)`. `src/game/types.ts` is the sim↔render↔React contract.

## Cache
Query keys are `['ranking', time, spawn, page, size]` and `['history', playerId, page, size]`, so each page/filter has its own entry and an old response cannot land on a newer key; `keepPreviousData` avoids flicker, `refetchOnMount: 'always'` refreshes when a tab is shown, `signal` cancels obsolete requests, retries: ≤3 with backoff and none for permanent 4xx. A successful registration cancels and invalidates both families.

## Outbox recovery
On match end `Play` saves the last result and calls `enqueueMatch(record)` (writes to `pendingMatches` before sending). The record is flushed by the Result screen, on app boot, on `online` and by **Retry**; it is removed only after 200/201. In-flight sends are de-duplicated per `matchId`; if storage is blocked/full the in-memory record is still sent and stays "unpersisted" for manual retry. Play Again never waits for the outbox.

## Balancing decisions
Player is sturdier (10 HP) and faster than any enemy; a broadside (3 shots, 900 ms) trades cooldown for coverage; the Shooter's attack range (420) is just above its preferred range (320) and enemies start with their weapon on cooldown, so nothing fires on spawn; Chasers are fast but frail (2 HP) and their ram does not score, which discourages face-tanking; max 8 enemies keeps short spawn intervals playable.

## Limitations
Mocks run in production (no real backend); one map; sounds are not spatialized; the perf numbers come from headless software rendering (see `docs/perf/report.md`); no persisted history of abandoned matches by design.
