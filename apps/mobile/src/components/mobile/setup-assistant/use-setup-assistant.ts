import { useAuthContext } from "@/hooks/use-auth"
import { getBaseUrl } from "@/lib/base-url"
import { getSession } from "@/lib/session-store"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useChat } from "@ai-sdk/react"
import type { SetupEntityPayload } from "@ewatrade/assistant/setup/contracts"
import type { SetupAssistantDataParts } from "@ewatrade/assistant/setup/messages"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useMutation, useQuery } from "@tanstack/react-query"
import { DefaultChatTransport, type UIMessage } from "ai"
import { fetch as expoFetch } from "expo/fetch"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AppState } from "react-native"
import { assistantError } from "../assistant/assistant-error"
import {
  assistantRequestHeaders,
  assistantScopeKey,
  isAssistantSessionCurrent,
} from "../assistant/assistant-scope"
import {
  type SetupSnapshot,
  readSetupCache,
  readSetupRun,
  readSetupSnapshot,
  setupInitialMessages,
  setupPlainText,
} from "./setup-model"

type Message = UIMessage<never, SetupAssistantDataParts>
export function useSetupAssistant() {
  const auth = useAuthContext()
  const trpc = useTRPC()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const [origin] = useState(() => getSession())
  const scope = assistantScopeKey(origin)
  const [cached, setCached] = useState<{
    savedAt: number
    data: SetupSnapshot
  } | null>(null)
  const [cacheLoading, setCacheLoading] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [runId, setRunId] = useState<string | null>(null)
  const actionLock = useRef(false)
  const mounted = useRef(true)
  const canWork = useCallback(
    () =>
      mounted.current &&
      isAssistantSessionCurrent(
        origin,
        getSession(),
        useOperationalModeStore.getState().isOfflineMode,
      ),
    [origin],
  )
  const currentScope = assistantScopeKey(auth.session)
  const scopeChanged = scope !== currentScope || origin?.token !== auth.token
  const storageKey = `ewatrade:setup-assistant:v1:${scope}`
  const state = useQuery(
    trpc.setupAssistant.state.queryOptions(undefined, {
      enabled: canWork(),
      retry: false,
      refetchOnWindowFocus: false,
    }),
  )
  const server = useMemo(() => readSetupSnapshot(state.data), [state.data])
  const now = Date.now()
  const cachedData =
    cached && now - cached.savedAt <= 24 * 60 * 60 * 1000 ? cached.data : null
  const recentServer =
    state.dataUpdatedAt > 0 && now - state.dataUpdatedAt <= 24 * 60 * 60 * 1000
      ? server
      : null
  const data = scopeChanged
    ? null
    : offline
      ? (cachedData ?? recentServer)
      : server
  const savedAt = offline
    ? (cached?.savedAt ?? state.dataUpdatedAt)
    : state.dataUpdatedAt
  const start = useMutation(trpc.setupAssistant.start.mutationOptions())
  const begin = useMutation(trpc.setupAssistant.begin.mutationOptions())
  const skip = useMutation(trpc.setupAssistant.skip.mutationOptions())
  const finish = useMutation(trpc.setupAssistant.finish.mutationOptions())
  const change = useMutation(
    trpc.setupAssistant.setEntityState.mutationOptions(),
  )
  const update = useMutation(trpc.setupAssistant.updateEntity.mutationOptions())
  const commit = useMutation(trpc.setupAssistant.commit.mutationOptions())
  const refresh = useCallback(async () => {
    if (!canWork()) return
    return state.refetch({ throwOnError: true })
  }, [canWork, state.refetch])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    let live = true
    setCacheLoading(true)
    void AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (live && !scopeChanged) {
          const value = readSetupCache(raw, scope ?? "")
          setCached(value ? { savedAt: value.savedAt, data: value.data } : null)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (live) setCacheLoading(false)
      })
    return () => {
      live = false
    }
  }, [scope, storageKey, scopeChanged])
  useEffect(() => {
    if (!state.data || !canWork()) return
    if (!server) {
      setCached(null)
      void AsyncStorage.removeItem(storageKey).catch(() => {})
      return
    }
    const value = { scope, savedAt: state.dataUpdatedAt, data: server }
    setCached(value)
    void AsyncStorage.setItem(storageKey, JSON.stringify(value)).catch(() => {
      if (mounted.current)
        setNotice("This setup list could not be saved for offline viewing.")
    })
  }, [state.data, state.dataUpdatedAt, storageKey, scope, canWork, server])
  const conversationId = data?.conversation?.id ?? "not-started"
  const guardedFetch = useCallback(
    async (
      input: Parameters<typeof expoFetch>[0],
      options?: Parameters<typeof expoFetch>[1],
    ) => {
      if (!canWork()) throw new Error("Assistant session changed")
      const session = getSession()
      if (!session) throw new Error("Sign in again")
      const response = await expoFetch(input, {
        ...options,
        headers: {
          ...Object.fromEntries(new Headers(options?.headers).entries()),
          ...assistantRequestHeaders(session),
        },
      })
      if (!canWork()) throw new Error("Assistant session changed")
      return response
    },
    [canWork],
  )
  const transport = useMemo(
    () =>
      new DefaultChatTransport<Message>({
        api: `${getBaseUrl()}/api/assistant/chat`,
        fetch: guardedFetch as typeof fetch,
        prepareSendMessagesRequest: ({ messages }) => {
          if (!canWork()) throw new Error("Assistant session changed")
          const last = [...messages].reverse().find((m) => m.role === "user")
          if (!last) throw new Error("Message unavailable")
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
    [conversationId, guardedFetch, canWork],
  )
  const chat = useChat<Message>({
    id: `${scope}:${conversationId}`,
    messages: data ? setupInitialMessages(data) : [],
    transport,
    onData: (part) => {
      if (!canWork()) return
      if (part.type === "data-setup-run" && part.data.runId)
        setRunId(part.data.runId)
      if (part.type === "data-setup-draft") void refresh().catch(() => {})
    },
    onFinish: () => {
      if (canWork()) void refresh().catch(() => {})
    },
  })
  const busy = chat.status === "submitted" || chat.status === "streaming"
  useEffect(() => {
    if (canWork() && !busy && !runId && server?.activeRunId)
      setRunId(server.activeRunId)
  }, [server?.activeRunId, busy, runId, canWork])
  const latestMessages = useRef(chat.messages)
  latestMessages.current = chat.messages
  const snapshotRevision = useRef(0)
  useEffect(() => {
    if (
      !data ||
      busy ||
      chat.error ||
      state.dataUpdatedAt === snapshotRevision.current
    )
      return
    snapshotRevision.current = state.dataUpdatedAt
    chat.setMessages(setupInitialMessages(data))
  }, [data, state.dataUpdatedAt, busy, chat.error, chat.setMessages])
  useEffect(() => {
    if (!offline && !scopeChanged) return
    void chat.stop()
    setDraft("")
    setRunId(null)
  }, [offline, scopeChanged, chat.stop])
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") void chat.stop()
    })
    return () => {
      sub.remove()
      void chat.stop()
    }
  }, [chat.stop])
  useEffect(() => {
    if (!runId || busy || !canWork()) return
    let cancelled = false
    const controller = new AbortController()
    void (async () => {
      for (let attempt = 0; attempt < 6 && !cancelled && canWork(); attempt++) {
        try {
          const response = await guardedFetch(
            `${getBaseUrl()}/api/assistant/runs/${encodeURIComponent(runId)}`,
            { signal: controller.signal },
          )
          if (!response.ok) break
          const run = readSetupRun(await response.json(), conversationId)
          if (!run) break
          if (cancelled || !canWork()) return
          if (run.status !== "RUNNING") {
            setRunId(null)
            chat.clearError()
            if (run.status === "FAILED") {
              const last = [...latestMessages.current]
                .reverse()
                .find((m) => m.role === "user")
              if (last) setDraft(setupPlainText(last.parts))
              setNotice(
                "The reply stopped. Your list is saved. Review it, then send again to continue.",
              )
            }
            await refresh()
            return
          }
        } catch {
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 1500))
      }
      if (!cancelled && canWork())
        setNotice("Reply status is uncertain. Refresh before sending again.")
    })()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [
    runId,
    busy,
    canWork,
    guardedFetch,
    refresh,
    conversationId,
    chat.clearError,
  ])
  const recover = async () => {
    if (!runId || busy || !canWork()) return
    try {
      const response = await guardedFetch(
        `${getBaseUrl()}/api/assistant/runs/${encodeURIComponent(runId)}`,
      )
      const run = response.ok
        ? readSetupRun(await response.json(), conversationId)
        : null
      if (!canWork()) return
      if (run && run.status !== "RUNNING") {
        chat.clearError()
        if (run.status === "FAILED") {
          const last = [...latestMessages.current]
            .reverse()
            .find((m) => m.role === "user")
          if (last) setDraft(setupPlainText(last.parts))
        }
        await refresh()
        if (canWork()) {
          setRunId(null)
          setNotice(null)
        }
      } else
        setNotice(
          run
            ? "Your reply is still processing. Check again shortly."
            : "Reply status is uncertain. Check again before sending.",
        )
    } catch {
      if (canWork())
        setNotice("Reply status is uncertain. Reconnect and check again.")
    }
  }
  const act = async (label: string, work: () => Promise<unknown>) => {
    if (!canWork() || actionLock.current || busy || runId || state.isError)
      return false
    actionLock.current = true
    setPending(label)
    setNotice(null)
    try {
      await work()
      if (!canWork()) return false
      await refresh()
      return true
    } catch {
      if (canWork())
        setNotice(
          label.startsWith("Adding")
            ? "Adding paused. Review the saved results before trying again."
            : "Your change could not be saved. Reconnect and try again.",
        )
      return false
    } finally {
      actionLock.current = false
      if (mounted.current) setPending(null)
    }
  }
  const open = () =>
    act("Starting…", async () => {
      if (!data?.conversation) {
        await start.mutateAsync(undefined)
        if (!canWork()) return
      }
      await begin.mutateAsync(undefined)
    })
  const setEntity = (key: string, next: "CONFIRMED" | "PROPOSED" | "SKIPPED") =>
    act("Saving…", () =>
      change.mutateAsync({ conversationId, keys: [key], state: next }),
    )
  const saveEntity = (key: string, payload: SetupEntityPayload) =>
    act("Saving details…", () =>
      update.mutateAsync({ conversationId, key, payload }),
    )
  const add = (keys: string[]) =>
    act("Adding to your business…", async () => {
      if (!keys.length) return
      for (let round = 0; round < 24; round++) {
        if (!canWork()) return
        const outcome = await commit.mutateAsync({ conversationId, keys })
        if (!canWork()) return
        await refresh()
        if (outcome.interrupted) {
          setNotice(
            "Adding paused. Your setup list is saved; check which records were added.",
          )
          break
        }
        if (outcome.remaining === 0) break
        if (round === 23)
          setNotice(
            "Adding paused after this batch. Review the saved results and continue.",
          )
      }
    })
  const error = chat.error ? assistantError(chat.error) : null
  const send = () => {
    if (
      !canWork() ||
      state.isError ||
      busy ||
      pending ||
      data?.conversation?.status !== "ACTIVE" ||
      error?.allowance ||
      runId
    )
      return
    const text = draft.trim()
    if (!text) return
    setDraft("")
    void chat.sendMessage({ text }).catch(() => {})
  }
  const retry = () => {
    if (!canWork() || busy || error?.allowance) return
    if (runId) {
      void recover()
      return
    }
    if (error?.replay) {
      chat.clearError()
      void refresh().catch(() => {})
      return
    }
    void chat.regenerate().catch(() => {})
  }
  return {
    auth,
    state,
    data,
    savedAt,
    offline,
    scopeChanged,
    cacheLoading,
    notice,
    pending,
    draft,
    setDraft,
    chat,
    busy,
    error,
    runId,
    recover,
    open,
    setEntity,
    saveEntity,
    add,
    send,
    retry,
    refresh,
    close: (hasAdded: boolean) =>
      act("Saving…", () =>
        hasAdded ? finish.mutateAsync(undefined) : skip.mutateAsync(undefined),
      ),
    canWork,
  }
}
