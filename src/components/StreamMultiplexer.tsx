import { useCallback, useEffect, useRef, useState } from 'react'
import { useStreaming } from '../providers/StreamingProvider'

interface StreamMultiplexerProps {
  userId: string
  disabled?: boolean
  kickSignal?: number
  onLiveChange?: (isLive: boolean, hasCamera: boolean) => void
  onIdleKick?: () => void
}

const CAMERA_SIZE = 170
const CAM_X_PERCENT = 82
const CAM_Y_PERCENT = 74
const IDLE_TIMEOUT_MS = 10 * 60 * 1000
const IDLE_SAMPLE_MS = 5000
const IDLE_SAMPLE_WIDTH = 32
const IDLE_SAMPLE_HEIGHT = 18
const IDLE_DIFF_THRESHOLD = 12

function waitVideoReady(video: HTMLVideoElement, label: string, timeoutMs = 25000): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof window.setTimeout> | undefined
    const cleanup = () => {
      if (timer !== undefined) { window.clearTimeout(timer); timer = undefined }
      video.removeEventListener('loadedmetadata', onMeta)
      video.removeEventListener('resize', onResize)
    }
    const finish = () => { if (video.videoWidth > 0 && video.videoHeight > 0) { cleanup(); resolve() } }
    const onMeta = () => finish()
    const onResize = () => finish()
    timer = window.setTimeout(() => {
      cleanup()
      reject(new Error(`${label}: no video dimensions yet. Pick a real screen/window in the share dialog.`))
    }, timeoutMs)
    video.addEventListener('loadedmetadata', onMeta)
    video.addEventListener('resize', onResize)
    finish()
  })
}

function stopStream(stream: MediaStream | null) {
  if (!stream) return
  for (const track of stream.getTracks()) track.stop()
}

export function StreamMultiplexer({
  userId,
  disabled = false,
  kickSignal = 0,
  onLiveChange,
  onIdleKick,
}: StreamMultiplexerProps) {
  const { connectAsHost, disconnect, isConnected, publishMultiplexedTracks, roomName, shareLink, unpublishMultiplexedTracks } = useStreaming()
  const [isStarting, setIsStarting] = useState(false)
  const [isLive, setIsLive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const previewRef = useRef<HTMLVideoElement>(null)
  const renderStopRef = useRef(false)
  const idleIntervalRef = useRef<number | null>(null)
  const lastActiveAtRef = useRef(0)
  const previousSampleRef = useRef<Uint8ClampedArray | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const mixedStreamRef = useRef<MediaStream | null>(null)

  const stopBroadcast = useCallback(async () => {
    renderStopRef.current = true
    unpublishMultiplexedTracks()
    stopStream(screenStreamRef.current)
    stopStream(cameraStreamRef.current)
    stopStream(mixedStreamRef.current)
    screenStreamRef.current = null
    cameraStreamRef.current = null
    mixedStreamRef.current = null
    if (previewRef.current) previewRef.current.srcObject = null
    if (document.pictureInPictureElement) void document.exitPictureInPicture()
    setIsLive(false)
    onLiveChange?.(false, false)
    setIsStarting(false)
    if (idleIntervalRef.current !== null) {
      window.clearInterval(idleIntervalRef.current)
      idleIntervalRef.current = null
    }
    previousSampleRef.current = null
    await disconnect()
  }, [disconnect, onLiveChange, unpublishMultiplexedTracks])

  useEffect(() => {
    return () => { void stopBroadcast() }
  }, [stopBroadcast])

  useEffect(() => {
    if (kickSignal <= 0) return
    if (!isLive && !isStarting) return
    const handle = window.setTimeout(() => { void stopBroadcast() }, 0)
    return () => window.clearTimeout(handle)
  }, [kickSignal, isLive, isStarting, stopBroadcast])

  const startBroadcast = async () => {
    if (disabled || isStarting || isLive) return
    setError(null)
    setIsStarting(true)
    renderStopRef.current = false

    try {
      if (!window.isSecureContext) {
        throw new Error('Screen and camera require HTTPS (or localhost).')
      }
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error('This browser does not support screen capture.')
      }

      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      const screenVideoTrack = screenStream.getVideoTracks()[0]
      if (screenVideoTrack) {
        screenVideoTrack.addEventListener('ended', () => {
          if (renderStopRef.current) return
          setError('Screen share stopped.')
          void stopBroadcast()
        })
      }

      let cameraStream: MediaStream | null = null
      if (navigator.mediaDevices?.getUserMedia) {
        try {
          cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: true,
          })
        } catch { cameraStream = null }
      }
      const cameraAvailable = Boolean(cameraStream?.getVideoTracks().length)

      screenStreamRef.current = screenStream
      cameraStreamRef.current = cameraStream

      const screenVideo = document.createElement('video')
      const cameraVideo = cameraStream ? document.createElement('video') : null
      screenVideo.srcObject = screenStream
      if (cameraVideo && cameraStream) cameraVideo.srcObject = cameraStream
      screenVideo.muted = true
      if (cameraVideo) cameraVideo.muted = true
      screenVideo.playsInline = true
      if (cameraVideo) cameraVideo.playsInline = true
      await screenVideo.play()
      if (cameraVideo) await cameraVideo.play()
      await waitVideoReady(screenVideo, 'Screen capture')
      if (cameraVideo) await waitVideoReady(cameraVideo, 'Camera')
      lastActiveAtRef.current = Date.now()
      previousSampleRef.current = null

      const width = screenVideo.videoWidth || 1920
      const height = screenVideo.videoHeight || 1080
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('2D canvas context unavailable.')

      const renderFrame = () => {
        if (renderStopRef.current) return
        ctx.clearRect(0, 0, width, height)
        ctx.drawImage(screenVideo, 0, 0, width, height)

        if (cameraVideo) {
          const px = (CAM_X_PERCENT / 100) * width
          const py = (CAM_Y_PERCENT / 100) * height
          const radius = (CAMERA_SIZE / 2 / 1280) * width
          const cx = Math.min(Math.max(radius, px), width - radius)
          const cy = Math.min(Math.max(radius, py), height - radius)
          ctx.save()
          ctx.beginPath()
          ctx.arc(cx, cy, radius, 0, Math.PI * 2)
          ctx.clip()
          ctx.drawImage(cameraVideo, cx - radius, cy - radius, radius * 2, radius * 2)
          ctx.restore()
          ctx.lineWidth = 8
          ctx.strokeStyle = '#000'
          ctx.beginPath()
          ctx.arc(cx, cy, radius, 0, Math.PI * 2)
          ctx.stroke()
        }

        requestAnimationFrame(renderFrame)
      }
      renderFrame()

      const sampleCanvas = document.createElement('canvas')
      sampleCanvas.width = IDLE_SAMPLE_WIDTH
      sampleCanvas.height = IDLE_SAMPLE_HEIGHT
      const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true })
      if (!sampleCtx) throw new Error('Idle detector canvas unavailable.')

      const markScreenActivity = () => {
        sampleCtx.drawImage(screenVideo, 0, 0, IDLE_SAMPLE_WIDTH, IDLE_SAMPLE_HEIGHT)
        const pixels = sampleCtx.getImageData(0, 0, IDLE_SAMPLE_WIDTH, IDLE_SAMPLE_HEIGHT).data
        const previous = previousSampleRef.current
        if (!previous) {
          previousSampleRef.current = new Uint8ClampedArray(pixels)
          lastActiveAtRef.current = Date.now()
          return
        }
        let totalDiff = 0
        for (let i = 0; i < pixels.length; i += 4) {
          totalDiff += Math.abs(pixels[i] - previous[i])
          totalDiff += Math.abs(pixels[i + 1] - previous[i + 1])
          totalDiff += Math.abs(pixels[i + 2] - previous[i + 2])
        }
        if (totalDiff / (IDLE_SAMPLE_WIDTH * IDLE_SAMPLE_HEIGHT * 3) >= IDLE_DIFF_THRESHOLD) {
          lastActiveAtRef.current = Date.now()
        }
        previousSampleRef.current = new Uint8ClampedArray(pixels)
      }
      markScreenActivity()
      idleIntervalRef.current = window.setInterval(() => {
        if (renderStopRef.current) return
        markScreenActivity()
        if (Date.now() - lastActiveAtRef.current < IDLE_TIMEOUT_MS) return
        setError('Auto-kick: screen idle for 10 minutes.')
        onIdleKick?.()
        void stopBroadcast()
      }, IDLE_SAMPLE_MS)

      const composedStream = canvas.captureStream(30)
      mixedStreamRef.current = composedStream
      if (previewRef.current) previewRef.current.srcObject = composedStream

      const composedVideoTrack = composedStream.getVideoTracks()[0]
      const cameraAudioTrack = cameraStream?.getAudioTracks()[0]
      if (!composedVideoTrack) throw new Error('Composed stream produced no video track.')

      await connectAsHost(userId)
      await publishMultiplexedTracks(composedVideoTrack, cameraAudioTrack)

      setIsLive(true)
      onLiveChange?.(true, cameraAvailable)
    } catch (captureError) {
      const message = captureError instanceof Error ? captureError.message : 'Failed to start multiplexer.'
      setError(message)
      await stopBroadcast()
    } finally {
      setIsStarting(false)
    }
  }

  return (
    <div className="multiplexer">
      <div className="multiplexer__stage">
        <video ref={previewRef} autoPlay muted playsInline className="multiplexer__preview" />
        {!isLive && !isStarting && (
          <div className="multiplexer__idle-cover">No stream active</div>
        )}
      </div>

      <div className="multiplexer__controls">
        {isLive ? (
          <button
            type="button"
            className="btn btn-danger"
            style={{ flex: 1, fontSize: '12px', padding: '10px' }}
            onClick={() => void stopBroadcast()}
          >
            ■ STOP STREAM
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--primary"
            style={{ flex: 1, fontSize: '12px', padding: '10px' }}
            onClick={() => void startBroadcast()}
            disabled={isStarting || disabled}
          >
            {isStarting ? 'ARMING...' : '▶ START STREAM'}
          </button>
        )}
      </div>

      {disabled && <p className="multiplexer__error">Streaming disabled during cooldown.</p>}
      {error && <p className="multiplexer__error">{error}</p>}

      <div className="multiplexer__meta">
        <span style={{ color: isConnected ? 'var(--green)' : 'var(--muted)' }}>
          {isConnected ? '● LIVE' : '○ OFFLINE'}
        </span>
        <span>Room: {roomName}</span>
      </div>
      <p className="multiplexer__share">Share: {shareLink}</p>
    </div>
  )
}
