import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { coerceHttpsUrl } from './secureUrls'
import { getPublicEnv } from './runtimeEnv'

let cached: SupabaseClient | null | undefined

export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached

  const supabaseUrlRaw = getPublicEnv('VITE_SUPABASE_URL')
  const supabaseUrl = supabaseUrlRaw ? coerceHttpsUrl(supabaseUrlRaw) : ''
  const supabaseAnonKey = getPublicEnv('VITE_SUPABASE_ANON_KEY')

  if (supabaseUrl && supabaseAnonKey) {
    cached = createClient(supabaseUrl, supabaseAnonKey)
  } else {
    cached = null
  }
  return cached
}
