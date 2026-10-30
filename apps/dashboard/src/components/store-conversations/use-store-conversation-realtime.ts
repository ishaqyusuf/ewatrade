"use client"

import { getDataCacheGeneration, useTRPC } from "@/trpc/client"
import { mountOwnedRead } from "@ewatrade/assistant/general/staff-activity-target"
import type { StoreConversationMessageProjection } from "@ewatrade/service-commerce"
import {
  drainStoreConversationRecovery,
  latestStoreConversationSequence,
} from "@ewatrade/utils"
import {
  type QueryKey,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { useEffect, useRef } from "react"

export function useStoreConversationRealtime(input: {
  conversationId: string | null
  enabled: boolean
  messages: StoreConversationMessageProjection[]
  onMessages: (messages: StoreConversationMessageProjection[]) => void
  onNotice: (message: string) => void
  storeId: string
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const latest = useRef(input)
  latest.current = input
  const { conversationId, enabled, storeId } = input
  const cacheGeneration = getDataCacheGeneration()
  const { mutateAsync: acknowledge } = useMutation(
    trpc.serviceCommerce.acknowledgeStoreConversationStaffRead.mutationOptions(),
  )

  useEffect(() => {
    if (!enabled || !conversationId) return
    const owner = crypto.randomUUID()
    let stopped = false
    let polling = false
    let queued = false
    let generation = 0
    let readKey: QueryKey | undefined
    let acknowledged = 0
    let appliedThrough = latestStoreConversationSequence(
      latest.current.messages,
    )
    let operation: { id: string; sequence: number } | null = null
    const currentScope = () =>
      !stopped &&
      cacheGeneration === getDataCacheGeneration() &&
      latest.current.enabled &&
      latest.current.conversationId === conversationId &&
      latest.current.storeId === storeId
    const canRecover = () =>
      currentScope() &&
      document.visibilityState === "visible" &&
      navigator.onLine
    const cancelRead = () => {
      generation++
      if (readKey)
        void queryClient.cancelQueries({ queryKey: readKey, exact: true })
    }
    const poll = async () => {
      if (!canRecover()) return
      if (polling) {
        queued = true
        return
      }
      polling = true
      const startedGeneration = generation
      const current = () => canRecover() && generation === startedGeneration
      const requireCurrent = () => {
        if (!current()) throw new DOMException("Recovery ended", "AbortError")
      }
      try {
        const afterSequence = Math.max(
          appliedThrough,
          latestStoreConversationSequence(latest.current.messages),
        )
        const recovery =
          await drainStoreConversationRecovery<StoreConversationMessageProjection>(
            {
              afterSequence,
              fetchPage: async (cursor) => {
                requireCurrent()
                const options = mountOwnedRead(
                  trpc.serviceCommerce.storeConversationMessagesAfter.queryOptions(
                    {
                      afterSequence: cursor,
                      conversationId,
                      limit: 100,
                      storeId,
                    },
                    { staleTime: 0, gcTime: 0, trpc: { abortOnUnmount: true } },
                  ),
                  owner,
                )
                readKey = options.queryKey
                try {
                  const page = await queryClient.fetchQuery(options)
                  requireCurrent()
                  return page
                } finally {
                  if (readKey === options.queryKey) readKey = undefined
                }
              },
              sequenceOf: (message) => message.sequence,
            },
          )
        if (!current()) return
        if (recovery.messages.length > 0) {
          latest.current.onMessages(recovery.messages)
          if (!current()) return
          if (
            recovery.messages.some(
              (message) => message.author.kind === "customer",
            )
          )
            latest.current.onNotice("New customer message received.")
        }
        const sequence = Math.max(afterSequence, recovery.throughSequence)
        if (!current()) return
        appliedThrough = Math.max(appliedThrough, sequence)
        if (sequence <= acknowledged) return
        if (operation?.sequence !== sequence)
          operation = { id: crypto.randomUUID(), sequence }
        await acknowledge({
          clientOperationId: operation.id,
          conversationId,
          readThroughSequence: sequence,
          storeId,
        })
        if (!current()) return
        acknowledged = sequence
        operation = null
      } catch {
        if (current())
          latest.current.onNotice(
            "Reconnecting. Messages already shown remain available.",
          )
      } finally {
        polling = false
        if (queued) {
          queued = false
          if (canRecover()) queueMicrotask(() => void poll())
        }
      }
    }
    const resume = () => {
      if (!canRecover()) {
        queued = false
        cancelRead()
        return
      }
      void poll()
    }
    const interval = window.setInterval(() => void poll(), 5_000)
    window.addEventListener("focus", resume)
    window.addEventListener("online", resume)
    window.addEventListener("offline", resume)
    document.addEventListener("visibilitychange", resume)
    void poll()
    return () => {
      stopped = true
      queued = false
      cancelRead()
      window.clearInterval(interval)
      window.removeEventListener("focus", resume)
      window.removeEventListener("online", resume)
      window.removeEventListener("offline", resume)
      document.removeEventListener("visibilitychange", resume)
    }
  }, [
    acknowledge,
    cacheGeneration,
    conversationId,
    enabled,
    queryClient,
    storeId,
    trpc,
  ])
}
