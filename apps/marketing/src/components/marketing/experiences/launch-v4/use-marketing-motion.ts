"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/** One visibility owner per animated section; no background timers or loops. */
export function useMarketingMotion(threshold = 0.2) {
  const ref = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(false)
  const [documentVisible, setDocumentVisible] = useState(false)
  const [reduced, setReduced] = useState(true)
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)")
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection
    const syncMotion = () =>
      setReduced(media.matches || Boolean(connection?.saveData))
    const syncDocument = () => setDocumentVisible(!document.hidden)
    syncMotion()
    syncDocument()
    media.addEventListener("change", syncMotion)
    document.addEventListener("visibilitychange", syncDocument)
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting)),
      { threshold },
    )
    if (ref.current) observer.observe(ref.current)
    return () => {
      observer.disconnect()
      media.removeEventListener("change", syncMotion)
      document.removeEventListener("visibilitychange", syncDocument)
    }
  }, [threshold])
  return { ref, reduced, active: visible && documentVisible && !reduced }
}

/** A finite sequence which retains the remaining delay when out of view. */
export function useMarketingSequence(
  durations: readonly number[],
  active: boolean,
) {
  const [state, setState] = useState({ index: 0, playing: true, generation: 0 })
  const remaining = useRef(durations[0] ?? 0)
  const generation = useRef(0)
  useEffect(() => {
    if (generation.current !== state.generation) {
      generation.current = state.generation
      remaining.current = durations[state.index] ?? 0
    }
    if (!active || !state.playing) return
    const began = performance.now()
    let fired = false
    const timer = window.setTimeout(() => {
      fired = true
      if (state.index >= durations.length - 1) {
        remaining.current = 0
        setState((current) => ({ ...current, playing: false }))
      } else {
        remaining.current = durations[state.index + 1] ?? 0
        setState((current) => ({ ...current, index: current.index + 1 }))
      }
    }, remaining.current)
    return () => {
      window.clearTimeout(timer)
      if (!fired)
        remaining.current = Math.max(
          0,
          remaining.current - (performance.now() - began),
        )
    }
  }, [active, durations, state.index, state.playing, state.generation])

  const choose = useCallback((index: number) => {
    setState((current) => ({
      index,
      playing: false,
      generation: current.generation + 1,
    }))
  }, [])
  const restart = useCallback(() => {
    setState((current) => ({
      index: 0,
      playing: true,
      generation: current.generation + 1,
    }))
  }, [])
  function toggle() {
    if (!state.playing && remaining.current <= 0) restart()
    else setState((current) => ({ ...current, playing: !current.playing }))
  }
  return { ...state, choose, restart, toggle }
}
