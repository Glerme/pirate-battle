import { useCallback, useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { enqueueMatch } from '../api/outbox'
import type { MatchRecord } from '../api/contracts'
import { createMatchConfig } from '../game/config'
import { audio } from '../game/audio'
import { GameCanvas } from '../game/GameCanvas'
import type { AssetLoadProgress, GameSessionApi, HudSnapshot, MatchResult } from '../game/types'
import { getPlayerId, loadOptions, saveLastResult } from '../settings/storage'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { formatClock } from '../ui/format'
import { img } from '../ui/img'
import { LiveRegion } from '../ui/LiveRegion'
import { Panel } from '../ui/Panel'
import { RoundButton } from '../ui/RoundButton'
import { playGuard } from './nav'
import { TouchControls } from './TouchControls'
import { useMediaQuery } from './useMediaQuery'

const IDLE: HudSnapshot = { status: 'loading', score: 0, hp: 0, maxHp: 0, remainingSec: 0 }
const NOOP_SUBSCRIBE = () => () => undefined
const MILESTONES = [60, 30, 10]

/** Subscribes to the session HUD store; re-renders only when the session publishes a new snapshot. */
function useHud(session: GameSessionApi | null): HudSnapshot {
  const subscribe = session ? session.hud.subscribe : NOOP_SUBSCRIBE
  const getSnapshot = session ? session.hud.getSnapshot : () => IDLE
  return useSyncExternalStore(subscribe, getSnapshot)
}

function announcement(prev: HudSnapshot, hud: HudSnapshot): string | undefined {
  if (prev.status !== hud.status) {
    if (hud.status === 'paused') return 'Game paused'
    if (hud.status === 'ended') return 'Match over'
    if (hud.status === 'running') return prev.status === 'paused' ? 'Game resumed' : 'Match started'
  }
  if (prev.score !== hud.score) return `Score ${hud.score}`
  if (prev.remainingSec !== hud.remainingSec && MILESTONES.includes(hud.remainingSec)) return `${hud.remainingSec} seconds remaining`
}

function useAnnouncer(hud: HudSnapshot): string {
  // Derived during render (no effect): keep the previous snapshot and the last discrete message.
  const [state, setState] = useState({ prev: hud, message: '' })
  if (state.prev !== hud) setState({ prev: hud, message: announcement(state.prev, hud) ?? state.message })
  return state.message
}

function Counter({ icon, label, children }: { icon: string; label: string; children: string }) {
  return (
    <div className="counter" role="group" aria-label={label}>
      <img src={img(icon)} alt="" />
      <span>{children}</span>
    </div>
  )
}

function MuteIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
      {muted ? <path d="M17 9l5 6M22 9l-5 6" /> : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />}
    </svg>
  )
}

function toRecord(r: MatchResult): MatchRecord {
  return { ...r, playerId: getPlayerId(), playerName: loadOptions().captainName }
}

export function Play() {
  const navigate = useNavigate()
  const titleId = useId()
  // Snapshot of the options at match start; later edits only affect new matches.
  const config = useMemo(() => createMatchConfig(loadOptions()), [])
  const [params] = useSearchParams()
  const [seed] = useState(() => {
    const q = params.get('seed')
    return q?.trim() && Number.isFinite(Number(q)) ? Number(q) : Math.floor(Math.random() * 2 ** 32)
  })
  const [session, setSession] = useState<GameSessionApi | null>(null)
  const [load, setLoad] = useState<AssetLoadProgress & { retry?: () => void }>({ progress: 0, status: 'loading' })
  const muted = useSyncExternalStore(audio.subscribe, audio.isMuted)
  const hud = useHud(session)
  const message = useAnnouncer(hud)
  const portrait = useMediaQuery('(orientation: portrait) and (pointer: coarse)')
  const touch = useMediaQuery('(pointer: coarse)')

  // Stable identity: GameCanvas effects depend on these.
  const onSession = useCallback((s: GameSessionApi | null) => {
    setSession(s)
    s?.onEnd((r) => {
      const record = toRecord(r)
      saveLastResult(r)
      enqueueMatch(record)
      navigate('/result', { replace: true })
    })
  }, [navigate])
  const retry = () => {
    setLoad({ progress: 0, status: 'loading' })
    load.retry?.()
  }
  useEffect(() => {
    if (portrait && hud.status === 'running') session?.pause('orientation')
  }, [portrait, hud.status, session])

  if (!playGuard.armed) return <Navigate to="/" replace />

  const paused = hud.status === 'paused'
  return (
    <main className="play" aria-label="Pirate Battle match">
      <div className="stage">
        <GameCanvas config={config} seed={seed} onSession={onSession} onLoadState={setLoad} />
      </div>

      {load.status === 'loading' && (
        <div className="overlay" role="status">
          <p>Loading assets… {Math.round(load.progress * 100)}%</p>
          <progress max={1} value={load.progress} aria-label="Asset loading progress" />
        </div>
      )}
      {load.status === 'error' && (
        <div className="overlay" role="alert">
          <p>Could not load the game assets{load.error ? `: ${load.error}` : '.'}</p>
          <Button onClick={retry}>Retry</Button>
          <Button variant="secondary" onClick={() => navigate('/')}>Main Menu</Button>
        </div>
      )}

      <header className="hud">
        <Counter icon="icon_heart" label="Hull">{`${hud.hp} / ${hud.maxHp}`}</Counter>
        <Counter icon="icon_score" label="Score">{String(hud.score)}</Counter>
        <Counter icon="icon_time" label="Time left">{formatClock(hud.remainingSec)}</Counter>
        <RoundButton
          aria-label={muted ? 'Unmute sound' : 'Mute sound'}
          aria-pressed={muted}
          onClick={() => audio.setMuted(!muted)}
        >
          <MuteIcon muted={muted} />
        </RoundButton>
        <RoundButton icon="icon_pause" aria-label="Pause" disabled={hud.status !== 'running'} onClick={() => session?.pause('manual')} />
      </header>

      {touch && session && hud.status === 'running' && <TouchControls input={session.input} />}
      <LiveRegion message={message} />

      <Dialog open={paused && !portrait} onCancel={() => session?.resume()} labelledBy={titleId}>
        <h2 id={titleId} className="heading">Paused</h2>
        <div className="stack">
          <Button onClick={() => session?.resume()}>Resume</Button>
          <Button variant="secondary" onClick={() => navigate('/')}>Main Menu</Button>
        </div>
      </Dialog>

      {portrait && (
        <div className="rotate" role="alert">
          <Panel as="div" className="menu">
            <h2 className="heading">Rotate your device</h2>
            <p>Pirate Battle is played in landscape. The match is paused.</p>
          </Panel>
        </div>
      )}
    </main>
  )
}
