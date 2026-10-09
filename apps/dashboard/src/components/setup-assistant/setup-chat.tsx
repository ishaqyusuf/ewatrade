"use client"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"

import { useTRPC } from "@/trpc/client"
import { useChat } from "@ai-sdk/react"
import { SETUP_ATTACHMENT_PART } from "@ewatrade/assistant/setup/attachments"
import type { SetupAssistantDataParts } from "@ewatrade/assistant/setup/messages"
import { useQueryClient } from "@tanstack/react-query"
import { DefaultChatTransport, type UIMessage } from "ai"
import { useEffect, useMemo, useRef, useState } from "react"
import { StickToBottom } from "use-stick-to-bottom"
import { SetupComposer, type SetupComposerPart } from "./setup-composer"
import { SetupMessage } from "./setup-message"

type SetupChatMessage = UIMessage<never, SetupAssistantDataParts>

const ERROR_COPY: Record<string, string> = {
  BUDGET_EXHAUSTED:
    "You've used this business's setup assistant allowance. Your setup list is still here to finish.",
  ASSISTANT_UNAVAILABLE:
    "The assistant is unavailable right now. You can keep editing your list or set things up yourself.",
  REQUEST_REPLAYED: "That message was already sent. Refresh to see the reply.",
  RATE_LIMIT_EXCEEDED:
    "You're sending messages very quickly. Wait a few minutes and try again.",
  ASSISTANT_BUSY: "The assistant is still answering your last message.",
  ATTACHMENT_NOT_READY: "Wait until every file has been read, then send again.",
  ATTACHMENT_NOT_FOUND:
    "One of these files is no longer available. Attach it again.",
  ATTACHMENT_ALREADY_SENT: "One of these files was already sent.",
}

function errorBody(error: Error) {
  try {
    return JSON.parse(error.message) as { code?: string; error?: string }
  } catch {
    return null
  }
}

function readableError(error: Error | undefined) {
  if (!error) return null
  const body = errorBody(error)
  if (!body)
    return "Something went wrong. Your setup list is safe, please try again."
  return (body.code && ERROR_COPY[body.code]) ?? body.error ?? null
}

/** Waits for a run whose stream dropped to settle; the server saves the reply. */
async function waitForRun(runId: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await fetch(
      `/api/assistant/runs/${encodeURIComponent(runId)}`,
      { credentials: "same-origin", cache: "no-store" },
    ).catch(() => null)
    if (response?.ok) {
      const run = (await response.json()) as { status?: string }
      if (run.status !== "RUNNING") return true
    } else if (response && response.status !== 503) return false
    await new Promise((resolve) => setTimeout(resolve, 2_500))
  }
  return false
}

export function SetupChat({
  conversationId,
  status,
  initialMessages,
  mediaEnabled,
  stateQueryKey,
  onBusyChange,
  inputLabel,
}: {
  conversationId: string
  status: "OFFERED" | "ACTIVE"
  initialMessages: SetupChatMessage[]
  /** Photos, files and voice notes; when off, the owner only types. */
  mediaEnabled: boolean
  stateQueryKey?: readonly unknown[]
  onBusyChange?: (busy: boolean) => void
  inputLabel?: string
}) {
  const settled = useRef(true)
  const workflow = useDashboardWorkflow()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const refreshDraft = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: stateQueryKey ?? trpc.setupAssistant.state.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.productAssistant.capabilities.queryKey(),
      }),
    ])

  const transport = useMemo(
    () =>
      new DefaultChatTransport<SetupChatMessage>({
        api: "/api/assistant/chat",
        credentials: "same-origin",
        prepareSendMessagesRequest: ({ messages }) => {
          const last = messages.at(-1)
          return {
            body: {
              conversationId,
              requestId: `req_${last?.id ?? crypto.randomUUID()}`,
              message: {
                id: last?.id,
                role: "user",
                // Only text and attachment references; the server re-reads
                // every attachment it was sent.
                parts: (last?.parts ?? []).flatMap<
                  | { type: "text"; text: string }
                  | {
                      type: typeof SETUP_ATTACHMENT_PART
                      data: { attachmentId: string }
                    }
                >((part) =>
                  part.type === "text"
                    ? [{ type: "text", text: part.text }]
                    : part.type === SETUP_ATTACHMENT_PART
                      ? [
                          {
                            type: SETUP_ATTACHMENT_PART,
                            data: { attachmentId: part.data.attachmentId },
                          },
                        ]
                      : [],
                ),
              },
            },
          }
        },
      }),
    [conversationId],
  )

  const runIdRef = useRef<string | null>(null)
  const [recovering, setRecovering] = useState(false)
  const [syncFromServer, setSyncFromServer] = useState(false)

  // A dropped stream (network, proxy timeout) still finishes on the server:
  // wait for the run, then show the saved conversation instead of an error.
  const recover = async (runId: string) => {
    setRecovering(true)
    try {
      if (await waitForRun(runId)) {
        await queryClient.refetchQueries({
          queryKey: stateQueryKey ?? trpc.setupAssistant.state.queryKey(),
        })
        setSyncFromServer(true)
      }
    } finally {
      setRecovering(false)
    }
  }

  const chat = useChat<SetupChatMessage>({
    id: conversationId,
    messages: initialMessages,
    transport,
    onData: (part) => {
      if (part.type === "data-setup-run") runIdRef.current = part.data.runId
      if (part.type === "data-setup-draft") void refreshDraft()
    },
    onError: (error) => {
      if (!settled.current) {
        settled.current = true
        workflow.track("assistant_message", "failed", {
          channel: "browser_stream",
        })
      }
      const runId = runIdRef.current
      if (runId && !errorBody(error)) void recover(runId)
    },
    onFinish: ({ isAbort, isError, isDisconnect }) => {
      void refreshDraft()
      if (settled.current) return
      settled.current = true
      workflow.track(
        "assistant_message",
        isAbort
          ? "cancelled"
          : isError || isDisconnect
            ? "failed"
            : "completed",
        { channel: "browser_stream" },
      )
    },
  })
  const { setMessages, clearError } = chat

  // Server-authored messages (the begin prompt) arrive through the state query.
  useEffect(() => {
    if (chat.status === "submitted" || chat.status === "streaming") return
    if (syncFromServer) {
      setMessages(initialMessages)
      clearError()
      setSyncFromServer(false)
    } else if (
      chat.status === "ready" &&
      initialMessages.length > chat.messages.length
    )
      setMessages(initialMessages)
  }, [
    initialMessages,
    chat.status,
    chat.messages.length,
    setMessages,
    clearError,
    syncFromServer,
  ])

  const busy = chat.status === "submitted" || chat.status === "streaming"
  useEffect(() => {
    onBusyChange?.(busy || recovering)
  }, [busy, recovering, onBusyChange])
  const canType = status === "ACTIVE"
  const send = (parts: SetupComposerPart[]) => {
    if (parts.length === 0 || busy || !canType) return
    settled.current = false
    workflow.track("assistant_message", "started", {
      channel: "browser_stream",
    })
    void chat.sendMessage({ parts })
  }
  const stop = () => {
    // Closing the stream alone lets the turn finish on the server; Stop asks
    // the server to cancel it.
    const runId = runIdRef.current
    if (runId)
      void fetch(`/api/assistant/runs/${encodeURIComponent(runId)}/cancel`, {
        method: "POST",
        credentials: "same-origin",
      }).catch(() => undefined)
    void chat.stop()
  }
  const error = recovering ? null : readableError(chat.error)
  const last = chat.messages.at(-1)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StickToBottom
        className="relative min-h-0 flex-1 overflow-y-auto"
        initial="instant"
        resize="smooth"
        role="log"
      >
        <StickToBottom.Content className="flex flex-col gap-5 px-4 py-6 sm:px-6">
          {chat.messages.map((message) => (
            <SetupMessage
              key={message.id}
              message={message}
              streaming={busy && message.id === last?.id}
            />
          ))}
          {chat.status === "submitted" || recovering ? (
            <p className="animate-pulse pl-10 text-xs text-muted-foreground">
              {recovering ? "Reconnecting…" : "Thinking…"}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="pl-10 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </StickToBottom.Content>
      </StickToBottom>

      {canType ? (
        <SetupComposer
          inputLabel={inputLabel}
          conversationId={conversationId}
          busy={busy}
          mediaEnabled={mediaEnabled}
          onSend={send}
          onStop={stop}
        />
      ) : null}
    </div>
  )
}
