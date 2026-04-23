import { ClerkProvider } from '@clerk/clerk-react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadRuntimeConfig, getPublicEnv } from './lib/runtimeEnv'
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
    const clerkKey = getPublicEnv('VITE_CLERK_PUBLISHABLE_KEY')
    const tree = (
      <StrictMode>
        <StreamingProvider>
          <App />
        </StreamingProvider>
      </StrictMode>
    )
    createRoot(root).render(
      clerkKey ? <ClerkProvider publishableKey={clerkKey}>{tree}</ClerkProvider> : tree,
    )
  })
