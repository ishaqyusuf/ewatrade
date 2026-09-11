import {
  appendVoiceWaveformLevel,
  createEmptyVoiceWaveform,
} from "@/lib/customer-voice-waveform"
import { formatStoreConversationVoiceElapsed } from "@ewatrade/utils"
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio"
import { File } from "expo-file-system"
import { useCallback, useEffect, useRef, useState } from "react"
import { AppState } from "react-native"
import { isCustomerVoiceStartCurrent } from "./customer-voice-start-guard"

export { formatStoreConversationVoiceElapsed }

export type CustomerVoiceState =
  | { kind: "idle" }
  | { kind: "requesting" }
  | { elapsedMs: number; kind: "recording"; levels: number[] }
  | { kind: "unavailable"; message: string }

export function useCustomerVoiceNote(input: {
  enabled: boolean
  onReady: (file: { name: string; size: number; uri: string }) => boolean
  scopeKey: string
}) {
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  })
  const recorderState = useAudioRecorderState(recorder, 100)
  const [state, setState] = useState<CustomerVoiceState>({ kind: "idle" })
  const discardRef = useRef(false)
  const finalizingRef = useRef(false)
  const startGenerationRef = useRef(0)
  const scopeRef = useRef(input.scopeKey)
  const enabledRef = useRef(input.enabled)
  const onReadyRef = useRef(input.onReady)
  const stateRef = useRef<CustomerVoiceState>(state)
  enabledRef.current = input.enabled
  onReadyRef.current = input.onReady
  stateRef.current = state

  const discardUri = useCallback((uri: string | null) => {
    if (!uri) return
    try {
      new File(uri).delete()
    } catch {
      // A missing device-local recording is already discarded.
    }
  }, [])

  const finalize = useCallback(
    (uri: string | null) => {
      if (finalizingRef.current) return
      finalizingRef.current = true
      if (!uri || discardRef.current) {
        discardUri(uri)
      } else {
        try {
          const file = new File(uri)
          const size = file.info().size
          if (!size || !file.exists) {
            discardUri(uri)
            setState({
              kind: "unavailable",
              message: "This recording could not be prepared. Try again.",
            })
            finalizingRef.current = false
            return
          }
          onReadyRef.current({ name: "voice-note.m4a", size, uri })
        } catch {
          discardUri(uri)
          setState({
            kind: "unavailable",
            message: "This recording could not be prepared. Try again.",
          })
          finalizingRef.current = false
          return
        }
      }
      setState({ kind: "idle" })
      finalizingRef.current = false
    },
    [discardUri],
  )

  const stop = useCallback(
    async (discard = false) => {
      startGenerationRef.current += 1
      discardRef.current = discard
      const wasRequesting = stateRef.current.kind === "requesting"
      try {
        if (recorder.isRecording) await recorder.stop()
        if (wasRequesting) setState({ kind: "idle" })
        else finalize(recorder.uri)
      } catch {
        discardUri(recorder.uri)
        setState({
          kind: "unavailable",
          message: "Recording was interrupted. Try again.",
        })
      } finally {
        await setAudioModeAsync({ allowsRecording: false }).catch(() => {})
      }
    },
    [discardUri, finalize, recorder],
  )

  useEffect(() => {
    const scopeChanged = scopeRef.current !== input.scopeKey
    scopeRef.current = input.scopeKey
    if (
      scopeChanged &&
      (state.kind === "recording" || state.kind === "requesting")
    ) {
      void stop(true)
    }
  }, [input.scopeKey, state.kind, stop])

  useEffect(() => {
    if (
      !input.enabled &&
      (state.kind === "recording" || state.kind === "requesting")
    ) {
      void stop(true)
    }
  }, [input.enabled, state.kind, stop])

  useEffect(() => {
    if (state.kind !== "recording") return
    if (recorderState.mediaServicesDidReset) {
      void stop(true)
      setState({
        kind: "unavailable",
        message: "Recording was interrupted by the device. Try again.",
      })
      return
    }
    if (recorderState.isRecording) {
      setState((current) => ({
        elapsedMs: recorderState.durationMillis,
        kind: "recording",
        levels: appendVoiceWaveformLevel(
          current.kind === "recording" ? current.levels : [],
          recorderState.metering,
        ),
      }))
      return
    }
    if (recorderState.durationMillis > 0 && recorderState.url) {
      finalize(recorderState.url)
    }
  }, [finalize, recorderState, state.kind, stop])

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (
        next !== "active" &&
        (state.kind === "recording" || state.kind === "requesting")
      )
        void stop(true)
    })
    return () => subscription.remove()
  }, [state.kind, stop])

  useEffect(
    () => () => {
      if (
        stateRef.current.kind !== "recording" &&
        stateRef.current.kind !== "requesting"
      )
        return
      startGenerationRef.current += 1
      discardRef.current = true
      void (async () => {
        try {
          if (recorder.isRecording) await recorder.stop()
          discardUri(recorder.uri)
        } catch {
          discardUri(recorder.uri)
        } finally {
          await setAudioModeAsync({ allowsRecording: false }).catch(() => {})
        }
      })()
    },
    [discardUri, recorder],
  )

  const start = useCallback(async () => {
    if (
      !enabledRef.current ||
      AppState.currentState !== "active" ||
      state.kind === "recording" ||
      state.kind === "requesting"
    )
      return
    const attempt = {
      generation: startGenerationRef.current + 1,
      scopeKey: scopeRef.current,
    }
    startGenerationRef.current = attempt.generation
    const isCurrent = () =>
      isCustomerVoiceStartCurrent(attempt, {
        appState: AppState.currentState,
        enabled: enabledRef.current,
        generation: startGenerationRef.current,
        scopeKey: scopeRef.current,
      })
    setState({ kind: "requesting" })
    try {
      const permission = await requestRecordingPermissionsAsync()
      if (!isCurrent()) return
      if (!permission.granted) {
        setState({
          kind: "unavailable",
          message: "Microphone access is needed to record a voice note.",
        })
        return
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      })
      if (!isCurrent()) {
        await setAudioModeAsync({ allowsRecording: false }).catch(() => {})
        return
      }
      await recorder.prepareToRecordAsync()
      if (!isCurrent()) {
        await setAudioModeAsync({ allowsRecording: false }).catch(() => {})
        return
      }
      discardRef.current = false
      finalizingRef.current = false
      recorder.record({ forDuration: 60 })
      setState({
        elapsedMs: 0,
        kind: "recording",
        levels: createEmptyVoiceWaveform(),
      })
    } catch {
      if (isCurrent())
        setState({
          kind: "unavailable",
          message: "Voice recording is unavailable right now. Try again.",
        })
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {})
    }
  }, [recorder, state.kind])

  return {
    cancel: () => void stop(true),
    dismiss: () => setState({ kind: "idle" }),
    start,
    state,
    stop: () => void stop(false),
  }
}
