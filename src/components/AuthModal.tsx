import { useState } from 'react'
import { getSupabase } from '../lib/supabaseClient'

interface AuthModalProps {
  onClose: () => void
}

export function AuthModal({ onClose }: AuthModalProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'magic' | 'password'>('magic')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)

  const supabase = getSupabase()
  const disabled = !supabase

  const sendMagicLink = async () => {
    if (!supabase || !email.trim()) return
    setBusy(true); setMessage(null); setIsError(false)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      })
      if (error) throw error
      setMessage('Check your email for a sign-in link.')
    } catch (e) {
      setIsError(true)
      setMessage(e instanceof Error ? e.message : 'Sign-in failed.')
    } finally { setBusy(false) }
  }

  const signInWithPassword = async () => {
    if (!supabase || !email.trim() || !password) return
    setBusy(true); setMessage(null); setIsError(false)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (error) throw error
      onClose()
    } catch (e) {
      setIsError(true)
      setMessage(e instanceof Error ? e.message : 'Sign-in failed.')
    } finally { setBusy(false) }
  }

  const signUpWithPassword = async () => {
    if (!supabase || !email.trim() || !password) return
    setBusy(true); setMessage(null); setIsError(false)
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: window.location.origin },
      })
      if (error) throw error
      setMessage('Account created. Check your email to confirm, then sign in.')
    } catch (e) {
      setIsError(true)
      setMessage(e instanceof Error ? e.message : 'Sign-up failed.')
    } finally { setBusy(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box--sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-box__header">
          <span className="modal-box__title">SIGN IN</span>
          <button type="button" className="modal-box__close" onClick={onClose}>✕</button>
        </div>

        {disabled && (
          <p className="error">Auth unavailable — Supabase config missing.</p>
        )}

        <div className="stack">
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              type="button"
              className={`btn ${mode === 'magic' ? 'btn--primary' : 'btn-muted'}`}
              style={{ flex: 1, fontSize: 10 }}
              onClick={() => { setMode('magic'); setMessage(null) }}
            >MAGIC LINK</button>
            <button
              type="button"
              className={`btn ${mode === 'password' ? 'btn--primary' : 'btn-muted'}`}
              style={{ flex: 1, fontSize: 10 }}
              onClick={() => { setMode('password'); setMessage(null) }}
            >PASSWORD</button>
          </div>

          <input
            className="select"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && mode === 'magic') void sendMagicLink() }}
            disabled={busy || disabled}
          />

          {mode === 'password' && (
            <input
              className="select"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void signInWithPassword() }}
              disabled={busy || disabled}
            />
          )}

          {mode === 'magic' ? (
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || disabled || !email.trim()}
              onClick={() => void sendMagicLink()}
            >{busy ? 'SENDING...' : 'SEND MAGIC LINK'}</button>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="btn btn--primary"
                style={{ flex: 1 }}
                disabled={busy || disabled || !email.trim() || !password}
                onClick={() => void signInWithPassword()}
              >SIGN IN</button>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ flex: 1 }}
                disabled={busy || disabled || !email.trim() || !password}
                onClick={() => void signUpWithPassword()}
              >CREATE</button>
            </div>
          )}

          {message && (
            <p style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: isError ? 'var(--danger)' : 'var(--green)',
              textAlign: 'center',
            }}>{message}</p>
          )}

          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.6 }}>
            Email auth is required to track stats and tokens across devices.
          </p>
        </div>
      </div>
    </div>
  )
}
