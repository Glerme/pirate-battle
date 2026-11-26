# Pirate Battle

> 🇺🇸 [English version](README.md) (versão oficial exigida pelo desafio)

Combate naval pirata com visão superior em React + Pixi.js. O enunciado do desafio está em [docs/CHALLENGE.md](docs/CHALLENGE.md) e o plano de implementação em [docs/PLAN.md](docs/PLAN.md).
Decisões de arquitetura: [ARCHITECTURE.md](ARCHITECTURE.md). Origem dos assets: [ASSETS_LICENSE.md](ASSETS_LICENSE.md). Performance: [docs/perf/report.md](docs/perf/report.md).

**Demo publicada:** https://pirate-battle-lyart-iota.vercel.app/ (Vercel, preset Vite; o `vercel.json` reescreve as rotas da SPA; os mocks do MSW rodam em produção)

## Instalação

```sh
pnpm install
pnpm dev          # http://localhost:5173
```

| Comando | O que faz |
|---|---|
| `pnpm dev` | Servidor de desenvolvimento do Vite |
| `pnpm build` | `tsc -b` + build de produção em `dist/` |
| `pnpm preview` | Serve `dist/` em http://localhost:4173 |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc -b --noEmit` |
| `pnpm test:e2e` | Playwright (desktop 1280×720 + Pixel 7 em paisagem); faz build e preview antes |
| `pnpm test:sim` / `pnpm test:mocks` | Verificações em Node da simulação / da API mockada |
| `pnpm perf` | Medição de performance no build de preview → `docs/perf/report.{md,json}` |
| `pnpm atlas` | Regera os atlas do Pixi em `public/assets/` a partir de `assets/` |

Saída do Playwright: o relatório HTML vai para `playwright-report/` e os traces/screenshots de falhas para `test-results/` (ambos ignorados pelo git). Abra o relatório com `pnpm exec playwright show-report` e um trace com `pnpm exec playwright show-trace test-results/<pasta-do-teste>/trace.zip`.

Uma cópia versionada da última execução completa (60 testes, desktop + mobile, todos verdes) está em [docs/reports/playwright/](docs/reports/playwright/index.html).

### Variáveis de ambiente

| Variável | Padrão | Efeito |
|---|---|---|
| `VITE_ENABLE_MOCKS` | habilitado | Use `false` para não iniciar o worker do MSW e falar com uma `/api` real. O worker de mock também roda no build de produção (a entrega é só front-end). |
| `VITE_API_TIMEOUT_MS` | `5000` | Timeout das requisições do Axios em ms. Os cenários de timeout esperam esse valor mais 100 ms. |

## Controles

| Ação | Teclado | Toque (paisagem) |
|---|---|---|
| Avançar | `W` / `↑` | botão de avançar |
| Girar para esquerda / direita | `A` `D` / `←` `→` | botões de giro |
| Canhão frontal | `Espaço` | botão de tiro frontal |
| Disparo lateral esquerdo / direito (3 tiros) | `Q` / `E` | botões de tiro lateral |
| Pausar | `P` / `Esc`, botão de pausa | botão de pausa |

Os botões podem ser segurados juntos (multitoque). A partida pausa sozinha quando a aba fica oculta, a janela perde o foco ou o aparelho está em retrato, e só volta pelo botão **Resume**. Recarregar a página ou sair de `/play` abandona a partida (nada é registrado).

## Configuração de gameplay

Opções do jogador (tela Options, salvas no `localStorage`, com validação no próprio campo):

| Opção | Limites | Padrão |
|---|---|---|
| Game session time | 60–180 s | 120 |
| Enemy spawn time | **1–15 s** | 4 |
| Captain name | 2–16 caracteres | `Captain` |

Cada partida usa um snapshot imutável da configuração (`createMatchConfig`, `src/game/config.ts`). O resto do balanceamento fica em `DEFAULT_GAME_CONFIG`: arena de 1920×1088 px lógicos; jogador com 10 de vida e 220 px/s; Chaser com 2 de vida, causa 2 de dano ao colidir e morre sem pontuar; Shooter com 3 de vida, atira a até 420 px; no máximo 8 inimigos vivos; os dois primeiros spawns são um de cada tipo; spawns acontecem a pelo menos 400 px do jogador, em água livre. Pontuação = +1 por inimigo destruído por projétil do jogador.

## Cenários da API mockada

As requisições para `/api` são atendidas pelo MSW. Escolha um cenário com `?scenario=<id>` (ex.: `/?scenario=timeout`) ou no **Network lab** do menu principal; a escolha fica salva no `localStorage`. **Reset mock data** (no Network lab) restaura as fixtures (≈40 jogadores), apaga as partidas registradas e volta o cenário para `success`. `?seed=<n>` define a semente do gerador de latência dos mocks (e da simulação, veja `/play?seed=`).

| Cenário | Como reproduzir / o que aparece |
|---|---|
| `success` | Respostas normais. |
| `empty` | Ranking e histórico vazios → estado vazio. |
| `many-pages` | Muitas fixtures → paginação real. |
| `slow` | Latência de 1,5 s → estados de carregamento e indicador de atualização em segundo plano. |
| `variable-latency` | Latência aleatória de 100–1100 ms (com semente). |
| `out-of-order` | Latência alternando 900/100 ms: trocas de página/filtro respondem fora de ordem; respostas antigas nunca sobrescrevem as mais novas. |
| `timeout` | Toda requisição passa do timeout → painel de erro com Retry. |
| `network-error` | Falha de conexão → painel de erro com Retry. |
| `http-400` | 400 em toda chamada; sem nova tentativa automática (erro permanente). |
| `http-500` | 500 em toda chamada; novas tentativas com backoff e depois painel de erro. |
| `ranking-fail` / `history-fail` | Só aquela aba falha; a outra aba e o jogo continuam funcionando. |
| `register-timeout-after-commit` | O servidor grava a partida mas responde depois do timeout. O resultado mostra Pending/Failed; **Retry** recupera o registro existente (`200`), sem duplicar no Ranking/Histórico. |
| `unavailable-then-recover` | O primeiro registro de partida falha (503) e a tentativa seguinte funciona: termine uma partida (Pending), recarregue `/result` ou clique em Retry → Saved. |

Falhas da API nunca bloqueiam Play, Options ou o combate; os erros só aparecem no painel afetado ou no status do registro.

Durante uma atualização do Ranking ou do Match History, os botões de página ficam desabilitados até a resposta chegar.

## Testes

`?test=1` expõe `window.__pirate` (`getState`, `advance(ms)`, `setSeed`) e coloca a simulação em relógio manual; os helpers estão em `tests/e2e/fixtures.ts`. `?inspect=1` expõe o mesmo objeto (só para leitura) mantendo o loop em tempo real (usado pelo `pnpm perf`).
