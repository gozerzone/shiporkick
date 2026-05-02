import { useState, type ReactNode } from 'react'

const AGREED_KEY = 'shiporkick.disclaimer-agreed'

interface DisclaimerGateProps {
  children: ReactNode
}

export function DisclaimerGate({ children }: DisclaimerGateProps) {
  const [agreed, setAgreed] = useState(() => Boolean(window.localStorage.getItem(AGREED_KEY)))

  if (agreed) return <>{children}</>

  return (
    <>
      <div className="disclaimer-gate">
        <div className="disclaimer-gate__box">
          <div className="disclaimer-gate__logo">WORK OR JERK</div>
          <div className="disclaimer-gate__tagline">CHOOSE TO STREAM YOUR WORK OR BE A JERK</div>
          <div className="disclaimer-gate__text">
            Stream your work in front of strangers — or get jerked off the air when they catch you slacking.
            What happens here is between you, the internet, and whatever poor decisions led you to this page.
            You must be 18 or older to proceed. By clicking Agree you swear on your streak that you&apos;re a legal
            adult. We monitor nothing, moderate nothing, and accept zero responsibility for the chaos that unfolds.
            Enter freely. Leave with your dignity intact — if you can.
          </div>
          <button
            type="button"
            className="btn btn--primary"
            style={{ fontSize: '13px', padding: '12px 24px', letterSpacing: '2px' }}
            onClick={() => {
              window.localStorage.setItem(AGREED_KEY, '1')
              setAgreed(true)
            }}
          >
            I AGREE — I AM 18+
          </button>
          <div className="disclaimer-gate__age">Must be 18 or older to enter</div>
        </div>
      </div>
      {/* Render children hidden so providers/context initialize in background */}
      <div style={{ display: 'none' }}>{children}</div>
    </>
  )
}
