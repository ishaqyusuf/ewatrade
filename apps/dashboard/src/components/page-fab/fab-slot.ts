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

// A composer prefill waits here until an assistant chat takes it: the quick
// panel mounts lazily, and the /assistant fallback mounts after navigation.
let pendingDraft: string | null = null
const draftListeners = new Set<() => void>()

/**
 * Opens the quick assistant, optionally with `draft` in its composer.
 * Returns false when no mounted assistant launcher took the request; the
 * draft then stays pending for the /assistant page.
 */
export function requestQuickAssistant({ draft }: { draft?: string } = {}) {
  if (draft) {
    pendingDraft = draft
    for (const listener of draftListeners) listener()
  }
  const request = new Event(ASSISTANT_REQUEST, { cancelable: true })
  window.dispatchEvent(request)
  return request.defaultPrevented
}

/** Calls `take` with a pending prefill on mount and whenever a new one arrives. */
export function useAssistantDraftRequests(take: (draft: string) => void) {
  useEffect(() => {
    const onDraft = () => {
      const draft = pendingDraft
      pendingDraft = null
      if (draft) take(draft)
    }
    onDraft()
    draftListeners.add(onDraft)
    return () => {
      draftListeners.delete(onDraft)
    }
  }, [take])
}

let launchers = 0

export function useQuickAssistantRequests(open: () => void) {
  useEffect(() => {
    const onRequest = (event: Event) => {
      event.preventDefault()
      open()
    }
    window.addEventListener(ASSISTANT_REQUEST, onRequest)
    return () => window.removeEventListener(ASSISTANT_REQUEST, onRequest)
  }, [open])
  useEffect(() => {
    launchers += 1
    notify()
    return () => {
      launchers -= 1
      notify()
    }
  }, [])
}

/** True while the shell's quick assistant launcher is mounted. */
export function useQuickAssistantLauncher() {
  return useSyncExternalStore(
    subscribe,
    () => launchers > 0,
    () => false,
  )
}
