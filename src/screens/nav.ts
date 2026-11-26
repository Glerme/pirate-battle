import type { NavigateFunction } from 'react-router-dom'

/** A reload on /play abandons the match; only an in-app start may stay on the route. */
export const playGuard = { armed: false }

export function startPlay(navigate: NavigateFunction) {
  playGuard.armed = true
  navigate('/play')
}
