"use client"

import { useCallback, useEffect, useRef, useState } from "react"

const SOUND_PREFERENCE_KEY = "ewatrade:store-conversation-sound:v1"

export function useStoreConversationAlerts() {
  const [soundEnabled, setSoundEnabled] = useState(false)
  const audioContextRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    const enabled = localStorage.getItem(SOUND_PREFERENCE_KEY) === "enabled"
    setSoundEnabled(enabled)
    const armPersistedSound = async () => {
      if (!enabled) return
      const context = audioContextRef.current ?? new AudioContext()
      audioContextRef.current = context
      if (context.state === "suspended") await context.resume()
      window.removeEventListener("pointerdown", armPersistedSound)
      window.removeEventListener("keydown", armPersistedSound)
    }
    if (enabled) {
      window.addEventListener("pointerdown", armPersistedSound, { once: true })
      window.addEventListener("keydown", armPersistedSound, { once: true })
    }
    return () => {
      window.removeEventListener("pointerdown", armPersistedSound)
      window.removeEventListener("keydown", armPersistedSound)
      void audioContextRef.current?.close()
      audioContextRef.current = null
    }
  }, [])

  const setSound = useCallback(async (enabled: boolean) => {
    setSoundEnabled(enabled)
    localStorage.setItem(SOUND_PREFERENCE_KEY, enabled ? "enabled" : "disabled")
    if (!enabled) return
    const context = audioContextRef.current ?? new AudioContext()
    audioContextRef.current = context
    if (context.state === "suspended") await context.resume()
  }, [])

  const alertStoreResponse = useCallback(() => {
    if (
      !soundEnabled ||
      document.visibilityState !== "visible" ||
      !document.hasFocus()
    )
      return
    const context = audioContextRef.current
    if (!context || context.state !== "running") return
    const startAt = context.currentTime
    const gain = context.createGain()
    gain.gain.setValueAtTime(0.0001, startAt)
    gain.gain.exponentialRampToValueAtTime(0.08, startAt + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.24)
    gain.connect(context.destination)
    for (const [offset, frequency] of [
      [0, 660],
      [0.1, 880],
    ] as const) {
      const oscillator = context.createOscillator()
      oscillator.frequency.setValueAtTime(frequency, startAt + offset)
      oscillator.connect(gain)
      oscillator.start(startAt + offset)
      oscillator.stop(startAt + offset + 0.14)
    }
  }, [soundEnabled])

  return { alertStoreResponse, setSound, soundEnabled }
}
