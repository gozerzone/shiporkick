interface WastedOverlayProps {
  visible: boolean
}

function CracksSVG() {
  return (
    <svg
      className="wasted-overlay__cracks"
      width="100%"
      height="100%"
      viewBox="0 0 800 600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <g stroke="white" fill="none">
        {/* Primary radial cracks */}
        <path
          d="M400 300 L120 40 M400 300 L692 15 M400 300 L15 278 M400 300 L790 392 M400 300 L372 5 M400 300 L58 572 M400 300 L762 572 M400 300 L785 178"
          strokeWidth="1.5"
        />
        {/* Secondary cracks */}
        <path
          d="M200 155 L332 268 M604 168 L472 265 M92 418 L272 340 M664 458 L522 346 M338 78 L392 172 M680 260 L620 310"
          strokeWidth="0.8"
        />
        {/* Micro-cracks */}
        <path
          d="M172 68 L218 142 M624 92 L588 158 M70 346 L142 318 M708 510 L662 464 M442 26 L418 96 M750 320 L710 355"
          strokeWidth="0.4"
        />
      </g>
    </svg>
  )
}

export function WastedOverlay({ visible }: WastedOverlayProps) {
  if (!visible) return null

  return (
    <div className="wasted-overlay" role="alert" aria-live="assertive">
      <CracksSVG />
      <h2 className="wasted-overlay__title">WASTED</h2>
      <p className="wasted-overlay__sub">Procrastination penalty engaged.</p>
      <p className="wasted-overlay__hint">Cooldown redirecting…</p>
    </div>
  )
}
