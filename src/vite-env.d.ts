/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_LIVEKIT_URL?: string
  readonly VITE_LIVEKIT_TOKEN?: string
  readonly VITE_LIVEKIT_TOKEN_ENDPOINT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
