"use client"

import { SETUP_ATTACHMENT_LIMITS } from "@ewatrade/assistant/setup/attachments"
import { useCallback, useEffect, useRef, useState } from "react"
import { voiceRecordingFile } from "./voice-recording-file"

// Mirrors the storefront voice-note recorder; candidates for a shared hook.
const MIME_PREFERENCE = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
] as const

export type SetupRecorderState =
  | { kind: "idle" }
  | { kind: "requesting" }
  | { kind: "preparing" }
  | { kind: "recording"; elapsedMs: number; levels: number[] }
  | { kind: "unsupported"; message: string }

/**
 * Records one voice note up to the setup limit. The note is handed over only
 * when the owner stops it; cancel, hiding the tab or unmounting discards it.
 */
export function useSetupVoiceRecorder(input: {
  onReady: (file: File, durationMs: number) => void
}) {
  const maxDurationMs = SETUP_ATTACHMENT_LIMITS.AUDIO.maxDurationMs
  const [state, setState] = useState<SetupRecorderState>({ kind: "idle" })
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const discardRef = useRef(false)
  const generationRef = useRef(0)
  const startedAtRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const frameRef = useRef<number | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const onReadyRef = useRef(input.onReady)
  onReadyRef.current = input.onReady

  const cleanup = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current)
    timerRef.current = null
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    const context = audioContextRef.current
    audioContextRef.current = null
    if (context) void context.close().catch(() => undefined)
    for (const track of streamRef.current?.getTracks() ?? []) track.stop()
    streamRef.current = null
  }, [])

  const finish = useCallback(
    (discard: boolean) => {
      if (discard) generationRef.current++
      discardRef.current = discard
      const recorder = recorderRef.current
      if (recorder?.state === "recording") recorder.stop()
      else {
        cleanup()
        recorderRef.current = null
        setState((current) =>
          current.kind === "unsupported" ? current : { kind: "idle" },
        )
      }
    },
    [cleanup],
  )

  useEffect(() => {
    const hide = () => {
      if (document.visibilityState !== "visible") finish(true)
    }
    document.addEventListener("visibilitychange", hide)
    return () => {
      document.removeEventListener("visibilitychange", hide)
      finish(true)
    }
  }, [finish])

  const start = useCallback(async () => {
    if (
      state.kind === "recording" ||
      state.kind === "requesting" ||
      state.kind === "preparing"
    )
      return
    if (
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      !window.isSecureContext
    ) {
      setState({
        kind: "unsupported",
        message: "Voice notes can't be recorded in this browser.",
      })
      return
    }
    const mimeType = MIME_PREFERENCE.find((candidate) =>
      MediaRecorder.isTypeSupported(candidate),
    )
    if (!mimeType) {
      setState({
        kind: "unsupported",
        message: "This browser can't record a supported voice note.",
      })
      return
    }
    const generation = ++generationRef.current
    setState({ kind: "requesting" })
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (generation !== generationRef.current) {
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
      recorder.onstop = async () => {
        const durationMs = Date.now() - startedAtRef.current
        cleanup()
        recorderRef.current = null
        const chunks = chunksRef.current
        chunksRef.current = []
        if (generation !== generationRef.current || discardRef.current) {
          setState({ kind: "idle" })
          return
        }
        if (!chunks.length || durationMs < 500) {
          setState({ kind: "idle" })
          return
        }
        setState({ kind: "preparing" })
        try {
          const result = await voiceRecordingFile(
            new Blob(chunks, { type: mimeType }),
          )
          if (generation !== generationRef.current) return
          onReadyRef.current(result.file, result.durationMs)
          setState({ kind: "idle" })
        } catch {
          if (generation === generationRef.current)
            setState({
              kind: "unsupported",
              message:
                "This recording could not be prepared. Please try again.",
            })
        }
      }
      recorder.onerror = () => {
        finish(true)
        setState({
          kind: "unsupported",
          message: "Recording was interrupted. Please try again.",
        })
      }
      // A small level meter so the owner can see the microphone is hearing them.
      const context = new AudioContext()
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      context.createMediaStreamSource(stream).connect(analyser)
      audioContextRef.current = context
      const samples = new Uint8Array(analyser.fftSize)
      const meter = () => {
        analyser.getByteTimeDomainData(samples)
        const size = Math.floor(samples.length / 12)
        const levels = Array.from({ length: 12 }, (_, bucket) => {
          let peak = 0
          for (let index = bucket * size; index < (bucket + 1) * size; index++)
            peak = Math.max(peak, Math.abs((samples[index] ?? 128) - 128))
          return Math.min(1, peak / 64)
        })
        setState((current) =>
          current.kind === "recording" ? { ...current, levels } : current,
        )
        frameRef.current = window.requestAnimationFrame(meter)
      }
      startedAtRef.current = Date.now()
      recorder.start(250)
      setState({ kind: "recording", elapsedMs: 0, levels: [] })
      frameRef.current = window.requestAnimationFrame(meter)
      timerRef.current = window.setInterval(() => {
        const elapsedMs = Date.now() - startedAtRef.current
        setState((current) =>
          current.kind === "recording" ? { ...current, elapsedMs } : current,
        )
        if (elapsedMs >= maxDurationMs) finish(false)
      }, 250)
    } catch {
      if (generation !== generationRef.current) return
      cleanup()
      setState({
        kind: "unsupported",
        message: "Allow microphone access to record a voice note.",
      })
    }
  }, [cleanup, finish, maxDurationMs, state.kind])

  return {
    state,
    start,
    stop: () => finish(false),
    cancel: () => finish(true),
    dismiss: () => setState({ kind: "idle" }),
    maxDurationMs,
  }
}

export function formatRecorderElapsed(ms: number) {
  const seconds = Math.floor(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}
