import { publicDb } from './publicSupabase'
import { getSupabase } from './supabaseClient'

/** PostgREST `.or()` values with `-` / `.` must be double-quoted; double any `"` inside. */
function quoteOrFilterValue(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

export interface StreamerMessage {
  id: string
  sender_handle: string
  recipient_handle: string
  sender_display_name: string
  recipient_display_name: string
  sender_xp: number
  body: string
  created_at: string
}

interface SendMessageInput {
  senderHandle: string
  recipientHandle: string
  senderDisplayName: string
  recipientDisplayName: string
  senderXp: number
  body: string
}

export async function fetchMessagesForHandle(handle: string): Promise<StreamerMessage[]> {
  const supabase = publicDb()
  if (!supabase) return []

  const normalized = handle.trim().toLowerCase()
  if (!normalized) return []

  const q = quoteOrFilterValue(normalized)
  const { data, error } = await supabase
    .from('streamer_messages')
    .select(
      'id, sender_handle, recipient_handle, sender_display_name, recipient_display_name, sender_xp, body, created_at',
    )
    .or(`recipient_handle.eq.${q},sender_handle.eq.${q}`)
    .order('created_at', { ascending: false })
    .limit(40)

  if (error) throw new Error(error.message)
  return (data ?? []) as StreamerMessage[]
}

export async function sendStreamerMessage(input: SendMessageInput): Promise<void> {
  const supabase = publicDb()
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }
  const body = input.body.trim()
  if (!body) throw new Error('Message is empty.')
  if (input.senderXp < 1) throw new Error('You need at least 1 XP to send messages.')

  const { error } = await supabase.from('streamer_messages').insert({
    sender_handle: input.senderHandle.trim().toLowerCase(),
    recipient_handle: input.recipientHandle.trim().toLowerCase(),
    sender_display_name: input.senderDisplayName.trim(),
    recipient_display_name: input.recipientDisplayName.trim(),
    sender_xp: input.senderXp,
    body,
  })

  if (error) throw new Error(error.message)
}

export function subscribeToMessages(handle: string, onRefresh: () => void) {
  const root = getSupabase()
  if (!root) return () => {}

  const normalized = handle.trim().toLowerCase()
  if (!normalized) return () => {}

  const channel = root
    .channel(`streamer-messages:${normalized}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'streamer_messages' }, onRefresh)
    .subscribe()

  return () => {
    void root.removeChannel(channel)
  }
}
