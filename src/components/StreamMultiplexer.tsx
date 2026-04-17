import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { useStreaming } from '../providers/StreamingProvider'

interface Point {
  x: number
  y: number
}

interface StreamMultiplexerProps {
  userId: string
  disabled?: boolean
  kickSignal?: number
}

const CAMERA_SIZE = 170

function stopStream(stream: MediaStream | null) {
  if (!stream) return
  for (const track of stream.getTracks()) {
    track.stop()
  }
}

export function StreamMultiplexer({
  userId,
  disabled = false,
  kickSignal = 0,
}: StreamMultiplexerProps) {
  const {
    connectAsHost,
    disconnect,
    isConnected,
    publishMultiplexedTracks,
    roomName,
    shareLink,
    unpublishMultiplexedTracks,
  } = useStreaming()
  const [isStarting, setIsStarting] = useState(false)
  const [isLive, setIsLive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pipHint, setPipHint] = useState<string | null>(null)
  const [position, setPosition] = useState<Point>({ x: 32, y: 32 })
  const [isDragging, setIsDragging] = useState(false)

  const positionRef = useRef(position)
  const previewRef = useRef<HTMLVideoElement>(null)
  const pipRef = useRef<HTMLVideoElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const renderStopRef = useRef(false)
  const dragOffsetRef = useRef<Point>({ x: 0, y: 0 })

  const screenStreamRef = useRef<MediaStream | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const mixedStreamRef = useRef<MediaStream | null>(null)
  useEffect(() => {
    positionRef.current = position
  }, [position])

  useEffect(() => {
    return () => {
      void stopBroadcast()
    }
  }, [])

  useEffect(() => {
    if (kickSignal <= 0) return
    if (!isLive && !isStarting) return
    void stopBroadcast()
  }, [kickSignal, isLive, isStarting])

  const stopBroadcast = async () => {
    renderStopRef.current = true
    unpublishMultiplexedTracks()
    stopStream(screenStreamRef.current)
    stopStream(cameraStreamRef.current)
    stopStream(mixedStreamRef.current)

    screenStreamRef.current = null
    cameraStreamRef.current = null
    mixedStreamRef.current = null

    if (previewRef.current) {
      previewRef.current.srcObject = null
    }
    if (pipRef.current) {
      pipRef.current.srcObject = null
    }

    if (document.pictureInPictureElement) {
      void document.exitPictureInPicture()
    }

    setIsLive(false)
    setIsStarting(false)
    await disconnect()
  }

  const startBroadcast = async () => {
    if (disabled || isStarting || isLive) return

    setError(null)
    setIsStarting(true)
    renderStopRef.current = false

    try {
      await connectAsHost(userId)

      const [screenStream, cameraStream] = await Promise.all([
        navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        }),
        navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        }),
      ])

      screenStreamRef.current = screenStream
      cameraStreamRef.current = cameraStream

      const screenVideo = document.createElement('video')
      const cameraVideo = document.createElement('video')
      screenVideo.srcObject = screenStream
      cameraVideo.srcObject = cameraStream
      screenVideo.muted = true
      cameraVideo.muted = true
      screenVideo.playsInline = true
      cameraVideo.playsInline = true
      await Promise.all([screenVideo.play(), cameraVideo.play()])

      const width = screenVideo.videoWidth || 1920
      const height = screenVideo.videoHeight || 1080
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        throw new Error('2D canvas context unavailable.')
      }

      const renderFrame = () => {
        if (renderStopRef.current) return
        ctx.clearRect(0, 0, width, height)
        ctx.drawImage(screenVideo, 0, 0, width, height)

        const px = (positionRef.current.x / 100) * width
        const py = (positionRef.current.y / 100) * height
        const radius = (CAMERA_SIZE / 2 / 1280) * width
        const clampedX = Math.min(Math.max(radius, px), width - radius)
        const clampedY = Math.min(Math.max(radius, py), height - radius)

        ctx.save()
        ctx.beginPath()
        ctx.arc(clampedX, clampedY, radius, 0, Math.PI * 2)
        ctx.clip()
        ctx.drawImage(
          cameraVideo,
          clampedX - radius,
          clampedY - radius,
          radius * 2,
          radius * 2,
        )
        ctx.restore()

        ctx.lineWidth = 8
        ctx.strokeStyle = '#000000'
        ctx.beginPath()
        ctx.arc(clampedX, clampedY, radius, 0, Math.PI * 2)
        ctx.stroke()

        requestAnimationFrame(renderFrame)
      }

      renderFrame()

      const composedStream = canvas.captureStream(30)
      mixedStreamRef.current = composedStream
      if (previewRef.current) {
        previewRef.current.srcObject = composedStream
      }
      if (pipRef.current) {
        pipRef.current.srcObject = cameraStream
        await pipRef.current.play()
      }

      const composedVideoTrack = composedStream.getVideoTracks()[0]
      const cameraAudioTrack = cameraStream.getAudioTracks()[0]
      if (!composedVideoTrack) {
        throw new Error('Composed stream did not produce a video track.')
      }
      await publishMultiplexedTracks(composedVideoTrack, cameraAudioTrack)

      if (
        pipRef.current &&
        'pictureInPictureEnabled' in document &&
        document.pictureInPictureEnabled
      ) {
        try {
          await pipRef.current.requestPictureInPicture()
          setPipHint('Camera PiP engaged. You can keep eyes on stream while working in other apps.')
        } catch {
          setPipHint('PiP auto-launch was blocked. Use browser PiP controls to open manually.')
        }
      } else {
        setPipHint('Picture-in-Picture is not supported in this browser.')
      }

      setIsLive(true)
    } catch (captureError) {
      const message =
        captureError instanceof Error ? captureError.message : 'Failed to start multiplexer.'
      setError(message)
      await stopBroadcast()
    } finally {
      setIsStarting(false)
    }
  }

  const onDragStart = (event: PointerEvent<HTMLButtonElement>) => {
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const xPx = (positionRef.current.x / 100) * rect.width
    const yPx = (positionRef.current.y / 100) * rect.height
    dragOffsetRef.current = {
      x: event.clientX - xPx,
      y: event.clientY - yPx,
    }
    setIsDragging(true)
  }

  const onDragMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const xPx = event.clientX - rect.left - dragOffsetRef.current.x
    const yPx = event.clientY - rect.top - dragOffsetRef.current.y

    const x = Math.min(Math.max((xPx / rect.width) * 100, 7), 93)
    const y = Math.min(Math.max((yPx / rect.height) * 100, 10), 90)
    setPosition({ x, y })
  }

  const onDragEnd = () => {
    setIsDragging(false)
  }

  return (
    <div className="multiplexer">
      <div className="actions">
        <button
          className="btn btn--primary"
          type="button"
          onClick={isLive ? () => void stopBroadcast() : () => void startBroadcast()}
          disabled={isStarting || disabled}
        >
          {isStarting ? 'ARMING MULTIPLEXER...' : isLive ? 'STOP MULTIPLEXER' : 'START MULTIPLEXER'}
        </button>
      </div>
      {disabled ? <p className="error">Streaming disabled during cooldown.</p> : null}

      <div
        className="multiplexer__stage"
        ref={stageRef}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerLeave={onDragEnd}
      >
        <video ref={previewRef} autoPlay muted playsInline className="preview" />
        <button
          type="button"
          className="camera-chip"
          style={{ left: `${position.x}%`, top: `${position.y}%` }}
          onPointerDown={onDragStart}
          aria-label="Drag camera overlay"
        >
          CAM
        </button>
      </div>
      <video ref={pipRef} autoPlay muted playsInline className="pip-source" />

      <p>Captures screen + camera simultaneously and composites to one stream for LiveKit.</p>
      {pipHint ? <p>{pipHint}</p> : null}
      <p>Room: {roomName}</p>
      <p>Status: {isConnected ? 'CONNECTED' : 'DISCONNECTED'}</p>
      <p>Share Link (subscribe-only): {shareLink}</p>
      {error ? <p className="error">Multiplexer error: {error}</p> : null}
    </div>
  )
}
