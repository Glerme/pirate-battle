import { useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { SCENARIO_IDS } from '../api/contracts'
import type { ScenarioId } from '../api/contracts'
import { invalidateMatchQueries } from '../api/queries'
import { getScenario, resetMockData, setScenario, subscribeToScenario } from './scenarios'

export function useNetworkLab() {
  const client = useQueryClient()
  const scenario = useSyncExternalStore(subscribeToScenario, getScenario)

  return {
    scenarios: SCENARIO_IDS,
    scenario,
    setScenario: (next: ScenarioId) => {
      setScenario(next)
      void invalidateMatchQueries(client)
    },
    resetMockData: () => {
      resetMockData()
      void invalidateMatchQueries(client)
    },
  }
}
