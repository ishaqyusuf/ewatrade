"use client"

import { useTRPC } from "@/trpc/client"
import type { StoreConversationMessageProjection } from "@ewatrade/service-commerce"
import {
  drainStoreConversationRecovery,
  latestStoreConversationSequence,
} from "@ewatrade/utils"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef } from "react"

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
  const messagesRef = useRef(input.messages)
  messagesRef.current = input.messages
  const scopeRef = useRef(`${input.storeId}:${input.conversationId}`)
  scopeRef.current = `${input.storeId}:${input.conversationId}`
  const pollingRef = useRef(false)
  const queuedPollRef = useRef(false)
  const acknowledgedRef = useRef(0)
  const operationRef = useRef<{ id: string; sequence: number } | null>(null)
  const acknowledge = useMutation(
    trpc.serviceCommerce.acknowledgeStoreConversationStaffRead.mutationOptions(),
  )

  const poll = useCallback(async () => {
    if (pollingRef.current) {
      queuedPollRef.current = true
      return
    }
    if (
      !input.enabled ||
      !input.conversationId ||
      document.visibilityState !== "visible" ||
      !navigator.onLine
    )
      return
    pollingRef.current = true
    const scope = `${input.storeId}:${input.conversationId}`
    try {
      const afterSequence = latestStoreConversationSequence(messagesRef.current)
      const recovery =
        await drainStoreConversationRecovery<StoreConversationMessageProjection>(
          {
            afterSequence,
            fetchPage: (cursor) =>
              queryClient.fetchQuery(
                trpc.serviceCommerce.storeConversationMessagesAfter.queryOptions(
                  {
                    afterSequence: cursor,
                    conversationId: input.conversationId as string,
                    limit: 100,
                    storeId: input.storeId,
                  },
                  { staleTime: 0 },
                ),
              ),
            sequenceOf: (message) => message.sequence,
          },
        )
      if (recovery.messages.length > 0) {
        if (scopeRef.current !== scope) return
        input.onMessages(recovery.messages)
        if (
          recovery.messages.some(
            (message) => message.author.kind === "customer",
          )
        ) {
          input.onNotice("New customer message received.")
        }
      }
      const sequence = Math.max(afterSequence, recovery.throughSequence)
      if (sequence <= acknowledgedRef.current) return
      if (scopeRef.current !== scope) return
      const operation =
        operationRef.current?.sequence === sequence
          ? operationRef.current
          : { id: crypto.randomUUID(), sequence }
      operationRef.current = operation
      await acknowledge.mutateAsync({
        clientOperationId: operation.id,
        conversationId: input.conversationId,
        readThroughSequence: sequence,
        storeId: input.storeId,
      })
      if (scopeRef.current !== scope) return
      acknowledgedRef.current = sequence
      operationRef.current = null
    } catch {
      if (scopeRef.current !== scope) return
      input.onNotice("Reconnecting. Messages already shown remain available.")
    } finally {
      pollingRef.current = false
      if (queuedPollRef.current) {
        queuedPollRef.current = false
        queueMicrotask(() => void poll())
      }
    }
  }, [
    acknowledge.mutateAsync,
    input.conversationId,
    input.enabled,
    input.onMessages,
    input.onNotice,
    input.storeId,
    queryClient,
    trpc.serviceCommerce.storeConversationMessagesAfter,
  ])

  useEffect(() => {
    if (!input.enabled || !input.conversationId) return
    acknowledgedRef.current = 0
    operationRef.current = null
    queuedPollRef.current = false
    const interval = window.setInterval(() => void poll(), 5_000)
    const resume = () => void poll()
    window.addEventListener("focus", resume)
    window.addEventListener("online", resume)
    document.addEventListener("visibilitychange", resume)
    void poll()
    return () => {
      window.clearInterval(interval)
      window.removeEventListener("focus", resume)
      window.removeEventListener("online", resume)
      document.removeEventListener("visibilitychange", resume)
    }
  }, [input.conversationId, input.enabled, poll])
}
