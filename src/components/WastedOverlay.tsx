interface WastedOverlayProps {
  visible: boolean
}

export function WastedOverlay({ visible }: WastedOverlayProps) {
  if (!visible) return null

  return (
    <div className="wasted-overlay" role="alert" aria-live="assertive">
      <div className="wasted-overlay__scanlines" />
      <h2 className="wasted-overlay__title">WASTED</h2>
      <p className="wasted-overlay__subtitle">Procrastination penalty engaged.</p>
    </div>
  )
}
