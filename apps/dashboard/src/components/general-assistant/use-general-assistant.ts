"use client"
import { useTRPC } from "@/trpc/client"
import { useChat } from "@ai-sdk/react"
import type {
  GeneralAction,
  GeneralDataParts,
  GeneralProposal,
} from "@ewatrade/assistant/general/contracts"
import { readGeneralSnapshot } from "@ewatrade/assistant/general/snapshot"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { DefaultChatTransport, type UIMessage } from "ai"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { z } from "zod"

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
export function useGeneralAssistant() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const mounted = useRef(true)
  const actionLock = useRef(false)
  const recoveryLock = useRef(false)
  /** dataUpdatedAt of the last history applied or streamed into the chat. */
  const appliedAt = useRef(0)
  const attemptedText = useRef<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
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
    if (!conversationId && conversations.data?.[0])
      setConversationId(conversations.data[0].id)
  }, [conversationId, conversations.data])
  const refresh = useCallback(async () => {
    if (mounted.current && conversationId)
      return state.refetch({ throwOnError: true })
  }, [conversationId, state.refetch])
  const transport = useMemo(
    () =>
      new DefaultChatTransport<Message>({
        api: "/api/assistant/general/chat",
        credentials: "same-origin",
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
                parts: last.parts.filter((p) => p.type === "text"),
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
      if (!mounted.current) return
      setDraft((current) => current || attemptedText.current || "")
      void refresh().catch(() => {})
    },
    onFinish: ({ isAbort, isError }) => {
      if (!mounted.current) return
      // History fetched before this reply finished must not replace it.
      appliedAt.current = Date.now()
      if (!isAbort && !isError) attemptedText.current = null
      else setDraft((current) => current || attemptedText.current || "")
      void refresh().catch(() => {})
    },
  })
  const busy = chat.status === "submitted" || chat.status === "streaming"
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
  const act = async (operation: () => Promise<unknown>) => {
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
  }
  const newThread = () =>
    act(async () => {
      const created = await start.mutateAsync()
      if (!mounted.current) return
      setConversationId(created.id)
      chat.setMessages([])
      setDraft("")
      void conversations.refetch()
    })
  const send = async () => {
    const text = draft.trim()
    if (!text || busy || runId || pending || !conversationId || state.isError)
      return
    attemptedText.current = text
    setDraft("")
    setNotice(null)
    try {
      await chat.sendMessage({ text })
    } catch (error) {
      if (mounted.current) {
        setDraft((current) => current || text)
        setNotice(errorMessage(error))
      }
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
  const choose = (id: string) => {
    if (busy || runId || pending) return
    chat.setMessages([])
    setConversationId(id)
    setDraft("")
    setNotice(null)
  }
  return {
    availability,
    conversations,
    state,
    data,
    chat,
    busy,
    draft,
    setDraft,
    notice,
    pending,
    runId,
    conversationId,
    refresh,
    recover,
    newThread,
    send,
    confirm,
    cancel,
    save,
    choose,
  }
}
