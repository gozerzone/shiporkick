import { createClient } from '@supabase/supabase-js'
import { coerceHttpsUrl } from './secureUrls'

const supabaseUrlRaw = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const supabaseUrl = supabaseUrlRaw ? coerceHttpsUrl(supabaseUrlRaw) : ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null
