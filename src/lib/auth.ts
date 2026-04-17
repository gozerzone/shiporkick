export type AuthProvider = 'clerk' | 'supabase'

export interface AuthContext {
  provider: AuthProvider
  isConfigured: boolean
  status: 'disconnected' | 'ready'
  hint: string
}

export function getAuthContext(provider: AuthProvider): AuthContext {
  if (provider === 'clerk') {
    const hasKey = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY)
    return {
      provider,
      isConfigured: hasKey,
      status: hasKey ? 'ready' : 'disconnected',
      hint: hasKey
        ? 'Clerk key detected. Wrap App with ClerkProvider to enable login.'
        : 'Set VITE_CLERK_PUBLISHABLE_KEY to enable Clerk auth.',
    }
  }

  const hasUrl = Boolean(import.meta.env.VITE_SUPABASE_URL)
  const hasAnon = Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY)
  const isConfigured = hasUrl && hasAnon
  return {
    provider,
    isConfigured,
    status: isConfigured ? 'ready' : 'disconnected',
    hint: isConfigured
      ? 'Supabase keys detected. Build auth UI with @supabase/supabase-js.'
      : 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable Supabase auth.',
  }
}
