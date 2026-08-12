"use client"

import type {
  StoreConversationSelectRequestInput,
  StoreConversationTimelineProjection,
} from "@ewatrade/service-commerce"
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react"

import {
  type StoreConversationKeyedOperation,
  prependOlderStoreConversationMessages,
  resolveStoreConversationKeyedOperation,
  resolveStoreConversationOperationId,
  storeConversationRequestSelectionKey,
} from "./store-conversation-client-state"

type Conversation = StoreConversationTimelineProjection["conversation"]
type Message = StoreConversationTimelineProjection["messages"][number]

export type StoreConversationLoadState =
  | { kind: "loading" }
  | { code?: string; kind: "error"; message: string }
  | (StoreConversationTimelineProjection & { kind: "ready" })

async function parseResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { message?: string }
  if (!response.ok) {
    throw Object.assign(new Error(body.message ?? "Request failed."), {
      code: (body as { code?: string }).code,
    })
  }
  return body
}

export function useStoreConversation(publicToken: string) {
  const [state, setState] = useState<StoreConversationLoadState>({
    kind: "loading",
  })
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [startingNewRequest, setStartingNewRequestState] = useState(false)
  const [selectingMessageId, setSelectingMessageId] = useState<string | null>(
    null,
  )
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const operationIdRef = useRef<string | null>(null)
  const selectionOperationRef = useRef<StoreConversationKeyedOperation | null>(
    null,
  )

  const loadTimeline = useCallback(
    async (conversation: Conversation) => {
      const params = new URLSearchParams({
        conversationId: conversation.id,
        publicToken,
      })
      const timeline = await parseResponse<StoreConversationTimelineProjection>(
        await fetch(`/api/store-conversations/timeline?${params}`, {
          cache: "no-store",
        }),
      )
      setState({ ...timeline, kind: "ready" })
    },
    [publicToken],
  )

  const bootstrap = useCallback(
    async (resetGuest = false) => {
      setState({ kind: "loading" })
      try {
        const result = await parseResponse<{ conversation: Conversation }>(
          await fetch("/api/store-conversations/bootstrap", {
            body: JSON.stringify({ publicToken, resetGuest }),
            headers: { "content-type": "application/json" },
            method: "POST",
          }),
        )
        await loadTimeline(result.conversation)
      } catch (error) {
        setState({
          code:
            error instanceof Error && "code" in error
              ? String(error.code)
              : undefined,
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "The conversation is unavailable.",
        })
      }
    },
    [loadTimeline, publicToken],
  )

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  const loadOlder = useCallback(async () => {
    if (state.kind !== "ready" || state.nextCursor === null || loadingOlder) {
      return
    }
    setLoadingOlder(true)
    try {
      const params = new URLSearchParams({
        beforeSequence: String(state.nextCursor),
        conversationId: state.conversation.id,
        publicToken,
      })
      const timeline = await parseResponse<StoreConversationTimelineProjection>(
        await fetch(`/api/store-conversations/timeline?${params}`, {
          cache: "no-store",
        }),
      )
      setState({
        ...timeline,
        kind: "ready",
        messages: prependOlderStoreConversationMessages(
          state.messages,
          timeline.messages,
        ),
      })
    } catch (error) {
      setSendError(
        error instanceof Error
          ? error.message
          : "Older messages could not be loaded.",
      )
    } finally {
      setLoadingOlder(false)
    }
  }, [loadingOlder, publicToken, state])

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (state.kind !== "ready" || sending || !draft.trim()) return
    setSending(true)
    setSendError(null)
    setRefreshNotice(null)
    operationIdRef.current = resolveStoreConversationOperationId(
      operationIdRef.current,
      () => crypto.randomUUID(),
    )
    try {
      const accepted = await parseResponse<{ message: Message }>(
        await fetch("/api/store-conversations/messages", {
          body: JSON.stringify({
            clientOperationId: operationIdRef.current,
            conversationId: state.conversation.id,
            publicToken,
            requestIntent: startingNewRequest
              ? "choose_request"
              : "continue_current",
            text: draft,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
      )
      operationIdRef.current = null
      setDraft("")
      setStartingNewRequestState(false)
      setState((current) =>
        current.kind === "ready" &&
        !current.messages.some((message) => message.id === accepted.message.id)
          ? { ...current, messages: [...current.messages, accepted.message] }
          : current,
      )
      try {
        await loadTimeline(state.conversation)
      } catch {
        setRefreshNotice(
          "Your message was sent. Refresh when you are ready to check for a reply.",
        )
      }
      textareaRef.current?.focus()
    } catch (error) {
      setSendError(
        error instanceof Error
          ? error.message
          : "Your message could not be sent.",
      )
    } finally {
      setSending(false)
    }
  }

  async function selectRequest(
    messageId: string,
    target: StoreConversationSelectRequestInput["target"],
  ) {
    if (state.kind !== "ready" || selectingMessageId) return
    setSelectingMessageId(messageId)
    setSendError(null)
    const operation = resolveStoreConversationKeyedOperation(
      selectionOperationRef.current,
      storeConversationRequestSelectionKey(messageId, target),
      () => crypto.randomUUID(),
    )
    selectionOperationRef.current = operation
    try {
      await parseResponse(
        await fetch("/api/store-conversations/select-request", {
          body: JSON.stringify({
            clientOperationId: operation.id,
            conversationId: state.conversation.id,
            messageId,
            publicToken,
            target,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
      )
      selectionOperationRef.current = null
      await loadTimeline(state.conversation)
    } catch (error) {
      setSendError(
        error instanceof Error
          ? error.message
          : "The Request could not be selected.",
      )
    } finally {
      setSelectingMessageId(null)
    }
  }

  function changeDraft(value: string) {
    operationIdRef.current = null
    setDraft(value)
  }

  function setStartingNewRequest(value: boolean) {
    operationIdRef.current = null
    setStartingNewRequestState(value)
  }

  return {
    bootstrap,
    changeDraft,
    draft,
    loadingOlder,
    loadOlder,
    loadTimeline,
    refreshNotice,
    selectRequest,
    selectingMessageId,
    sendError,
    sending,
    sendMessage,
    setStartingNewRequest,
    startingNewRequest,
    state,
    textareaRef,
  }
}
