import { useEffect, useMemo, useState } from 'react'
import { fetchActiveStreamers } from '../lib/globalLeaderboardRealtime'
import {
  fetchMessagesForHandle,
  sendStreamerMessage,
  subscribeToMessages,
  type StreamerMessage,
} from '../lib/streamerMessages'

interface StreamerMessagesProps {
  isLoggedIn: boolean
  currentHandle: string
  currentDisplayName: string
  xp: number
}

export function StreamerMessages({
  isLoggedIn,
  currentHandle,
  currentDisplayName,
  xp,
}: StreamerMessagesProps) {
  const [messages, setMessages] = useState<StreamerMessage[]>([])
  const [recipientHandle, setRecipientHandle] = useState('')
  const [recipientDisplayName, setRecipientDisplayName] = useState('')
  const [body, setBody] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [availableRecipients, setAvailableRecipients] = useState<Array<{ handle: string; label: string }>>([])

  const canSend = isLoggedIn && xp >= 1
  const disabledReason = !isLoggedIn ? 'Log in with an account to message streamers.' : xp < 1 ? 'You need at least 1 XP to message streamers.' : null

  const loadMessages = useMemo(
    () => async () => {
      if (!currentHandle) {
        setMessages([])
        return
      }
      try {
        const data = await fetchMessagesForHandle(currentHandle)
        setMessages(data)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load messages.'
        setNotice(message)
      }
    },
    [currentHandle],
  )

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void loadMessages()
    }, 0)
    return () => window.clearTimeout(handle)
  }, [loadMessages])

  useEffect(() => {
    if (!currentHandle) return
    return subscribeToMessages(currentHandle, () => {
      void loadMessages()
    })
  }, [currentHandle, loadMessages])

  useEffect(() => {
    let mounted = true
    const loadRecipients = async () => {
      try {
        const rows = await fetchActiveStreamers()
        if (!mounted) return
        const next = rows
          .filter((row) => row.username)
          .map((row) => ({
            handle: row.username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
            label: row.username,
          }))
          .filter((row) => row.handle && row.handle !== currentHandle)
        const deduped = Array.from(new Map(next.map((row) => [row.handle, row])).values())
        setAvailableRecipients(deduped)
      } catch {
        if (mounted) setAvailableRecipients([])
      }
    }
    void loadRecipients()
    return () => {
      mounted = false
    }
  }, [currentHandle])

  const onRecipientChange = (value: string) => {
    setRecipientHandle(value)
    const matched = availableRecipients.find((recipient) => recipient.handle === value)
    setRecipientDisplayName(matched?.label ?? value)
  }

  const onSend = async () => {
    if (!canSend) return
    setNotice(null)
    setIsSending(true)
    try {
      await sendStreamerMessage({
        senderHandle: currentHandle,
        recipientHandle,
        senderDisplayName: currentDisplayName,
        recipientDisplayName: recipientDisplayName || recipientHandle,
        senderXp: xp,
        body,
      })
      setBody('')
      setNotice('Message sent.')
      await loadMessages()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Message failed.'
      setNotice(message)
    } finally {
      setIsSending(false)
    }
  }

  return (
    <article className="panel">
      <h2 className="panel__title">Streamer Messages</h2>
      <div className="stack">
        <p>Direct message other streamers.</p>
        <p>Requirement: account login + at least 1 XP.</p>
        {disabledReason ? <p className="error">{disabledReason}</p> : null}

        <label htmlFor="recipient">To</label>
        <select
          id="recipient"
          className="select"
          value={recipientHandle}
          onChange={(event) => onRecipientChange(event.target.value)}
          disabled={!canSend}
        >
          <option value="">Select streamer</option>
          {availableRecipients.map((recipient) => (
            <option key={recipient.handle} value={recipient.handle}>
              {recipient.label}
            </option>
          ))}
        </select>
        <label htmlFor="messageBody">Message</label>
        <textarea
          id="messageBody"
          className="select"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Keep it short and useful."
          disabled={!canSend}
        />
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => void onSend()}
          disabled={!canSend || isSending || !recipientHandle || !body.trim()}
        >
          {isSending ? 'SENDING...' : 'SEND MESSAGE'}
        </button>
        {notice ? <p>{notice}</p> : null}

        <h3 className="panel__title">Inbox / Sent</h3>
        {messages.length === 0 ? (
          <p>No messages yet.</p>
        ) : (
          <div className="stack">
            {messages.map((message) => {
              const incoming = message.recipient_handle === currentHandle
              return (
                <div key={message.id} className="message-card">
                  <p>{incoming ? `From: ${message.sender_display_name}` : `To: ${message.recipient_display_name}`}</p>
                  <p>{message.body}</p>
                  <p>{new Date(message.created_at).toLocaleString()}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </article>
  )
}
