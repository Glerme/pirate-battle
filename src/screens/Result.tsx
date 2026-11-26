import { useNavigate, Navigate } from 'react-router-dom'
import { useRegistration } from '../app/integration'
import { loadLastResult } from '../settings/storage'
import { Button } from '../ui/Button'
import { END_REASON_LABEL, formatDuration } from '../ui/format'
import { Panel } from '../ui/Panel'
import { startPlay } from './nav'
import { useState } from 'react'
import type { MatchResult } from '../game/types'
import type { RegistrationState } from '../ui/types'

const REG_TEXT: Record<RegistrationState['status'], string> = {
  saving: 'Saving…',
  saved: 'Saved',
  pending: 'Pending — will retry',
  failed: 'Failed to save',
}

function ResultView({ result }: { result: MatchResult }) {
  const navigate = useNavigate()
  const reg = useRegistration(result)
  return (
    <main className="screen">
      <Panel className="menu result" aria-labelledby="res-h">
        <h1 id="res-h" className="heading">Battle complete</h1>
        <p className="big-score" aria-label={`Score ${result.score}`}>{result.score}</p>
        <dl className="summary">
          <div><dt>Points</dt><dd>{result.score}</dd></div>
          <div><dt>Time played</dt><dd>{formatDuration(result.durationMs)}</dd></div>
          <div><dt>Result</dt><dd>{END_REASON_LABEL[result.endReason]}</dd></div>
          <div>
            <dt>Registration</dt>
            <dd role="status" className={`reg reg-${reg.status}`}>{REG_TEXT[reg.status]}</dd>
          </div>
        </dl>
        {(reg.status === 'failed' || reg.status === 'pending') && <Button variant="secondary" onClick={reg.retry}>Retry</Button>}
        <div className="stack">
          <Button onClick={() => startPlay(navigate)}>Play Again</Button>
          <Button onClick={() => navigate('/')}>Main Menu</Button>
        </div>
      </Panel>
    </main>
  )
}

export function Result() {
  const [result] = useState(loadLastResult)
  return result ? <ResultView result={result} /> : <Navigate to="/" replace />
}
