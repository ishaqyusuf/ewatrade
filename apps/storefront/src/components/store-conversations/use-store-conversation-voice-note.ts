"use client"

import { formatStoreConversationVoiceElapsed } from "@ewatrade/utils"
import { useCallback, useEffect, useRef, useState } from "react"

const MIME_PREFERENCE = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
] as const

export function chooseStoreConversationRecorderMimeType(
  acceptedMimeTypes: readonly string[],
  isSupported: (mimeType: string) => boolean,
) {
  return (
    MIME_PREFERENCE.find(
      (mimeType) =>
        acceptedMimeTypes.includes(mimeType) && isSupported(mimeType),
    ) ?? null
  )
}

export { formatStoreConversationVoiceElapsed }

type RecorderState =
  | { kind: "idle" }
  | { kind: "requesting" }
  | { elapsedMs: number; kind: "recording"; levels: number[] }
  | { kind: "unsupported"; message: string }

export function useStoreConversationVoiceNote(input: {
  acceptedMimeTypes: readonly string[]
  enabled: boolean
  maxDurationMs: number
  onReady: (file: File) => void
  scopeKey: string
}) {
  const [state, setState] = useState<RecorderState>({ kind: "idle" })
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const discardRef = useRef(false)
  const startedAtRef = useRef(0)
  const intervalRef = useRef<number | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const waveformFrameRef = useRef<number | null>(null)
  const scopeRef = useRef(input.scopeKey)
  const enabledRef = useRef(input.enabled)
  const onReadyRef = useRef(input.onReady)
  enabledRef.current = input.enabled
  onReadyRef.current = input.onReady

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current)
    intervalRef.current = null
  }, [])

  const stopWaveform = useCallback(() => {
    if (waveformFrameRef.current !== null) {
      window.cancelAnimationFrame(waveformFrameRef.current)
    }
    waveformFrameRef.current = null
    const context = audioContextRef.current
    audioContextRef.current = null
    if (context) void context.close().catch(() => {})
  }, [])

  const startWaveform = useCallback((stream: MediaStream) => {
    const context = new AudioContext()
    const source = context.createMediaStreamSource(stream)
    const analyser = context.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.65
    source.connect(analyser)
    audioContextRef.current = context
    const samples = new Uint8Array(analyser.fftSize)

    const update = () => {
      analyser.getByteTimeDomainData(samples)
      const bucketSize = Math.max(1, Math.floor(samples.length / 28))
      const levels = Array.from({ length: 28 }, (_, bucket) => {
        const start = bucket * bucketSize
        const end = Math.min(samples.length, start + bucketSize)
        let peak = 0
        for (let index = start; index < end; index += 1) {
          peak = Math.max(peak, Math.abs((samples[index] ?? 128) - 128))
        }
        return Math.min(1, peak / 64)
      })
      setState((current) =>
        current.kind === "recording" ? { ...current, levels } : current,
      )
      waveformFrameRef.current = window.requestAnimationFrame(update)
    }
    waveformFrameRef.current = window.requestAnimationFrame(update)
  }, [])

  const releaseStream = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop()
    streamRef.current = null
  }, [])

  const finish = useCallback(
    (discard: boolean) => {
      discardRef.current = discard
      clearTimer()
      stopWaveform()
      const recorder = recorderRef.current
      if (recorder?.state === "recording") recorder.stop()
      else {
        releaseStream()
        recorderRef.current = null
        setState({ kind: "idle" })
      }
    },
    [clearTimer, releaseStream, stopWaveform],
  )

  useEffect(() => {
    scopeRef.current = input.scopeKey
    finish(true)
  }, [finish, input.scopeKey])

  useEffect(() => {
    if (!input.enabled) finish(true)
  }, [finish, input.enabled])

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== "visible") finish(true)
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange)
      finish(true)
    }
  }, [finish])

  const start = useCallback(async () => {
    if (
      !enabledRef.current ||
      state.kind === "recording" ||
      state.kind === "requesting"
    )
      return
    if (
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      !window.isSecureContext
    ) {
      setState({
        kind: "unsupported",
        message: "Voice recording is unavailable in this browser.",
      })
      return
    }
    const mimeType = chooseStoreConversationRecorderMimeType(
      input.acceptedMimeTypes,
      (candidate) => MediaRecorder.isTypeSupported(candidate),
    )
    if (!mimeType) {
      setState({
        kind: "unsupported",
        message: "This browser cannot create a supported voice note.",
      })
      return
    }
    const scope = scopeRef.current
    setState({ kind: "requesting" })
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (scope !== scopeRef.current || !enabledRef.current) {
        for (const track of stream.getTracks()) track.stop()
        return
      }
      const recorder = new MediaRecorder(stream, { mimeType })
      streamRef.current = stream
      recorderRef.current = recorder
      chunksRef.current = []
      discardRef.current = false
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onerror = () => {
        discardRef.current = true
        setState({
          kind: "unsupported",
          message: "Recording was interrupted. Try again.",
        })
      }
      recorder.onstop = () => {
        clearTimer()
        releaseStream()
        recorderRef.current = null
        const chunks = chunksRef.current
        chunksRef.current = []
        if (
          !discardRef.current &&
          chunks.length > 0 &&
          scope === scopeRef.current
        ) {
          const extension =
            mimeType === "audio/webm"
              ? "webm"
              : mimeType === "audio/ogg"
                ? "ogg"
                : mimeType === "audio/mpeg"
                  ? "mp3"
                  : mimeType === "audio/wav"
                    ? "wav"
                    : "m4a"
          onReadyRef.current(
            new File(chunks, `voice-note.${extension}`, { type: mimeType }),
          )
        }
        setState({ kind: "idle" })
      }
      startedAtRef.current = Date.now()
      recorder.start(250)
      setState({ elapsedMs: 0, kind: "recording", levels: [] })
      startWaveform(stream)
      intervalRef.current = window.setInterval(() => {
        const elapsedMs = Date.now() - startedAtRef.current
        setState((current) =>
          current.kind === "recording" ? { ...current, elapsedMs } : current,
        )
        if (elapsedMs >= input.maxDurationMs) finish(false)
      }, 250)
    } catch {
      releaseStream()
      setState({
        kind: "unsupported",
        message: "Microphone access is needed to record a voice note.",
      })
    }
  }, [
    clearTimer,
    finish,
    input.acceptedMimeTypes,
    input.maxDurationMs,
    releaseStream,
    startWaveform,
    state.kind,
  ])

  return {
    cancel: () => finish(true),
    dismiss: () => setState({ kind: "idle" }),
    start,
    state,
    stop: () => finish(false),
  }
}
