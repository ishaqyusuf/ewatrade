import { useAuthContext } from "@/hooks/use-auth"
import { getBaseUrl } from "@/lib/base-url"
import { getSession } from "@/lib/session-store"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { getDataCacheGeneration, useTRPC } from "@/trpc/client"
import { useChat } from "@ai-sdk/react"
import type {
  GeneralAction,
  GeneralDataParts,
  GeneralProposal,
} from "@ewatrade/assistant/general/contracts"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useMutation, useQuery } from "@tanstack/react-query"
import { DefaultChatTransport, type UIMessage } from "ai"
import { useLocalSearchParams } from "expo-router"
import { fetch as expoFetch } from "expo/fetch"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AppState } from "react-native"
import { z } from "zod"
import type { AssistantReadyFile } from "./assistant-chat-box"
import { assistantError } from "./assistant-error"
import {
  assistantRouteConversation,
  matchesAssistantRouteConversation,
} from "./assistant-route-conversation"
import {
  assistantRequestHeaders,
  assistantScope,
  assistantScopeKey,
  isAssistantSessionCurrent,
} from "./assistant-scope"
import {
  type GeneralSnapshot,
  generalSavedSnapshot,
  readGeneralCache,
  readGeneralSnapshot,
} from "./general-model"
type Message = UIMessage<never, GeneralDataParts>
const runSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  status: z.enum(["RUNNING", "COMPLETED", "FAILED"]),
  errorCode: z.string().nullable(),
})
export function useGeneralAssistant() {
  const params = useLocalSearchParams<{
    query?: string | string[]
    draft?: string | string[]
    conversationId?: string | string[]
  }>()
  const requested = assistantRouteConversation(params.conversationId)
  const requestedKey = JSON.stringify(requested)
  const [releasedRoute, setReleasedRoute] = useState<string | null>(null)
  const exactRoute = requested.kind !== "none" && releasedRoute !== requestedKey
  const [routeStartedAt, setRouteStartedAt] = useState(Date.now)
  const auth = useAuthContext()
  const trpc = useTRPC()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const [origin] = useState(() => getSession())
  const [originCacheGeneration] = useState(getDataCacheGeneration)
  const scope = assistantScopeKey(origin)
  const scopeChanged =
    scope !== assistantScopeKey(auth.session) ||
    origin?.token !== auth.token ||
    origin?.profile.role !== auth.profile?.role ||
    origin?.profile.status !== auth.profile?.status ||
    originCacheGeneration !== getDataCacheGeneration()
  const mounted = useRef(true)
  const actionLock = useRef(false)
  const recoveryLock = useRef(false)
  /** dataUpdatedAt of the last history applied or streamed into the chat. */
  const appliedAt = useRef(0)
  const attemptedText = useRef<string | null>(null)
  const sessionUnavailable =
    !origin ||
    (origin.profile.status?.toUpperCase() ?? "ACTIVE") !== "ACTIVE" ||
    !["OWNER", "ADMIN", "MANAGER", "CASHIER", "OPERATOR"].includes(
      origin.profile.role?.toUpperCase() ?? "",
    )
  const canWork = useCallback(
    () =>
      mounted.current &&
      originCacheGeneration === getDataCacheGeneration() &&
      origin?.profile.role === getSession()?.profile.role &&
      isAssistantSessionCurrent(
        origin,
        getSession(),
        useOperationalModeStore.getState().isOfflineMode,
        false,
      ),
    [origin, originCacheGeneration],
  )
  const [conversationId, setConversationId] = useState<string | null>(() =>
    requested.kind === "saved" ? requested.conversationId : null,
  )
  const [cached, setCached] = useState<{
    savedAt: number
    data: GeneralSnapshot
  } | null>(null)
  const [draft, setDraft] = useState(() => {
    // A screen may hand over a starter line, e.g. "For order ORD-020:\n".
    if (typeof params.draft === "string" && params.draft.trim())
      return params.draft.slice(0, 8000)
    const query =
      typeof params.query === "string" ? params.query.trim().slice(0, 160) : ""
    return query ? `Find ${query}` : ""
  })
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [runId, setRunId] = useState<string | null>(null)
  const [queued, setQueued] = useState<string | null>(null)
  // Receipt photos/PDFs read and ready to go with the next message.
  const [readyFiles, setReadyFiles] = useState<AssistantReadyFile[]>([])
  const [trayKey, setTrayKey] = useState(0)
  const storageKey = `ewatrade:general-assistant:v1:${scope}`
  const availability = useQuery(
    trpc.assistant.availability.queryOptions(undefined, {
      enabled: canWork(),
      retry: false,
    }),
  )
  const conversations = useQuery(
    trpc.assistant.conversations.queryOptions(undefined, {
      enabled: canWork() && availability.data?.enabled === true,
      retry: false,
    }),
  )
  const state = useQuery(
    trpc.assistant.conversation.queryOptions(
      { conversationId: conversationId ?? "" },
      {
        enabled:
          canWork() && availability.data?.enabled === true && !!conversationId,
        retry: false,
        refetchOnWindowFocus: false,
        ...(exactRoute
          ? { staleTime: 0, refetchOnMount: "always" as const }
          : {}),
      },
    ),
  )
  const exactRouteReady =
    !exactRoute ||
    (requested.kind === "saved" &&
      conversationId === requested.conversationId &&
      !offline &&
      state.isSuccess &&
      !state.isError &&
      !state.isPaused &&
      state.isFetchedAfterMount &&
      state.dataUpdatedAt >= routeStartedAt &&
      matchesAssistantRouteConversation(
        state.data,
        requested.conversationId,
        assistantScope(origin),
      ))
  const routeUnavailable = exactRoute && !exactRouteReady
  const server = useMemo(
    () => (exactRouteReady ? readGeneralSnapshot(state.data) : null),
    [state.data, exactRouteReady],
  )
  const data =
    scopeChanged || routeUnavailable
      ? null
      : offline
        ? cached && Date.now() - cached.savedAt < 24 * 60 * 60 * 1000
          ? cached.data
          : Date.now() - state.dataUpdatedAt < 24 * 60 * 60 * 1000
            ? server
            : null
        : server
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
    let live = true
    void AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (live && !scopeChanged) {
          const value = readGeneralCache(raw, scope ?? "")
          setCached(value)
          if (offline && value && !exactRoute)
            setConversationId(value.data.conversation.id)
        }
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [storageKey, scope, scopeChanged, offline, exactRoute])
  useEffect(() => {
    if (!server || !canWork() || scopeChanged) return
    const value = {
      scope: scope ?? "",
      savedAt: Date.now(),
      data: generalSavedSnapshot(server),
    }
    setCached(value)
    void AsyncStorage.setItem(storageKey, JSON.stringify(value)).catch(() => {})
  }, [server, scope, storageKey, scopeChanged, canWork])
  const refresh = useCallback(async () => {
    if (canWork() && conversationId)
      return state.refetch({ throwOnError: true })
  }, [canWork, conversationId, state.refetch])
  const guardedFetch = useCallback(
    async (
      input: Parameters<typeof expoFetch>[0],
      options?: Parameters<typeof expoFetch>[1],
    ) => {
      const session = getSession()
      if (!session || !canWork()) throw Error("Assistant session changed")
      const response = await expoFetch(String(input), {
        ...options,
        body: options?.body ?? undefined,
        headers: {
          ...Object.fromEntries(new Headers(options?.headers).entries()),
          ...assistantRequestHeaders(session),
        },
      })
      if (!canWork()) throw Error("Assistant session changed")
      return response
    },
    [canWork],
  )
  const transport = useMemo(
    () =>
      new DefaultChatTransport<Message>({
        api: `${getBaseUrl()}/api/assistant/general/chat`,
        fetch: guardedFetch as unknown as typeof fetch,
        prepareSendMessagesRequest: ({ messages, body }) => {
          if (!canWork() || !conversationId || routeUnavailable)
            throw Error("Conversation unavailable")
          const last = [...messages].reverse().find((m) => m.role === "user")
          if (!last) throw Error("Message unavailable")
          return {
            body: {
              conversationId,
              requestId: `req_${last.id}`,
              ...(body?.saleChoice ? { saleChoice: body.saleChoice } : {}),
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
    [conversationId, canWork, guardedFetch, routeUnavailable],
  )
  const chat = useChat<Message>({
    id: `${scope}:${conversationId}`,
    transport,
    onData: (part) => {
      if (!canWork()) return
      if (part.type === "data-general-run") setRunId(part.data.runId)
      if (part.type === "data-general-proposal") void refresh().catch(() => {})
    },
    onError: () => {
      if (
        mounted.current &&
        isAssistantSessionCurrent(origin, getSession(), false, false)
      ) {
        setDraft((current) => current || attemptedText.current || "")
        if (canWork()) void refresh().catch(() => {})
      }
    },
    onFinish: ({ isAbort, isError }) => {
      // History fetched before this reply finished must not replace it.
      appliedAt.current = Date.now()
      if (!isAbort && !isError) attemptedText.current = null
      else if (
        mounted.current &&
        isAssistantSessionCurrent(origin, getSession(), false, false)
      )
        setDraft((current) => current || attemptedText.current || "")
      if (canWork()) void refresh().catch(() => {})
    },
  })
  const busy = chat.status === "submitted" || chat.status === "streaming"
  useEffect(() => {
    if (exactRoute && exactRouteReady) setNotice(null)
  }, [exactRoute, exactRouteReady])
  useEffect(() => {
    if (requestedKey === releasedRoute) return
    const next = assistantRouteConversation(params.conversationId)
    if (next.kind === "none") return
    void chat.stop()
    chat.setMessages([])
    setConversationId(next.kind === "saved" ? next.conversationId : null)
    setRunId(null)
    setQueued(null)
    setReadyFiles([])
    setDraft("")
    setRouteStartedAt(Date.now())
    setNotice(
      next.kind === "invalid"
        ? "This saved chat link is invalid. No other chat was opened."
        : "Loading this exact saved chat. If unavailable in your current account and Store, no other chat will open.",
    )
  }, [
    requestedKey,
    releasedRoute,
    params.conversationId,
    chat.stop,
    chat.setMessages,
  ])
  useEffect(() => {
    if (conversationId) appliedAt.current = 0
  }, [conversationId])
  const historyAt = offline ? (cached?.savedAt ?? 0) : state.dataUpdatedAt
  useEffect(() => {
    if (!data || busy || chat.error || historyAt <= appliedAt.current) return
    appliedAt.current = historyAt
    chat.setMessages(data.messages)
  }, [data, busy, chat.error, chat.setMessages, historyAt])
  useEffect(() => {
    if (server?.activeRunId && !busy) setRunId(server.activeRunId)
  }, [server?.activeRunId, busy])
  useEffect(() => {
    if (!offline && !scopeChanged) return
    void chat.stop()
    if (scopeChanged) {
      setDraft("")
      attemptedText.current = null
    }
    setRunId(null)
    setNotice(null)
  }, [offline, scopeChanged, chat.stop])
  useEffect(() => {
    if (!scopeChanged && !sessionUnavailable) return
    setReadyFiles([])
    setTrayKey((key) => key + 1)
  }, [scopeChanged, sessionUnavailable])
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") void chat.stop()
    })
    return () => {
      subscription.remove()
      void chat.stop()
    }
  }, [chat.stop])
  /** `quiet` checks stay silent while a just-finished run settles. */
  const recover = useCallback(
    async ({ quiet = false }: { quiet?: boolean } = {}) => {
      if (!runId || busy || !canWork() || recoveryLock.current) return
      recoveryLock.current = true
      try {
        await refresh()
        const response = await guardedFetch(
          `${getBaseUrl()}/api/assistant/general/runs/${encodeURIComponent(runId)}`,
        )
        const parsed = runSchema.safeParse(
          response.ok ? await response.json() : null,
        )
        if (!canWork()) return
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
        if (canWork() && !quiet)
          setNotice("Reconnect and check reply status before sending again.")
      } finally {
        recoveryLock.current = false
      }
    },
    [
      runId,
      busy,
      canWork,
      refresh,
      guardedFetch,
      conversationId,
      chat.clearError,
    ],
  )
  useEffect(() => {
    if (!runId || busy || offline || scopeChanged) return
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
  }, [runId, busy, offline, scopeChanged, recover])
  const act = async (operation: () => Promise<unknown>) => {
    if (
      !canWork() ||
      routeUnavailable ||
      actionLock.current ||
      busy ||
      runId ||
      state.isError
    )
      return false
    actionLock.current = true
    setPending(true)
    setNotice(null)
    try {
      await operation()
      if (canWork()) await refresh()
      return canWork()
    } catch (error) {
      if (canWork()) {
        setNotice(assistantError(error, "GENERAL").message)
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
      if (canWork()) {
        setConversationId(created.id)
        chat.setMessages([])
        if (conversationId) setDraft("")
        void conversations.refetch()
      }
    })
  const sendText = async (
    text: string,
    files: AssistantReadyFile[] = [],
    saleChoice?: { proposalId: string; revision: number; text: string },
  ) => {
    attemptedText.current = text
    setNotice(null)
    try {
      await chat.sendMessage(
        {
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
        },
        saleChoice ? { body: { saleChoice } } : undefined,
      )
    } catch (error) {
      if (canWork()) {
        setDraft((current) => current || text)
        setNotice(assistantError(error, "GENERAL").message)
      }
    }
  }
  /** Asks in the open thread, or starts one first and sends once it's ready. */
  const ask = async (
    value: string,
    saleChoice?: { proposalId: string; revision: number; text: string },
  ) => {
    const text = value.trim()
    // Ready receipts only exist in an open chat, so they never queue.
    const files = conversationId && !saleChoice ? readyFiles : []
    if (
      !canWork() ||
      routeUnavailable ||
      (!text && !files.length) ||
      busy ||
      runId ||
      pending ||
      queued
    )
      return
    if (conversationId && state.isError) return
    if (!saleChoice) setDraft("")
    if (conversationId) {
      if (!saleChoice) {
        setReadyFiles([])
        setTrayKey((key) => key + 1)
      }
      return sendText(text, files, saleChoice)
    }
    setQueued(text)
    if (!(await newThread())) {
      setQueued(null)
      setDraft((current) => current || text)
    }
  }
  const send = () => ask(draft)
  // biome-ignore lint/correctness/useExhaustiveDependencies: sendText is rebuilt every render; the queued text triggers this.
  useEffect(() => {
    if (!queued || !conversationId || pending || busy || runId) return
    setQueued(null)
    void sendText(queued)
  }, [queued, conversationId, pending, busy, runId])
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
  /** Back to the assistant home; the next question starts a new chat. */
  const fresh = () => {
    if (!canWork() || busy || runId || pending) return
    setReadyFiles([])
    setTrayKey((key) => key + 1)
    chat.setMessages([])
    setReleasedRoute(requestedKey)
    setConversationId(null)
    setDraft("")
    setNotice(null)
  }
  const choose = (id: string) => {
    if (!canWork() || busy || runId || pending) return
    setReadyFiles([])
    setTrayKey((key) => key + 1)
    chat.setMessages([])
    setReleasedRoute(requestedKey)
    setConversationId(id)
    setDraft("")
    setNotice(null)
  }
  return {
    composerConversationId:
      offline || scopeChanged || routeUnavailable || sessionUnavailable
        ? null
        : conversationId,
    readyFiles: scopeChanged || sessionUnavailable ? [] : readyFiles,
    setReadyFiles,
    trayKey,
    sessionUnavailable,
    availability,
    conversations,
    state,
    data,
    chat,
    busy,
    offline,
    scopeChanged: scopeChanged || routeUnavailable,
    draft: scopeChanged || sessionUnavailable ? "" : draft,
    setDraft,
    notice: routeUnavailable
      ? requested.kind === "invalid"
        ? "This saved chat link is invalid. No other chat was opened."
        : offline
          ? "Return online to open this exact saved chat. Cached chats are not substituted."
          : state.isError || state.isSuccess
            ? "This saved chat is unavailable for your current account, Store or workflow. No other chat was opened."
            : "Loading this exact saved chat…"
      : notice,
    pending,
    runId,
    conversationId,
    refresh,
    recover,
    newThread,
    send,
    ask,
    queued,
    profile: origin?.profile,
    confirm,
    cancel,
    save,
    choose,
    fresh,
    savedAt: offline ? cached?.savedAt : state.dataUpdatedAt,
  }
}
