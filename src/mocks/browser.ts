let startup: Promise<void> | undefined

export async function enableMocks() {
  if (import.meta.env.VITE_ENABLE_MOCKS === 'false') return
  startup ??= (async () => {
    const [{ setupWorker }, { handlers }] = await Promise.all([import('msw/browser'), import('./handlers')])
    await setupWorker(...handlers).start({ onUnhandledRequest: 'bypass' })
  })().catch((error: unknown) => {
    console.warn('Unable to start API mocks', error)
  })
  await startup
}
