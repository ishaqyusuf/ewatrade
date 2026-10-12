"use client"
import { useAssistantDraftRequests } from "@/components/page-fab/fab-slot"
import { useTRPC } from "@/trpc/client"
import { useChat } from "@ai-sdk/react"
import type {
  GeneralAction,
  GeneralDataParts,
  GeneralProposal,
} from "@ewatrade/assistant/general/contracts"
import { readGeneralSnapshot } from "@ewatrade/assistant/general/snapshot"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { DefaultChatTransport, type UIMessage } from "ai"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { z } from "zod"
import type { GeneralReadyAttachment } from "./general-attachment-tray"

type Message = UIMessage<never, GeneralDataParts>
const runSchema = z.object({
  conversationId: z.string(),
  status: z.enum(["RUNNING", "COMPLETED", "FAILED"]),
})
const errorMessage = (error: unknown) =>
  error instanceof Error && error.message
    ? error.message
    : "Something went wrong. Refresh the thread and try again."

/**
 * Dashboard GENERAL thread: persisted history, streaming replies and the
 * review/edit/confirm proposal lifecycle. Online only; the server rechecks
 * Store, role and target state on every call.
 */
export function useGeneralAssistant({
  autoStart = false,
  initialConversationId = null,
  blankStart = false,
}: {
  autoStart?: boolean
  /** A chat named by the URL; opened first instead of the latest one. */
  initialConversationId?: string | null
  /**
   * Open on a blank chat instead of the latest saved one. The first message
   * creates the conversation (the assistant page's /assistant).
   */
  blankStart?: boolean
} = {}) {
  const workflow = useDashboardWorkflow()
  const typed = useRef(false)
  const messageSettled = useRef(true)
  const settleMessage = (phase: "completed" | "failed" | "cancelled") => {
    if (messageSettled.current) return
    messageSettled.current = true
    workflow.track("assistant_message", phase, {
      channel: "browser_stream",
      assistant_mode: "general",
    })
  }
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const mounted = useRef(true)
  const actionLock = useRef(false)
  const recoveryLock = useRef(false)
  /** dataUpdatedAt of the last history applied or streamed into the chat. */
  const appliedAt = useRef(0)
  const attemptedText = useRef<string | null>(null)
  const autoStartAttempted = useRef(false)
  /** The conversation a blank chat's first message created. */
  const [startedConversationId, setStartedConversationId] = useState<
    string | null
  >(null)
  /** The first message of a blank chat, sent once its conversation exists. */
  const firstMessage = useRef<{
    conversationId: string
    text: string
    files: GeneralReadyAttachment[]
  } | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId,
  )
  const [draft, setDraft] = useState("")
  const draftRef = useRef(draft)
  draftRef.current = draft
  /** A prefill waiting for the composer to be ready for focus. */
  const [prefill, setPrefill] = useState<{ value: string } | null>(null)
  // Receipt photos/PDFs read and ready to go with the next message.
  const [readyAttachments, setReadyAttachments] = useState<
    GeneralReadyAttachment[]
  >([])
  const [attachmentTrayKey, setAttachmentTrayKey] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [runId, setRunId] = useState<string | null>(null)
  const availability = useQuery(
    trpc.assistant.availability.queryOptions(undefined, { retry: false }),
  )
  const enabled = availability.data?.enabled === true
  const conversations = useQuery(
    trpc.assistant.conversations.queryOptions(undefined, {
      enabled,
      retry: false,
    }),
  )
  const state = useQuery(
    trpc.assistant.conversation.queryOptions(
      { conversationId: conversationId ?? "" },
      {
        enabled: enabled && !!conversationId,
        retry: false,
        refetchOnWindowFocus: false,
      },
    ),
  )
  const data = useMemo(() => readGeneralSnapshot(state.data), [state.data])
  const start = useMutation(trpc.assistant.start.mutationOptions())
  const decide = useMutation(trpc.assistant.decideProposal.mutationOptions())
  const edit = useMutation(trpc.assistant.editProposal.mutationOptions())
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    if (!blankStart && !conversationId && conversations.data?.[0])
      setConversationId(conversations.data[0].id)
  }, [blankStart, conversationId, conversations.data])
  const refresh = useCallback(async () => {
    if (mounted.current && conversationId)
      return state.refetch({ throwOnError: true })
  }, [conversationId, state.refetch])
  const transport = useMemo(
    () =>
      new DefaultChatTransport<Message>({
        api: "/api/assistant/general/chat",
        credentials: "same-origin",
        headers: { "x-assistant-client": "dashboard" },
        prepareSendMessagesRequest: ({ messages }) => {
          if (!conversationId) throw Error("Conversation unavailable")
          const last = [...messages].reverse().find((m) => m.role === "user")
          if (!last) throw Error("Message unavailable")
          return {
            body: {
              conversationId,
              requestId: `req_${last.id}`,
              message: {
                id: last.id,
                role: "user",
                parts: last.parts.flatMap(
                  (
                    p,
                  ): Array<
                    | { type: "text"; text: string }
                    | {
                        type: "data-setup-attachment"
                        data: { attachmentId: string }
                      }
                  > =>
                    p.type === "text"
                      ? [{ type: "text", text: p.text }]
                      : p.type === "data-setup-attachment"
                        ? [
                            {
                              type: p.type,
                              data: { attachmentId: p.data.attachmentId },
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
  const chat = useChat<Message>({
    id: conversationId ?? "general",
    transport,
    onData: (part) => {
      if (!mounted.current) return
      if (part.type === "data-general-run") setRunId(part.data.runId)
      if (part.type === "data-general-proposal") void refresh().catch(() => {})
    },
    onError: () => {
      settleMessage("failed")
      if (!mounted.current) return
      setDraft((current) => current || attemptedText.current || "")
      void refresh().catch(() => {})
    },
    onFinish: ({ isAbort, isError, isDisconnect }) => {
      settleMessage(
        isAbort
          ? "cancelled"
          : isError || isDisconnect
            ? "failed"
            : "completed",
      )
      if (!mounted.current) return
      // History fetched before this reply finished must not replace it.
      appliedAt.current = Date.now()
      if (!isAbort && !isError && !isDisconnect) attemptedText.current = null
      else setDraft((current) => current || attemptedText.current || "")
      void refresh().catch(() => {})
    },
  })
  const busy = chat.status === "submitted" || chat.status === "streaming"
  // "Ask AI" prefills keep unsent text below the new first line. Set directly:
  // the user has not typed, so no typing analytics.
  const takeDraft = useCallback((value: string) => {
    const current = draftRef.current
    const next = !current.trim()
      ? value
      : current.startsWith(value)
        ? current
        : `${value}${current}`
    setDraft(next)
    setPrefill({ value: next })
  }, [])
  useAssistantDraftRequests(takeDraft)
  useEffect(() => {
    if (!prefill) return
    // The composer stays disabled until the chat is ready; focus once it is.
    const deadline = Date.now() + 15_000
    let frame = 0
    const place = () => {
      const input = Array.from(
        document.querySelectorAll<HTMLTextAreaElement>("textarea"),
      ).find((row) => row.value === prefill.value && !row.disabled)
      if (input) {
        input.focus()
        input.setSelectionRange(input.value.length, input.value.length)
        input.scrollTop = input.scrollHeight
        setPrefill(null)
      } else if (Date.now() < deadline) frame = requestAnimationFrame(place)
    }
    frame = requestAnimationFrame(place)
    return () => cancelAnimationFrame(frame)
  }, [prefill])
  useEffect(() => {
    if (conversationId) appliedAt.current = 0
  }, [conversationId])
  useEffect(() => {
    if (!data || busy || chat.error || state.dataUpdatedAt <= appliedAt.current)
      return
    appliedAt.current = state.dataUpdatedAt
    chat.setMessages(data.messages as Message[])
  }, [data, busy, chat.error, chat.setMessages, state.dataUpdatedAt])
  useEffect(() => {
    if (data?.activeRunId && !busy) setRunId(data.activeRunId)
  }, [data?.activeRunId, busy])
  useEffect(() => () => void chat.stop(), [chat.stop])
  /** `quiet` checks stay silent while a just-finished run settles. */
  const recover = useCallback(
    async ({ quiet = false }: { quiet?: boolean } = {}) => {
      if (!runId || busy || recoveryLock.current) return
      recoveryLock.current = true
      try {
        await refresh()
        const response = await fetch(
          `/api/assistant/general/runs/${encodeURIComponent(runId)}`,
          { credentials: "same-origin", cache: "no-store" },
        )
        const parsed = runSchema.safeParse(
          response.ok ? await response.json() : null,
        )
        if (!mounted.current) return
        if (
          parsed.success &&
          parsed.data.conversationId === conversationId &&
          parsed.data.status !== "RUNNING"
        ) {
          chat.clearError()
          await refresh()
          setRunId(null)
          setNotice(
            parsed.data.status === "FAILED"
              ? "Reply interrupted. Your saved drafts are still here. You can send a new message."
              : null,
          )
        } else if (!quiet)
          setNotice(
            "Reply is still processing or its status is uncertain. Check again shortly.",
          )
      } catch {
        if (mounted.current && !quiet)
          setNotice("Reconnect and check reply status before sending again.")
      } finally {
        recoveryLock.current = false
      }
    },
    [runId, busy, refresh, conversationId, chat.clearError],
  )
  useEffect(() => {
    if (!runId || busy) return
    // Settle a finished reply at once; only the last check reports uncertainty.
    let rounds = 0
    void recover({ quiet: true })
    const timer = setInterval(() => {
      if (++rounds > 6) {
        clearInterval(timer)
        return
      }
      void recover({ quiet: rounds < 6 })
    }, 1500)
    return () => clearInterval(timer)
  }, [runId, busy, recover])
  /** Confirmed records change forms and lists elsewhere in the dashboard. */
  const invalidateBusiness = () =>
    Promise.allSettled(
      [
        trpc.customers.pathKey(),
        trpc.catalog.pathKey(),
        trpc.inventory.pathKey(),
        trpc.orders.pathKey(),
        trpc.search.pathKey(),
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    )
  const act = useCallback(
    async (operation: () => Promise<unknown>) => {
      if (actionLock.current || busy || runId || state.isError) return false
      actionLock.current = true
      setPending(true)
      setNotice(null)
      try {
        await operation()
        if (mounted.current) await refresh()
        return mounted.current
      } catch (error) {
        if (mounted.current) {
          setNotice(errorMessage(error))
          void refresh().catch(() => {})
        }
        return false
      } finally {
        actionLock.current = false
        if (mounted.current) setPending(false)
      }
    },
    [busy, runId, state.isError, refresh],
  )
  const newThread = useCallback(
    ({ preserveDraft = false }: { preserveDraft?: boolean } = {}) =>
      act(async () => {
        const created = await start.mutateAsync()
        if (!mounted.current) return
        typed.current = false
        setConversationId(created.id)
        chat.setMessages([])
        if (!preserveDraft) setDraft("")
        void conversations.refetch()
      }),
    [act, start.mutateAsync, chat.setMessages, conversations.refetch],
  )
  // Resume saved history or prepare one empty thread on first open. A failed
  // attempt is retried explicitly, never by repeatedly creating conversations.
  useEffect(() => {
    if (
      !autoStart ||
      !enabled ||
      !conversations.isSuccess ||
      conversations.isFetching ||
      conversationId ||
      conversations.data.length > 0 ||
      autoStartAttempted.current
    )
      return
    autoStartAttempted.current = true
    void newThread({ preserveDraft: true })
  }, [
    autoStart,
    enabled,
    conversations.isSuccess,
    conversations.isFetching,
    conversations.data,
    conversationId,
    newThread,
  ])
  /** Streams one message into the open conversation. */
  const deliver = async (text: string, files: GeneralReadyAttachment[]) => {
    typed.current = false
    messageSettled.current = false
    workflow.track("assistant_message", "started", {
      channel: "browser_stream",
      assistant_mode: "general",
    })
    attemptedText.current = text
    try {
      await chat.sendMessage({
        parts: [
          ...(text ? [{ type: "text" as const, text }] : []),
          ...files.map((file) => ({
            type: "data-setup-attachment" as const,
            data: {
              attachmentId: file.attachmentId,
              kind: "IMAGE",
              fileName: file.fileName,
              summary: "",
            },
          })),
        ],
      })
    } catch (error) {
      settleMessage("failed")
      if (mounted.current) {
        setDraft((current) => current || text)
        setNotice(errorMessage(error))
      }
    }
  }
  // Runs in the render where the new conversation is open, so the message
  // goes through that conversation's chat and transport.
  useEffect(() => {
    const queued = firstMessage.current
    if (!queued || queued.conversationId !== conversationId) return
    firstMessage.current = null
    // A brand-new chat has no history that could replace this reply.
    appliedAt.current = Date.now()
    void deliver(queued.text, queued.files)
  })
  const send = async () => {
    const text = draft.trim()
    const files = readyAttachments
    const blank = blankStart && !conversationId
    if (
      (!text && !files.length) ||
      busy ||
      runId ||
      pending ||
      (!conversationId && !blank) ||
      state.isError ||
      actionLock.current
    )
      return
    setDraft("")
    setNotice(null)
    setReadyAttachments([])
    setAttachmentTrayKey((key) => key + 1)
    if (!blank) return deliver(text, files)
    actionLock.current = true
    setPending(true)
    try {
      const created = await start.mutateAsync()
      if (!mounted.current) return
      firstMessage.current = { conversationId: created.id, text, files }
      setStartedConversationId(created.id)
      chat.setMessages([])
      setConversationId(created.id)
      void conversations.refetch()
    } catch (error) {
      if (mounted.current) {
        setDraft((current) => current || text)
        setNotice(errorMessage(error))
      }
    } finally {
      actionLock.current = false
      if (mounted.current) setPending(false)
    }
  }
  const confirm = (proposal: GeneralProposal) =>
    act(async () => {
      if (!proposal.approvalToken || proposal.status !== "PENDING")
        throw Error("Refresh and review this draft first.")
      await decide.mutateAsync({
        proposalId: proposal.id,
        revision: proposal.revision,
        decision: "confirm",
        approvalToken: proposal.approvalToken,
      })
      await invalidateBusiness()
    })
  const cancel = (proposal: GeneralProposal) =>
    act(() =>
      decide.mutateAsync({
        proposalId: proposal.id,
        revision: proposal.revision,
        decision: "cancel",
      }),
    )
  const save = (proposal: GeneralProposal, payload: GeneralAction) =>
    act(() =>
      edit.mutateAsync({
        proposalId: proposal.id,
        revision: proposal.revision,
        payload,
      }),
    )
  /** Back to a blank chat; the first message creates its conversation. */
  const clearThread = () => {
    if (busy || runId || pending) return
    typed.current = false
    chat.setMessages([])
    setConversationId(null)
    setDraft("")
    setNotice(null)
  }
  const choose = (id: string) => {
    if (busy || runId || pending) return
    typed.current = false
    chat.setMessages([])
    setConversationId(id)
    setDraft("")
    setNotice(null)
  }
  return {
    readyAttachments,
    setReadyAttachments,
    attachmentTrayKey,
    availability,
    conversations,
    state,
    data,
    chat,
    busy,
    draft,
    setDraft: (value: string) => {
      if (value.trim() && !typed.current) {
        typed.current = true
        workflow.track("assistant_typing", "started", {
          channel: "composer",
          assistant_mode: "general",
        })
      }
      setDraft(value)
    },
    notice,
    pending,
    runId,
    conversationId,
    /** A blank chat on the assistant page, waiting for its first message. */
    blank: blankStart && !conversationId,
    startedConversationId,
    refresh,
    recover,
    newThread,
    clearThread,
    send,
    confirm,
    cancel,
    save,
    choose,
  }
}
