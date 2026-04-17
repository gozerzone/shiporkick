import { useEffect, useRef } from 'react'

interface StreamPreviewHudProps {
  cameraStream: MediaStream | null
}

export function StreamPreviewHud({ cameraStream }: StreamPreviewHudProps) {
  const cameraRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!cameraRef.current) return
    cameraRef.current.srcObject = cameraStream
  }, [cameraStream])

  if (!cameraStream) return null

  return (
    <aside className="hud">
      <header className="hud__header">CAM HUD / LIVE</header>
      <video ref={cameraRef} autoPlay muted playsInline className="hud__video" />
    </aside>
  )
}
