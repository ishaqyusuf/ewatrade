"use client"

import { useEffect, useSyncExternalStore } from "react"

/**
 * Page FABs and the shell's assistant launcher share the small-screen
 * bottom-right corner. A mounted page FAB owns it; the launcher yields.
 */
let pageFabs = 0
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePageFabSlot() {
  useEffect(() => {
    pageFabs += 1
    for (const listener of listeners) listener()
    return () => {
      pageFabs -= 1
      for (const listener of listeners) listener()
    }
  }, [])
}

export function usePageFabOwnsSlot() {
  return useSyncExternalStore(
    subscribe,
    () => pageFabs > 0,
    () => false,
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
