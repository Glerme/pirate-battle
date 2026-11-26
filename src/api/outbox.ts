import { useEffect, useSyncExternalStore } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { registerMatch } from './client'
import type { MatchRecord, RegisterStatus } from './contracts'
import { invalidateMatchQueries, isPermanentApiError, queryKeys } from './queries'

type MatchRegistrationStatus = 'saving' | 'saved' | 'pending' | 'failed'

const storageKey = 'pendingMatches'
const attempts = new Map<string, Promise<RegisterStatus>>()
const failed = new Set<string>()
const unpersisted = new Map<string, MatchRecord>()
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

function pendingMatches(): MatchRecord[] {
  try {
    const records: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    return Array.isArray(records) ? records.filter(
      (record) => record && typeof record.matchId === 'string',
    ) : []
  } catch {
    return []
  }
}

export function enqueueMatch(record: MatchRecord) {
  const pending = pendingMatches()
  if (pending.some(({ matchId }) => matchId === record.matchId)) return
  try {
    localStorage.setItem(storageKey, JSON.stringify([...pending, record]))
    unpersisted.delete(record.matchId)
  } catch {
    // Retain the result for manual retry if storage is blocked or full.
    unpersisted.set(record.matchId, record)
  }
  notify()
}

function sendMatch(record: MatchRecord) {
  const { matchId } = record
  const existing = attempts.get(matchId)
  if (existing) return existing

  const attempt = Promise.resolve().then(async () => {
    try {
      enqueueMatch(record)
      // Storage blocked/full: still send the in-memory record (it stays 'unpersisted' for manual retry on failure).
      const queued = pendingMatches().find((match) => match.matchId === matchId)
      const status = await registerMatch(queued ?? record)
      try {
        localStorage.setItem(storageKey, JSON.stringify(pendingMatches().filter((match) => match.matchId !== matchId)))
      } catch { /* server already has it; the idempotent PUT covers a stale entry */ }
      unpersisted.delete(matchId)
      failed.delete(matchId)
      return status
    } catch (error) {
      if (isPermanentApiError(error) || error instanceof DOMException) failed.add(matchId)
      throw error
    } finally {
      attempts.delete(matchId)
      notify()
    }
  })
  attempts.set(matchId, attempt)
  notify()
  return attempt
}

function registrationOptions(client: QueryClient, matchId: string) {
  return {
    mutationKey: queryKeys.registerMatch(matchId),
    mutationFn: (record: MatchRecord) => {
      if (record.matchId !== matchId) throw new Error('Registration match ID mismatch')
      return sendMatch(record)
    },
    networkMode: 'always' as const,
    onSuccess: () => invalidateMatchQueries(client),
  }
}

export function useRegisterMatch(matchId: string) {
  return useMutation(registrationOptions(useQueryClient(), matchId))
}

export async function flushMatchOutbox(client: QueryClient, matchId?: string) {
  const records = new Map(unpersisted)
  pendingMatches().forEach((record) => records.set(record.matchId, record))
  const pending = [...records.values()].filter((record) => matchId === undefined || record.matchId === matchId)
  await Promise.allSettled(pending.map((record) => client.getMutationCache()
    .build(client, registrationOptions(client, record.matchId))
    .execute(record)))
}

export function startMatchOutbox(client: QueryClient) {
  const flush = () => { void flushMatchOutbox(client) }
  window.addEventListener('online', flush)
  flush()
  return () => window.removeEventListener('online', flush)
}

export const usePendingMatchCount = () => useSyncExternalStore(subscribe, () => pendingMatches().length + unpersisted.size)

export function useMatchRegistration(matchId: string) {
  const client = useQueryClient()
  const status = useSyncExternalStore(subscribe, (): MatchRegistrationStatus => {
    if (attempts.has(matchId)) return 'saving'
    if (failed.has(matchId) || unpersisted.has(matchId)) return 'failed'
    return pendingMatches().some((record) => record.matchId === matchId) ? 'pending' : 'saved'
  })

  useEffect(() => {
    void flushMatchOutbox(client, matchId)
  }, [client, matchId])

  return { status, retry: () => flushMatchOutbox(client, matchId) }
}
