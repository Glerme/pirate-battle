import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { App } from './app/App'
import { createQueryClient } from './api/queries'
import { startMatchOutbox } from './api/outbox'
import { enableMocks } from './mocks'

const queryClient = createQueryClient()

// The mock worker must be up before the first API request (outbox flush included).
await enableMocks()
startMatchOutbox(queryClient)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
