import { useRef, type PointerEvent } from 'react'
import type { InputAction, InputSink } from '../game/types'
import { img } from '../ui/img'

const LEFT: [InputAction, string, string][] = [
  ['forward', 'icon_forward', 'Forward'],
  ['turnLeft', 'icon_turn_left', 'Turn left'],
  ['turnRight', 'icon_turn_right', 'Turn right'],
]
const RIGHT: [InputAction, string, string][] = [
  ['fireFront', 'icon_fire_front', 'Fire front'],
  ['fireLeft', 'icon_fire_left', 'Fire left'],
  ['fireRight', 'icon_fire_right', 'Fire right'],
]

function PadButton({ input, action, icon, label }: { input: InputSink; action: InputAction; icon: string; label: string }) {
  const held = useRef(new Set<number>())
  // One action stays pressed while any of its pointers is down (multitouch on the same button).
  const down = (e: PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    if (held.current.size === 0) input.press(action)
    held.current.add(e.pointerId)
  }
  const up = (e: PointerEvent<HTMLButtonElement>) => {
    if (!held.current.delete(e.pointerId)) return
    if (held.current.size === 0) input.release(action)
  }
  return (
    <button
      type="button"
      className="round pad"
      aria-label={label}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onContextMenu={(e) => e.preventDefault()}
    >
      <img src={img(icon)} alt="" draggable={false} />
    </button>
  )
}

export function TouchControls({ input, opacity }: { input: InputSink; opacity: number }) {
  return (
    <>
      <div className="pad-group pad-left" role="group" aria-label="Movement controls" style={{ opacity }}>
        {LEFT.map(([a, i, l]) => <PadButton key={a} input={input} action={a} icon={i} label={l} />)}
      </div>
      <div className="pad-group pad-right" role="group" aria-label="Weapon controls" style={{ opacity }}>
        {RIGHT.map(([a, i, l]) => <PadButton key={a} input={input} action={a} icon={i} label={l} />)}
      </div>
    </>
  )
}
