import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { StreamingProvider } from './providers/StreamingProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StreamingProvider>
      <App />
    </StreamingProvider>
  </StrictMode>,
)
