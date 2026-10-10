"use client"

import { useEffect, useSyncExternalStore } from "react"

/**
 * Page FABs and the shell's assistant launcher share the small-screen
 * bottom-right corner. A page FAB takes the corner; the launcher either
 * stacks above it or, for a menu that already offers chat, steps aside.
 */
export type PageFabSlotMode = "stack" | "replace"

const mounted = { stack: 0, replace: 0 }
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify() {
  for (const listener of listeners) listener()
}

export function usePageFabSlot(mode: PageFabSlotMode) {
  useEffect(() => {
    mounted[mode] += 1
    notify()
    return () => {
      mounted[mode] -= 1
      notify()
    }
  }, [mode])
}

export function usePageFabSlotMode(): PageFabSlotMode | null {
  return useSyncExternalStore(
    subscribe,
    () => (mounted.replace ? "replace" : mounted.stack ? "stack" : null),
    () => null,
  )
}

const ASSISTANT_REQUEST = "ewatrade:open-quick-assistant"

/** Returns false when no mounted assistant launcher took the request. */
export function requestQuickAssistant() {
  const request = new Event(ASSISTANT_REQUEST, { cancelable: true })
  window.dispatchEvent(request)
  return request.defaultPrevented
}

export function useQuickAssistantRequests(open: () => void) {
  useEffect(() => {
    const onRequest = (event: Event) => {
      event.preventDefault()
      open()
    }
    window.addEventListener(ASSISTANT_REQUEST, onRequest)
    return () => window.removeEventListener(ASSISTANT_REQUEST, onRequest)
  }, [open])
}
