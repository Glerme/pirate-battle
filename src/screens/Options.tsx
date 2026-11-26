import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CAPTAIN_NAME_LIMITS, OPTION_LIMITS } from '../game/config'
import { loadOptions, saveOptions, toDraft, validateOptions, type OptionsDraft } from '../settings/storage'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { RoundButton } from '../ui/RoundButton'

interface FieldProps {
  name: keyof OptionsDraft
  label: string
  value: string
  error?: string
  onChange: (v: string) => void
  numeric?: { min: number; max: number }
  /** Short noun for stepper button names; must not contain the full label (keeps getByLabel unambiguous). */
  unit?: string
  hint: string
}

function Field({ label, value, error, onChange, numeric, unit, hint, name }: FieldProps) {
  const id = useId()
  const step = (d: number) => numeric && onChange(String(Math.min(numeric.max, Math.max(numeric.min, (Number.parseInt(value, 10) || numeric.min) + d))))
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="field-row">
        {numeric && <RoundButton icon="icon_minus" aria-label={`Decrease ${unit}`} onClick={() => step(-1)} />}
        <input
          id={id}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode={numeric ? 'numeric' : 'text'}
          maxLength={numeric ? 3 : CAPTAIN_NAME_LIMITS.maxLength * 2}
          autoComplete="off"
          aria-invalid={!!error}
          aria-describedby={`${id}-hint ${error ? `${id}-err` : ''}`.trim()}
        />
        {numeric && <RoundButton icon="icon_plus" aria-label={`Increase ${unit}`} onClick={() => step(1)} />}
      </div>
      <small id={`${id}-hint`}>{hint}</small>
      {error && <small id={`${id}-err`} className="error" role="alert">{error}</small>}
    </div>
  )
}

export function Options() {
  const navigate = useNavigate()
  const [draft, setDraft] = useState(() => toDraft(loadOptions()))
  const [saved, setSaved] = useState(false)
  const errors = validateOptions(draft)
  const invalid = Object.keys(errors).length > 0
  const set = (k: keyof OptionsDraft) => (v: string) => {
    setDraft({ ...draft, [k]: v })
    setSaved(false)
  }
  const { sessionTimeSec: st, spawnIntervalSec: sp } = OPTION_LIMITS
  return (
    <main className="screen">
      <Panel className="menu options" aria-labelledby="opt-h">
        <h1 id="opt-h" className="heading">Options</h1>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            if (invalid) return
            saveOptions({ sessionTimeSec: Number(draft.sessionTimeSec), spawnIntervalSec: Number(draft.spawnIntervalSec), captainName: draft.captainName })
            setSaved(true)
          }}
        >
          <Field name="sessionTimeSec" unit="session seconds" label="Game session time" numeric={st} value={draft.sessionTimeSec} error={errors.sessionTimeSec} onChange={set('sessionTimeSec')} hint={`${st.min}–${st.max} seconds`} />
          <Field name="spawnIntervalSec" unit="spawn seconds" label="Enemy spawn time" numeric={sp} value={draft.spawnIntervalSec} error={errors.spawnIntervalSec} onChange={set('spawnIntervalSec')} hint={`${sp.min}–${sp.max} seconds between enemies`} />
          <Field name="captainName" label="Captain name" value={draft.captainName} error={errors.captainName} onChange={set('captainName')} hint={`${CAPTAIN_NAME_LIMITS.minLength}–${CAPTAIN_NAME_LIMITS.maxLength} characters`} />
          <p role="status" className="saved">{saved ? 'Options saved.' : ''}</p>
          <div className="stack">
            <Button type="submit" disabled={invalid}>Save</Button>
            <Button variant="secondary" onClick={() => navigate('/')}>Main Menu</Button>
          </div>
        </form>
      </Panel>
    </main>
  )
}
