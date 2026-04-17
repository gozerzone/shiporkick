import { useMemo, useState } from 'react'

interface CaptureState {
  screenStream: MediaStream | null
  cameraStream: MediaStream | null
  isStarting: boolean
  isLive: boolean
  error: string | null
}

interface DocumentPictureInPictureApi {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>
}

function stopStream(stream: MediaStream | null) {
  if (!stream) return
  for (const track of stream.getTracks()) {
    track.stop()
  }
}

export function useCaptureStudio() {
  const [state, setState] = useState<CaptureState>({
    screenStream: null,
    cameraStream: null,
    isStarting: false,
    isLive: false,
    error: null,
  })

  const start = async () => {
    if (state.isStarting || state.isLive) return
    setState((prev) => ({ ...prev, isStarting: true, error: null }))

    try {
      const [screenStream, cameraStream] = await Promise.all([
        navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 60, max: 60 } },
          audio: false,
        }),
        navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        }),
      ])

      setState({
        screenStream,
        cameraStream,
        isStarting: false,
        isLive: true,
        error: null,
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Media capture failed unexpectedly.'
      setState((prev) => ({
        ...prev,
        isStarting: false,
        isLive: false,
        error: message,
      }))
    }
  }

  const stop = () => {
    stopStream(state.screenStream)
    stopStream(state.cameraStream)
    setState({
      screenStream: null,
      cameraStream: null,
      isStarting: false,
      isLive: false,
      error: null,
    })
  }

  const openPiPWindow = async () => {
    if (!state.cameraStream) return false

    const api = (
      window as Window & {
        documentPictureInPicture?: DocumentPictureInPictureApi
      }
    ).documentPictureInPicture

    if (!api) return false

    const pipWindow = await api.requestWindow({ width: 340, height: 220 })
    pipWindow.document.body.style.margin = '0'
    pipWindow.document.body.style.background = '#000'

    const pipVideo = pipWindow.document.createElement('video')
    pipVideo.srcObject = state.cameraStream
    pipVideo.autoplay = true
    pipVideo.muted = true
    pipVideo.playsInline = true
    pipVideo.style.width = '100%'
    pipVideo.style.height = '100%'
    pipVideo.style.objectFit = 'cover'
    pipWindow.document.body.appendChild(pipVideo)

    return true
  }

  return useMemo(
    () => ({
      ...state,
      start,
      stop,
      openPiPWindow,
    }),
    [state],
  )
}
