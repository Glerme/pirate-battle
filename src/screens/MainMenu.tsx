import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SCENARIO_IDS, type ScenarioId } from '../api/contracts'
import { useHistoryList, useNetworkLab, useRankingList } from '../app/integration'
import { loadOptions, getPlayerId } from '../settings/storage'
import { Button } from '../ui/Button'
import { DataTable } from '../ui/DataTable'
import { Dialog } from '../ui/Dialog'
import { END_REASON_LABEL, formatDate, formatDuration } from '../ui/format'
import { img } from '../ui/img'
import { Panel } from '../ui/Panel'
import { Tabs } from '../ui/Tabs'
import { startPlay } from './nav'

type TabId = 'ranking' | 'history'
const TABS = [
  { id: 'ranking', label: 'Ranking' },
  { id: 'history', label: 'Match History' },
] as const

function RankingPanel() {
  const options = loadOptions()
  const playerId = getPlayerId()
  const [cfg, setCfg] = useState({ sessionTimeSec: options.sessionTimeSec, spawnIntervalSec: options.spawnIntervalSec })
  const [page, setPage] = useState(1)
  const state = useRankingList({ ...cfg, page })
  const sessionChoices = [...new Set([60, 90, 120, 150, 180, cfg.sessionTimeSec])].sort((a, b) => a - b)
  const change = (k: keyof typeof cfg, v: string) => {
    setCfg({ ...cfg, [k]: Number(v) })
    setPage(1)
  }
  return (
    <>
      <div className="filters">
        <label>
          Session time
          <select value={cfg.sessionTimeSec} onChange={(e) => change('sessionTimeSec', e.target.value)}>
            {sessionChoices.map((n) => <option key={n} value={n}>{n} s</option>)}
          </select>
        </label>
        <label>
          Spawn time
          <select value={cfg.spawnIntervalSec} onChange={(e) => change('spawnIntervalSec', e.target.value)}>
            {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} s</option>)}
          </select>
        </label>
      </div>
      <DataTable
        caption="Ranking"
        state={state}
        onPage={setPage}
        rowKey={(r) => r.matchId}
        highlight={(r) => r.playerId === playerId}
        emptyText="No matches ranked for this configuration yet."
        columns={[
          { header: 'Rank', cell: (r) => String(r.rank).padStart(2, '0') },
          { header: 'Captain', cell: (r) => <>{r.playerName}{r.playerId === playerId && <span className="you">YOU</span>}</> },
          { header: 'Points', cell: (r) => r.score },
          { header: 'Time', cell: (r) => formatDuration(r.durationMs) },
          { header: 'Played', cell: (r) => formatDate(r.endedAt) },
        ]}
      />
    </>
  )
}

function HistoryPanel() {
  const [page, setPage] = useState(1)
  const state = useHistoryList({ playerId: getPlayerId(), page })
  return (
    <DataTable
      caption="Match history"
      state={state}
      onPage={setPage}
      rowKey={(r) => r.matchId}
      emptyText="You have not finished a match yet."
      columns={[
        { header: 'Played', cell: (r) => formatDate(r.endedAt) },
        { header: 'Points', cell: (r) => r.score },
        { header: 'Time', cell: (r) => formatDuration(r.durationMs) },
        { header: 'Result', cell: (r) => END_REASON_LABEL[r.endReason] },
      ]}
    />
  )
}

function NetworkLabDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const lab = useNetworkLab()
  const titleId = useId()
  return (
    <Dialog open={open} onCancel={onClose} labelledBy={titleId}>
      <h2 id={titleId}>Network lab</h2>
      <p>Simulate network conditions for the ranking and history APIs.</p>
      <label className="field">
        Scenario
        <select value={lab.scenario} onChange={(e) => lab.setScenario(e.target.value as ScenarioId)}>
          {SCENARIO_IDS.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
      </label>
      <p role="status">Pending matches: {lab.pendingCount}</p>
      <div className="actions">
        <Button variant="secondary" onClick={lab.resetMockData}>Reset mock data</Button>
        <Button onClick={onClose}>Close</Button>
      </div>
    </Dialog>
  )
}

export function MainMenu() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<TabId>('ranking')
  const [labOpen, setLabOpen] = useState(false)
  return (
    <main className="screen">
      <Panel className="menu">
        <h1 className="title"><img src={img('title_pirate_battle')} alt="Pirate Battle" /></h1>
        <p className="tagline">Set sail. Take command.</p>
        <div className="stack">
          <Button onClick={() => startPlay(navigate)}>Play</Button>
          <Button onClick={() => navigate('/options')}>Options</Button>
        </div>
        <section aria-labelledby="controls-h" className="controls-help">
          <h2 id="controls-h">Controls</h2>
          <dl>
            <dt>Keyboard</dt>
            <dd><kbd>W</kbd>/<kbd>↑</kbd> forward · <kbd>A</kbd>/<kbd>←</kbd> <kbd>D</kbd>/<kbd>→</kbd> turn · <kbd>Space</kbd> fire front · <kbd>Q</kbd> / <kbd>E</kbd> broadside left / right · <kbd>P</kbd>/<kbd>Esc</kbd> pause</dd>
            <dt>Touch</dt>
            <dd>Left pad: turn left, forward, turn right. Right pad: fire left, front, right. Hold several buttons at once.</dd>
          </dl>
        </section>
        <Tabs label="Leaderboards" tabs={TABS} value={tab} onChange={setTab}>
          {tab === 'ranking' ? <RankingPanel /> : <HistoryPanel />}
        </Tabs>
        <Button variant="secondary" onClick={() => setLabOpen(true)}>Network lab</Button>
      </Panel>
      <NetworkLabDialog open={labOpen} onClose={() => setLabOpen(false)} />
    </main>
  )
}
