import { useAuthContext } from "@/hooks/use-auth"
import { getBaseUrl } from "@/lib/base-url"
import { getSession } from "@/lib/session-store"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
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
import { assistantError } from "./assistant-error"
import {
  assistantRequestHeaders,
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
  const params = useLocalSearchParams<{ query?: string | string[] }>()
  const auth = useAuthContext()
  const trpc = useTRPC()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const [origin] = useState(() => getSession())
  const scope = assistantScopeKey(origin)
  const scopeChanged =
    scope !== assistantScopeKey(auth.session) ||
    origin?.token !== auth.token ||
    origin?.profile.role !== auth.profile?.role ||
    origin?.profile.status !== auth.profile?.status
  const mounted = useRef(true)
  const actionLock = useRef(false)
  const recoveryLock = useRef(false)
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
      origin?.profile.role === getSession()?.profile.role &&
      isAssistantSessionCurrent(
        origin,
        getSession(),
        useOperationalModeStore.getState().isOfflineMode,
        false,
      ),
    [origin],
  )
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [cached, setCached] = useState<{
    savedAt: number
    data: GeneralSnapshot
  } | null>(null)
  const [draft, setDraft] = useState(() => {
    const query =
      typeof params.query === "string" ? params.query.trim().slice(0, 160) : ""
    return query ? `Find ${query}` : ""
  })
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [runId, setRunId] = useState<string | null>(null)
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
      },
    ),
  )
  const server = useMemo(() => readGeneralSnapshot(state.data), [state.data])
  const data = scopeChanged
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
          if (offline && value) setConversationId(value.data.conversation.id)
        }
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [storageKey, scope, scopeChanged, offline])
  useEffect(() => {
    if (!conversationId && conversations.data?.[0])
      setConversationId(conversations.data[0].id)
  }, [conversationId, conversations.data])
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
        prepareSendMessagesRequest: ({ messages }) => {
          if (!canWork() || !conversationId)
            throw Error("Conversation unavailable")
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
    [conversationId, canWork, guardedFetch],
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
    if (data && !busy && !chat.error) chat.setMessages(data.messages)
  }, [data, busy, chat.error, chat.setMessages])
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
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") void chat.stop()
    })
    return () => {
      subscription.remove()
      void chat.stop()
    }
  }, [chat.stop])
  const recover = useCallback(async () => {
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
      } else
        setNotice(
          "Reply is still processing or its status is uncertain. Check again shortly.",
        )
    } catch {
      if (canWork())
        setNotice("Reconnect and check reply status before sending again.")
    } finally {
      recoveryLock.current = false
    }
  }, [
    runId,
    busy,
    canWork,
    refresh,
    guardedFetch,
    conversationId,
    chat.clearError,
  ])
  useEffect(() => {
    if (!runId || busy || offline || scopeChanged) return
    let rounds = 0
    const timer = setInterval(() => {
      if (++rounds > 6) {
        clearInterval(timer)
        return
      }
      void recover()
    }, 1500)
    return () => clearInterval(timer)
  }, [runId, busy, offline, scopeChanged, recover])
  const act = async (operation: () => Promise<unknown>) => {
    if (!canWork() || actionLock.current || busy || runId || state.isError)
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
  const send = async () => {
    if (
      !canWork() ||
      !draft.trim() ||
      busy ||
      runId ||
      pending ||
      !conversationId ||
      state.isError
    )
      return
    const text = draft.trim()
    attemptedText.current = text
    setDraft("")
    setNotice(null)
    try {
      await chat.sendMessage({ text })
    } catch (error) {
      if (canWork()) {
        setDraft((current) => current || text)
        setNotice(assistantError(error, "GENERAL").message)
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
    if (!canWork() || busy || runId || pending) return
    chat.setMessages([])
    setConversationId(id)
    setDraft("")
    setNotice(null)
  }
  return {
    sessionUnavailable,
    availability,
    conversations,
    state,
    data,
    chat,
    busy,
    offline,
    scopeChanged,
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
    savedAt: offline ? cached?.savedAt : state.dataUpdatedAt,
  }
}
