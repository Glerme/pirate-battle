# Pirate Battle — Plano mestre de implementação

## Contexto
O repositório contém apenas `README.md` (enunciado do desafio), `.gitignore` e `assets/` (pack estilo Kenney: navios prontos `ship_1..24` = 6 cores × 4 estados de dano, partes, efeitos `explosion_1..3`/`fire_1..2`, `tiles_sheet.png` 64×64 (96 tiles), atlas Starling XML `ships_miscellaneous_sheet*.xml`, atlas de UI em JSON Pixi‑compatível `ui_sheet*.json` com `borders`/`ui.layout`, 25 WAVs, e mockups `sample_*.png`). Não há código. Objetivo: entregar o jogo completo com a maior aderência possível ao README, fase a fase, cada fase com critério de pronto. Decisões confirmadas: **deploy na Vercel**, **jogador identificado por UUID local + "Captain name" editável em Options**, **plano mestre único em fases**.

**Estimativa (exigida pelo README antes de começar): 2 dias**, com execução paralela via skill PM (Orca). As fases F0–F7 abaixo são a spec técnica. A seção "Orquestração PM" mostra como elas viram tarefas.

## Orquestração PM (Orca)
Pré-checagem: terminal Orca ativo, `gemini-4-argon-medium` disponível, Ponytail presente em Claude Code e Codex. **Ponytail não foi encontrado no Antigravity** (avisar o usuário antes de despachar `antigravity`).
Antes do despacho (é setup, não código de tarefa): `git init` + commit inicial com `assets/`, `README.md` e `.gitignore`, já que `--worktree new-child` precisa de repositório git.

**Contratos congelados no T0** (todas as tarefas paralelas importam, nenhuma edita): `src/game/types.ts` (estado da sim lido pelo renderer, `GameSessionApi`, `MatchResult`, `HudSnapshot`), `src/game/config.ts`, `src/api/contracts.ts`, `tests/e2e/fixtures.ts`. Mudança de contrato vira `question` para o PM.

| # | Tarefa | Perfil | Depende de | Arquivos (exclusivos) | Pronto quando |
|---|---|---|---|---|---|
| T0 | Scaffold + contratos (F0 + config/types de F1 + convert-atlas) | sonnet (`--worktree current`) | - | raiz (package.json, tsconfig, vite, eslint, playwright.config, vercel.json), `scripts/convert-atlas.ts`, `public/assets/`, contratos acima, esqueleto de pastas | lint, typecheck, build verdes; atlas convertidos; commit feito |
| T1 | Simulação + input + sessão (F2 + pausa + testing.ts) | codex | T0 | `src/game/sim/**`, `src/game/input/**`, `src/game/session.ts`, `src/game/hudStore.ts`, `src/game/testing.ts` | todas as regras de F2 implementadas; sim roda sem Pixi; `advance(ms)` determinístico com seed |
| T2 | Render Pixi + assets + áudio (F1 loader + F3 render/efeitos) | sonnet | T0 | `src/game/render/**`, `src/game/assets/**`, `src/game/audio/**`, `src/game/GameCanvas.tsx` | carrega com progresso e Retry; desenha mapa, navios com 4 estados de dano, barras de vida, efeitos; destroy limpo em StrictMode |
| T3 | Telas React + opções + a11y (F4) | sonnet | T0 | `src/app/**`, `src/ui/**`, `src/screens/**`, `src/settings/**`, `src/main.tsx`, `index.html` | todas as telas da seção 3; HUD via `useSyncExternalStore`; toque multitouch; diálogos com focus trap; overlay de retrato |
| T4 | API + TanStack + MSW + outbox (F5) | codex | T0 | `src/api/**` (menos contracts.ts), `src/mocks/**` | 14 cenários reproduzíveis; PUT idempotente; outbox sobrevive refresh; Network lab acionável por API exportada |
| T5 | Integração + perf + docs + deploy (F7) | sonnet | T1–T4 com merge | ligações entre módulos, `scripts/perf.ts`, `docs/**`, `README.md`, `ARCHITECTURE.md`, `ASSETS_LICENSE.md` | partida completa no preview, console limpo, relatório de perf, URL Vercel funcionando |
| Testes: jogo | specs 02–07 | antigravity | T5 | `tests/e2e/game/**` | specs verdes desktop + mobile |
| Testes: API | specs 10–12 | antigravity | T5 | `tests/e2e/api/**` | idem |
| Testes: UI | specs 01, 08, 09 + `visual.spec.ts` e baselines | antigravity | T5 | `tests/e2e/ui/**`, `tests/e2e/__screenshots__/**` | idem, baselines versionadas |
| Visual: telas | menu, options, ranking/histórico (loading/vazio/erro), resultado | antigravity | Testes: UI | nenhum (só leitura) | cada item conferido com evidência |
| Visual: arena | combate, HUD, pausa, toque mobile | antigravity | Testes: jogo | nenhum | idem |

Desvio consciente da skill: os testes e as verificações visuais rodam no worktree do T5 (integrado), não no worktree de cada tarefa, porque o Playwright E2E precisa do app inteiro montado. Cada tarefa T1–T4 ainda passa pelo Reviewer no próprio worktree antes do merge (gate "yes" do usuário).

**Agenda de 2 dias:** Dia 1: T0 (manhã), T1–T4 em paralelo, reviews e gates. Dia 2: T5 integração, as 3 tarefas de testes em paralelo, visuais, correções, perf e deploy.

Toda spec de worker termina com: "No worker_done, inclua uma seção 'Pulado/riscos' com o que o Ponytail deixou de fora, o que não foi verificado e riscos." A spec de cada tarefa = fase correspondente deste documento + linha da tabela.

## Stack e ferramentas
Vite + React 18 + TypeScript `strict` (+ `noUncheckedIndexedAccess`), `pixi.js` v8, `@tanstack/react-query` v5 (+ devtools só em dev), `axios`, `msw` v2 (worker também em produção), `@playwright/test`, `react-router-dom` (rotas `/`, `/options`, `/play`, `/result`), ESLint (typescript-eslint + react-hooks), pnpm (lockfile versionado). Sem lib de estado global: store externo mínimo + `useSyncExternalStore`. Áudio via Web Audio nativo (sem dependência).

## Estrutura de pastas (alvo)
```
src/
  app/            App, rotas, QueryClient, providers, layout responsivo, orientação
  ui/             componentes React (Panel/Button com sprites do ui_sheet, Dialog, Tabs, Pagination, LiveRegion)
  screens/        MainMenu, Options, Play (GameScreen), Result
  settings/       schema + validação + persistência das opções (localStorage)
  game/
    config.ts     GameConfig tipado (todos os parâmetros de balanceamento) + limites + snapshot
    sim/          regras puras, sem Pixi/DOM: world, entities, systems/*, rng (seed), math, events
    input/        InputState (teclado + toque), mapeamento de ações, reset em pausa
    render/       PixiRenderer, views por entidade (pool), health bars, efeitos, tilemap, escala
    assets/       manifest, carregamento com progresso, retry, cache de texturas
    audio/        SoundManager (Web Audio, mute persistido)
    session.ts    GameSession: liga Pixi app + ticker + sim + renderer + input; start/pause/resume/destroy
    hudStore.ts   snapshot do HUD publicado só quando muda (score, hp, segundos, status)
    testing.ts    instrumentação de teste (window.__pirate) habilitada por query/env
  api/            contracts.ts, client.ts (axios), queries.ts (hooks TanStack), outbox.ts (registros pendentes)
  mocks/          handlers.ts, db.ts (persistência localStorage), fixtures.ts, scenarios.ts, browser.ts
scripts/          convert-atlas.ts (XML Starling → JSON Pixi), perf.ts
public/assets/    assets otimizados + atlas convertidos; public/mockServiceWorker.js
tests/e2e/        specs 01..12 + visual.spec.ts + fixtures/helpers
docs/perf/        relatórios de profiling
README.md (substituído pela documentação da solução; enunciado movido para docs/CHALLENGE.md), ARCHITECTURE.md, ASSETS_LICENSE.md
```

---

## Fase 0 — Scaffold (0,5 dia)
- `pnpm create vite` (react-ts) na raiz; mover enunciado para `docs/CHALLENGE.md`; `git init`.
- tsconfig strict, ESLint, scripts: `dev`, `build`, `preview`, `lint`, `typecheck` (`tsc -b --noEmit`), `test:e2e`, `test:e2e:update`, `perf`.
- `msw init public/`; Playwright instalado com config (projetos `chromium-desktop` 1280×720 e `chromium-mobile` Pixel 7 em landscape, `reporter: [['html'], ['list']]`, `trace: 'retain-on-failure'`, `webServer: pnpm build && pnpm preview`).
- `vercel.json` com rewrite SPA (`/(.*)` → `/index.html`, exceto `mockServiceWorker.js` e `/assets`).
- **Pronto quando:** `pnpm lint && pnpm typecheck && pnpm build` passam; teste Playwright vazio roda.

## Fase 1 — Assets, config e casca do motor (1,5 dia)
- `scripts/convert-atlas.ts`: converte `ships_miscellaneous_sheet(.xml|_retina.xml)` para JSON Pixi (`@2x` para retina); gera JSON de frames do `tiles_sheet` (grid 64 px). Saída versionada em `public/assets/`. `ui_sheet.json` usado direto (já é formato Pixi).
- `game/assets`: manifest único (atlas de navios, tiles, ui), `Assets.load` com `onProgress` → barra de progresso React na tela de Play; erro → painel com mensagem acessível + **Retry** (limpa cache do bundle com `Assets.unloadBundle` e recarrega). Combate só inicia com todas as texturas resolvidas. Escolha 1×/2× por `devicePixelRatio`.
- `game/config.ts`: `GameConfig` tipado — `match.durationSec` (60–180, default 120), `spawn.intervalSec` (limites documentados **1–15 s**, default 4), `spawn.weights {chaser, shooter}`, `spawn.maxAlive`, `spawn.minDistanceFromPlayer`, `spawn.clearRadius`, por tipo de navio `{maxHp, speed, turnRate, radius}`, armas `{front, broadside, enemy}` com `{damage, speed, range|lifetimeMs, cooldownMs, count, spacing}`, `chaser.ramDamage`, `shooter.attackRange/preferredRange/aimToleranceRad`. `createMatchConfig(userOptions)` retorna snapshot congelado (`Object.freeze`) usado pela partida.
- `GameSession` + componente `GameCanvas`: `Application.init` assíncrono com flag `disposed` (seguro em Strict Mode: monta→desmonta→monta), `resizeTo` contêiner, `resolution: devicePixelRatio`, `autoDensity`. Arena lógica fixa **1920×1088** (30×17 tiles) num `world` Container escalado com letterbox (preserva proporção; limites e coordenadas sempre em unidades lógicas). `destroy()` remove listeners, para ticker, destrói views/pools e o app (texturas compartilhadas ficam no cache de Assets, reutilizadas entre partidas).
- **Pronto quando:** tela Play carrega assets com progresso, desenha mapa de água + ilhas e um navio; falha simulada mostra Retry funcional; StrictMode não gera 2 canvases nem erros no console.

## Fase 2 — Simulação e gameplay (3 dias) — 35 pts
Toda regra em `game/sim` (TS puro, testável sem Pixi). Passo fixo **1/60 s** com acumulador e clamp de dt (máx 250 ms) → independente de FPS. Relógio de simulação próprio (`simTimeMs`); cooldowns/tempo de vida/spawn usam esse relógio, logo congelam na pausa.
- **Mapa/ilhas:** layout de tiles autoral (2–3 ilhas com areia/grama, sem copiar o sample exatamente) definido como dados; colisores = lista de retângulos/polígonos convexos simples derivados das células sólidas. Água rasa decorativa.
- **Movimento:** navio = círculo; `forward` acelera até `speed`, rotação `turnRate` rad/s; colisão círculo×retângulo com resolução por empurrão (sem atravessar ilhas); clamp nos limites da arena. Inimigos usam as mesmas regras.
- **Armas:** frontal = 1 projétil na proa; laterais = 3 projéteis paralelos (offset ao longo do casco) perpendiculares, esquerda/direita com cooldowns independentes. Projétil: `pos, vel, damage, ownerFaction, expiresAt|maxDistance`; removido ao atingir alvo/ilha, expirar ou sair da arena; flag `spent` garante dano único.
- **Inimigos:** *Chaser* — steering de perseguição + desvio de ilhas por "feelers" (raycasts curtos à frente); ao colidir com o jogador aplica `ramDamage` e explode (morre **sem pontuar**). *Shooter* — aproxima até `preferredRange`, mantém distância/órbita, gira para alinhar e dispara frontal quando dentro de `attackRange` e alinhado, respeitando cooldown. Inimigo morto: `alive=false` → removido de colisões, IA e armas no mesmo passo.
- **Spawn:** a cada `intervalSec` até o fim; pontos candidatos pré‑definidos na água; escolhe via RNG com seed entre os que estão livres (`clearRadius` sem ilha/navio) e a ≥ `minDistanceFromPlayer`; tipo por pesos, com garantia: os dois primeiros spawns são um de cada tipo (ambos aparecem em partida padrão).
- **Partida:** estados `running | paused | ended`; fim por `time_up` ou `destroyed`; ao terminar congela movimento, armas, dano, spawns e pontuação; score +1 só para kill causado por projétil do jogador. Resultado `{matchId (uuid), score, durationMs ativo, endReason, config snapshot, endedAt}`.
- **Input:** `InputState` com ações (`forward, turnLeft, turnRight, fireFront, fireLeft, fireRight`) combináveis; teclado: **W/↑** avançar, **A/←, D/→** girar, **Space** frontal, **Q** lateral esquerda, **E** lateral direita, **P/Esc** pausa. Listener só ativo com sessão `running` e foco fora de campos/diálogos; `preventDefault` só nessas teclas. Toque: botões React (sprites `icon_turn_left/forward/turn_right/fire_*`) com Pointer Events + `setPointerCapture`, multitouch (mover e disparar juntos).
- **Pausa:** manual (botão/tecla) e automática em `visibilitychange`/`blur`/orientação retrato; ticker parado, input zerado (teclas presas descartadas), retomada só por ação no diálogo **Resume**; na retomada o acumulador é zerado (sem dt acumulado).
- **Reinício:** `destroy()` + nova `GameSession` com novo snapshot e nova seed — nada reaproveita estado.
- **Pronto quando:** partida jogável de ponta a ponta por teclado e toque, com fim por tempo e morte.

## Fase 3 — Renderização, feedback e HUD (1,5 dia)
- Views por entidade sincronizadas a partir do estado da sim (renderer só lê). Pools para projéteis e efeitos.
- Deterioração: textura do navio troca pelos 4 estados de dano (`ship_N` por cor × dano; mapear IDs na implementação) conforme faixas de HP + sprite `fire_1/2` animado com HP baixo. Jogador e cada tipo de inimigo com cor distinta.
- Efeitos: muzzle flash/fumaça no disparo, rastro do projétil, splash ao expirar na água, flash/tint + leve shake no impacto, sequência `explosion_3→2→1` na destruição, explosão do Chaser no impacto. Sons correspondentes (cannon_fire, broadside, wood_hit, explosion, game_start/over/complete, pause/resume, time_warning, health_low) com botão mute persistido.
- Barras de vida em Pixi acima de cada navio (`health_frame` + `health_fill_*` para jogador, `enemy_health_*` para inimigos), sem girar com o navio.
- HUD React (sprites `counter_panel`, `icon_heart/score/time`, `button_round`) lendo `hudStore` via `useSyncExternalStore`; a sim só publica quando valor inteiro muda (score, hp, segundos) → zero renders por frame. Live region `aria-live="polite"` anuncia score, marcos de tempo (60/30/10 s) e mudanças de estado (pausado, fim).
- **Pronto quando:** visual próximo de `assets/sample.png`; React DevTools Profiler mostra renders apenas em mudanças discretas.

## Fase 4 — Telas, opções, persistência e acessibilidade (2 dias) — 15 pts
- Visual dos menus a partir do `ui_sheet` (`panel_menu` com 9‑slice via `border-image` usando `borders`; botões primary/secondary com estados hover/pressed/disabled; `title_pirate_battle`), fundo `ui_scene_background.png`, coerente com `sample_*.png`.
- **Main Menu:** Play, Options, instruções de controle (teclado e toque), abas **Ranking** e **Match History** (tabs ARIA com setas), botão "Network lab" (cenários MSW).
- **Options:** Game session time (60–180 s), Enemy spawn time (1–15 s, positivo), Captain name (2–16 chars). Validação inline com `aria-describedby`/`aria-invalid`, Save desabilitado se inválido, persistência em `localStorage` versionado (com fallback se corrompido).
- **Play:** loading → combate; HUD; botão pausa; diálogo de pausa (Resume, Main Menu). Sair da rota ou refresh = partida abandonada (nada registrado; nada persistido da sessão).
- **Result:** pontuação, tempo jogado, motivo (`Time up` / `Ship destroyed`), status do registro (Saving / Saved / Pending — will retry / Failed + **Retry**), **Play Again** e **Main Menu**. Último resultado concluído persistido em `localStorage` e reexibido após refresh em `/result`.
- Diálogos com `<dialog>.showModal()` (focus trap nativo + Esc) e retorno de foco; foco visível customizado; contraste AA; navegação completa por teclado.
- Mobile: **landscape suportado**; em retrato, overlay "Rotate your device" (pausa automática). Layout reage a resize sem alterar regras (arena lógica fixa).
- **Pronto quando:** todas as telas da seção 3 do README funcionam em desktop e mobile.

## Fase 5 — API, TanStack Query, Axios, MSW (2 dias) — 15 pts
- **Contratos (`api/contracts.ts`, compartilhados com mocks):**
  - `MatchRecord { matchId, playerId, playerName, endedAt, score, durationMs, endReason: 'time_up'|'destroyed', config: { sessionTimeSec, spawnIntervalSec } }`
  - `PUT /api/matches/:matchId` (idempotente; `201` criado, `200` já existente com o mesmo registro; `409` se payload divergente).
  - `GET /api/players/:playerId/matches?page&pageSize` → `Page<MatchRecord>` (mais recente primeiro).
  - `GET /api/ranking?sessionTimeSec&spawnIntervalSec&page&pageSize` → `Page<RankingEntry>` (só partidas com a mesma configuração; seletor na aba, default = opções atuais). Desempate determinístico: `score desc, durationMs asc, endedAt asc, matchId asc`. Uma entrada por partida.
- **Axios:** instância `baseURL '/api'`, `timeout 5000`, `signal` repassado pelo TanStack (cancelamento), erros normalizados (`network | timeout | http(status)`).
- **TanStack Query:** query keys por (recurso, filtros, página); `placeholderData: keepPreviousData`; `refetchOnMount: 'always'` ao exibir a aba; indicador de atualização em segundo plano (`isFetching`); estados loading / vazio / erro com Retry (`role="alert"`); `retry` até 3 com backoff, sem retry em 4xx (exceto 408/429). Respostas atrasadas: cada página/filtro tem sua chave e requisições obsoletas são canceladas, então resposta antiga nunca sobrescreve dado mais novo. Mutation `registerMatch` com `onSuccess` invalidando `['ranking']` e `['history']`.
- **Outbox (`api/outbox.ts`):** ao terminar a partida o registro entra em `localStorage` (`pendingMatches`) *antes* do envio; flush na tela de resultado, no boot do app, em `online` e no Retry manual; removido só após 200/201. Como o PUT é idempotente por `matchId`, reenvios/cliques repetidos/timeout‑após‑commit recuperam o registro existente sem duplicar. Jogar de novo não espera o outbox.
- **MSW:** worker iniciado antes do render em dev **e produção** (`onUnhandledRequest: 'bypass'`, assets não são interceptados). `mocks/db.ts` persiste registros confirmados em `localStorage` (separado do outbox do cliente); fixtures de ~40 jogadores para a config padrão e algumas outras (paginação real). Cenários (`mocks/scenarios.ts`), selecionáveis por `?scenario=` e pelo diálogo **Network lab** (persistido), com seed de RNG/latência controlável e botão **Reset mock data** (restaura fixtures, limpa registros e cenário):
  `success, empty, many-pages, slow, variable-latency, out-of-order, timeout, network-error, http-400, http-500, ranking-fail, history-fail, register-timeout-after-commit, unavailable-then-recover` (este último falha os N primeiros PUTs e depois aceita).
- Falhas da API nunca bloqueiam Play, Options ou o combate (queries isoladas por aba; erros só nos painéis).
- **Pronto quando:** cada cenário reproduz o comportamento descrito no README manualmente pelo Network lab.

## Fase 6 — Testes Playwright (1 dia + incremental) — 10 pts
- **Instrumentação (`game/testing.ts`)** ativa com `?test=1`: `window.__pirate = { getState(), advance(ms), setSeed() }`; modo de relógio manual (ticker desligado, `advance` executa passos fixos reais da sim + render). Inputs nos testes vêm de `page.keyboard`/toques nos botões, nunca de setters de estado.
- Fixture `test.beforeEach`: contexto novo, `localStorage` limpo, `?scenario=…&seed=…&test=1`.
- Specs: `01-options`, `02-assets` (route abortando atlas → erro → Retry), `03-movement` (mover, girar, limites, colisão com ilha), `04-combat` (frontal/lateral, dano, cooldown, score sem duplicação), `05-enemies` (Chaser persegue/explode sem pontuar, Shooter atira no alcance, intervalo de spawn), `06-end-restart`, `07-pause` (manual, `visibilitychange` via `page.evaluate`, blur; timer não avança), `08-result-persist`, `09-abandon-nav-touch` (projeto mobile com `tap`), `10-tabs` (paginação, loading, vazio, erro), `11-register` (atualização das duas abas, pendente após refresh recuperado), `12-retry-ordering` (timeout‑após‑commit sem duplicação; `out-of-order` sem sobrescrever).
- `visual.spec.ts`: menu, arena em estado estável (seed + relógio manual), resultado; baselines versionadas em `tests/e2e/__screenshots__`.
- Rodar em `chromium-desktop` e `chromium-mobile`; relatório HTML + traces de falha em `playwright-report/` (relatório final versionado em `docs/reports/`).

## Fase 7 — Performance, documentação e deploy (1 dia) — 5 pts
- `scripts/perf.ts` (Playwright + CDP no build `preview`): partida de 180 s com bot de input; coleta FPS médio, p95 de frame time (via `ticker`/rAF), entidades vivas ao longo do tempo; 5 ciclos iniciar→jogar→sair com `HeapProfiler.collectGarbage` + `JSHeapUsedSize`, contagem de display objects/texturas do Pixi, listeners. Saída `docs/perf/report.md` + JSON + trace do DevTools, com hardware, navegador, resolução, configuração e limitações.
- `README.md` da solução: setup, variáveis de ambiente (`VITE_ENABLE_MOCKS`, `VITE_API_TIMEOUT_MS`), controles, `GameConfig` e limites, seleção/reset de cenários, todos os comandos, como reproduzir cada falha, URL do deploy.
- `ARCHITECTURE.md`: integração React/Pixi, loop de simulação, colisões, ciclo de vida de recursos, persistência local, contratos, cache, outbox, limitações e decisões de balanceamento.
- `ASSETS_LICENSE.md` (origem/licença dos assets e qualquer conversão).
- Deploy Vercel (preset Vite); validar abrir e dar refresh em todas as rotas, mocks funcionando em produção, console sem erros.

---

## Checklist de rastreabilidade (README → fase)
§1 stack → F0/F5 · §2 jogador/inimigos/arena/regras/pausa/feedback → F2/F3 · §3 telas/config/snapshot/abandono → F1/F4 · §4 arquitetura/strict mode/texturas/DPR/limpeza → F1/F3 · §5 ranking/histórico/idempotência/outbox → F5 · §6 MSW/cenários/reset/persistência → F5 · §7 assets/responsivo/a11y/teclas só em gameplay → F3/F4 · §8 testes 1–12 + visual → F6 · §9 perf → F7 · §11 entrega/deploy/docs → F7.

## Verificação end‑to‑end
1. `pnpm install && pnpm lint && pnpm typecheck && pnpm build` sem erros.
2. `pnpm preview` → jogar uma partida completa por teclado e outra em emulação mobile; conferir console limpo.
3. Network lab: percorrer todos os cenários; em `register-timeout-after-commit` clicar Retry várias vezes e confirmar 1 registro em ambas as abas; em `unavailable-then-recover` dar refresh e ver o pendente enviado.
4. `pnpm test:e2e` (desktop + mobile) verde, relatório HTML gerado.
5. `pnpm perf` gera `docs/perf/report.md`; heap estável entre os 5 ciclos.
6. URL da Vercel: abrir, dar refresh em `/`, `/options`, `/result`, `/play` (volta ao menu), jogar e registrar.
