"use client"

import { getDataCacheGeneration } from "@/trpc/client"
import type { ServiceJobDraft } from "@ewatrade/assistant/general/contracts"
import { useSyncExternalStore } from "react"

let current: { draft: ServiceJobDraft; generation: number } | null = null
const listeners = new Set<() => void>()
export function setServiceIntakeDraft(draft: ServiceJobDraft | null) {
  current = draft ? { draft, generation: getDataCacheGeneration() } : null
  for (const listener of listeners) listener()
}
export function useServiceIntakeDraft(tenantId: string, storeId: string) {
  const saved = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => current,
    () => null,
  )
  return saved?.generation === getDataCacheGeneration() &&
    saved.draft.origin.tenantId === tenantId &&
    saved.draft.origin.storeId === storeId
    ? saved.draft
    : undefined
}
