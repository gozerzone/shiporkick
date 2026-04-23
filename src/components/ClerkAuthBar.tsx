import { SignInButton, useUser, UserButton } from '@clerk/clerk-react'
import { useEffect } from 'react'
import { publicDb } from '../lib/publicSupabase'

interface ClerkAuthBarProps {
  streamerHandle: string
  onUserId: (id: string | null) => void
}

export function ClerkAuthBar({ streamerHandle, onUserId }: ClerkAuthBarProps) {
  const { user, isLoaded } = useUser()

  useEffect(() => {
    if (!isLoaded) return
    onUserId(user?.id ?? null)
  }, [isLoaded, onUserId, user?.id])

  useEffect(() => {
    if (!user?.id || streamerHandle.length < 3) return
    const db = publicDb()
    if (!db) return
    void db.rpc('link_clerk_profile', {
      p_clerk_user_id: user.id,
      p_username: streamerHandle,
    })
  }, [streamerHandle, user?.id])

  if (!isLoaded) {
    return <p className="eyebrow">CLERK AUTH…</p>
  }

  return (
    <div className="stack clerk-auth-bar">
      {user ? (
        <div className="clerk-auth-bar__row">
          <UserButton afterSignOutUrl="/" />
          <span className="eyebrow">Cloud session linked to Supabase tokens.</span>
        </div>
      ) : (
        <SignInButton mode="modal">
          <button type="button" className="btn btn--primary">
            SIGN IN (CLERK)
          </button>
        </SignInButton>
      )}
    </div>
  )
}
