// Run with pnpm exec tsx src/mocks/check.mjs.
import assert from 'node:assert/strict'
import { setupServer } from 'msw/node'

const location = new URL('http://localhost/?scenario=success&seed=73')
const storage = new Map()
Object.defineProperties(globalThis, {
  document: { value: { baseURI: location.href, cookie: '' } },
  location: { value: location },
  localStorage: {
    value: {
      getItem: (key) => storage.get(key) ?? null,
      removeItem: (key) => storage.delete(key),
      setItem: (key, value) => storage.set(key, value),
    },
  },
  window: { value: Object.assign(new EventTarget(), { location, history: { replaceState() {} } }) },
})

const { getRanking, getHistory, registerMatch } = await import('../api/client')
const { enqueueMatch, flushMatchOutbox, startMatchOutbox } = await import('../api/outbox')
const { createQueryClient, invalidateMatchQueries, queryKeys } = await import('../api/queries')
const { QueryObserver } = await import('@tanstack/react-query')
const { handlers } = await import('./handlers')
const { getScenario, mockRequest, resetMockData, setScenario } = await import('./scenarios')
const { OPTION_LIMITS } = await import('../game/config')

const server = setupServer(...handlers)
const client = createQueryClient()
const config = {
  sessionTimeSec: OPTION_LIMITS.sessionTimeSec.default,
  spawnIntervalSec: OPTION_LIMITS.spawnIntervalSec.default,
}
const record = {
  matchId: 'match/a',
  playerId: 'player/a',
  playerName: 'Captain Test',
  config,
  endedAt: '2026-03-01T12:00:00.000Z',
  score: 100,
  durationMs: 45000,
  endReason: 'destroyed',
}

const forScenario = (scenario) => {
  resetMockData()
  setScenario(scenario)
}

const history = () => getHistory({ playerId: record.playerId })
const pending = () => JSON.parse(localStorage.getItem('pendingMatches') ?? '[]')

server.listen({ onUnhandledRequest: 'error' })
try {
  assert.equal(getScenario(), 'success')
  const defaultRanking = await getRanking(config)
  assert.equal(defaultRanking.total, 40)
  assert.equal(defaultRanking.items[0]?.rank, 1)
  assert.ok((await getRanking({ ...config, sessionTimeSec: 60 })).total > 0)
  assert.equal(await registerMatch(record), 'created')
  assert.equal(await registerMatch(record), 'existing')
  await assert.rejects(registerMatch({ ...record, score: 1 }), { kind: 'http', status: 409 })
  assert.deepEqual((await history()).items, [record])
  assert.equal((await getRanking(config)).items[0]?.matchId, record.matchId)

  forScenario('empty')
  assert.equal((await getRanking(config)).total, 0)
  assert.equal((await history()).total, 0)

  forScenario('many-pages')
  const lastPage = await getRanking({ ...config, page: 8 })
  assert.equal(lastPage.totalPages, 8)
  assert.equal(lastPage.items[0]?.rank, 71)

  forScenario('slow')
  const started = performance.now()
  await getRanking(config)
  assert.ok(performance.now() - started >= 1400)

  forScenario('variable-latency')
  const sequence = Array.from({ length: 4 }, () => mockRequest().latencyMs)
  assert.ok(new Set(sequence).size > 1)
  setScenario('variable-latency')
  assert.deepEqual(Array.from({ length: 4 }, () => mockRequest().latencyMs), sequence)
  assert.equal((await getRanking(config)).total, 40)

  forScenario('out-of-order')
  const completed = []
  await Promise.all([1, 2].map(async (page) => {
    assert.equal((await getRanking({ ...config, page })).page, page)
    completed.push(page)
  }))
  assert.deepEqual(completed, [2, 1])

  const observer = new QueryObserver(client, {
    queryKey: queryKeys.ranking(config),
    queryFn: ({ signal }) => getRanking(config, signal),
  })
  const stopObserving = observer.subscribe(() => {})
  try {
    await registerMatch(record)
    await invalidateMatchQueries(client)
    assert.equal(observer.getCurrentResult().data?.items[0]?.matchId, record.matchId)
  } finally {
    stopObserving()
  }

  forScenario('timeout')
  await Promise.all([
    assert.rejects(getRanking(config), { kind: 'timeout' }),
    assert.rejects(registerMatch(record), { kind: 'timeout' }),
  ])
  setScenario('success')
  assert.equal((await history()).total, 0)

  forScenario('network-error')
  await assert.rejects(getRanking(config), { kind: 'network' })

  for (const [scenario, status] of [['http-400', 400], ['http-500', 500]]) {
    forScenario(scenario)
    await assert.rejects(getRanking(config), { kind: 'http', status })
  }

  forScenario('ranking-fail')
  await assert.rejects(getRanking(config), { kind: 'http', status: 500 })
  assert.equal((await history()).total, 0)

  forScenario('history-fail')
  await assert.rejects(history(), { kind: 'http', status: 500 })
  assert.equal((await getRanking(config)).total, 40)

  forScenario('register-timeout-after-commit')
  enqueueMatch(record)
  await flushMatchOutbox(client)
  assert.deepEqual(pending(), [record])
  assert.deepEqual((await history()).items, [record])
  await Promise.all([flushMatchOutbox(client), flushMatchOutbox(client)])
  assert.deepEqual(pending(), [])
  assert.deepEqual((await history()).items, [record])
  assert.equal((await getRanking({ ...config, pageSize: 50 })).items.filter((item) => item.matchId === record.matchId).length, 1)

  forScenario('unavailable-then-recover')
  enqueueMatch(record)
  await flushMatchOutbox(client)
  assert.deepEqual(pending(), [record])
  assert.equal((await history()).total, 0)
  const stopOutbox = startMatchOutbox(client)
  try {
    await flushMatchOutbox(client)
    assert.deepEqual(pending(), [])
    assert.deepEqual((await history()).items, [record])
  } finally {
    stopOutbox()
  }

  resetMockData()
  assert.equal(getScenario(), 'success')
  assert.equal((await history()).total, 0)
  assert.equal((await getRanking(config)).total, 40)
  console.log('Verified all 14 mock scenarios, cache invalidation and outbox recovery.')
} finally {
  client.clear()
  server.close()
}
