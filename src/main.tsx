import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadRuntimeConfig } from './lib/runtimeEnv'
import { StreamingProvider } from './providers/StreamingProvider'

const root = document.getElementById('root')

void Promise.race([
  loadRuntimeConfig().catch(() => {
    /* missing/invalid JSON is fine; build-time env + defaults still apply */
  }),
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, 10000)
  }),
]).then(() => {
    if (!root) return
    createRoot(root).render(
      <StrictMode>
        <StreamingProvider>
          <App />
        </StreamingProvider>
      </StrictMode>,
    )
  })
