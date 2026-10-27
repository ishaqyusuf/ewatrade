"use client"

import { useTRPC } from "@/trpc/client"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"

/**
 * live: subscribed to the status socket.
 * polling: no socket is offered; the page checks on a bounded schedule.
 * reconnecting: the socket dropped; reconnecting with backoff, then polling.
 * stopped: every bounded retry is spent; the customer can reload.
 */
export type StatusConnection =
  | "connecting"
  | "live"
  | "polling"
  | "reconnecting"
  | "stopped"

const SOCKET_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000]
const POLL_DELAYS_MS = [5_000, 10_000, 15_000, 30_000]
const POLL_LIMIT_MS = 20 * 60_000

/** Proofs are sent only after opening a secure, credential-free status URL. */
export function safeStatusSocketUrl(value: string | null) {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === "wss:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
      ? url.href
      : null
  } catch {
    return null
  }
}

function pollDelay(attempt: number) {
  return (
    POLL_DELAYS_MS[
      Math.min(Math.floor(attempt / 6), POLL_DELAYS_MS.length - 1)
    ] ?? 30_000
  )
}

function httpStatusOf(error: unknown) {
  const data =
    error && typeof error === "object" && "data" in error
      ? (error as { data?: { httpStatus?: unknown } }).data
      : null
  return typeof data?.httpStatus === "number" ? data.httpStatus : null
}

/**
 * Canonical report status. Socket messages are only hints to refetch; when the
 * socket is missing or keeps failing, polling runs only while the state is
 * checking and stops at a final state, after its time limit, or on unmount.
 */
export function useReportStatus(reportToken: string | null) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const options = trpc.businessBanking.reportStatus.queryOptions({
    reportToken: reportToken ?? "",
  })
  const queryKey = options.queryKey
  const query = useQuery({
    ...options,
    enabled: Boolean(reportToken),
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: (failureCount, error) => {
      const status = httpStatusOf(error)
      if (status !== null && status >= 400 && status < 500) return false
      return failureCount < 2
    },
  })
  const data = query.data
  const checking = data?.state === "checking" && data.status === "SUBMITTED"
  const socketUrl = safeStatusSocketUrl(data?.statusSocketUrl ?? null)

  const [connection, setConnection] = useState<StatusConnection>("connecting")
  const [restartKey, setRestartKey] = useState(0)
  const refetchRef = useRef<() => void>(() => undefined)
  refetchRef.current = () => {
    void queryClient.invalidateQueries({ queryKey })
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: restartKey explicitly restarts bounded recovery after the customer's Reload or online event.
  useEffect(() => {
    if (!reportToken || !checking) return
    let disposed = false
    let socket: WebSocket | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let authenticationTimer: ReturnType<typeof setTimeout> | undefined
    let socketFailures = 0
    let pollAttempt = 0
    const recoveryDeadline = Date.now() + POLL_LIMIT_MS

    const poll = () => {
      if (disposed) return
      if (Date.now() >= recoveryDeadline) {
        setConnection("stopped")
        return
      }
      timer = setTimeout(() => {
        if (disposed) return
        refetchRef.current()
        pollAttempt += 1
        poll()
      }, pollDelay(pollAttempt))
    }

    const connect = () => {
      if (disposed || !socketUrl) return
      if (Date.now() >= recoveryDeadline) {
        setConnection("stopped")
        return
      }
      let subscribed = false
      try {
        socket = new WebSocket(socketUrl)
      } catch {
        socketFailures = SOCKET_RETRY_DELAYS_MS.length
        setConnection("reconnecting")
        poll()
        return
      }
      socket.onopen = () => {
        socket?.send(JSON.stringify({ reportToken }))
        authenticationTimer = setTimeout(
          () => socket?.close(1000, "Status connection timed out"),
          8_000,
        )
      }
      socket.onmessage = (event) => {
        try {
          if (JSON.parse(event.data)?.type !== "payment-report.updated") return
        } catch {
          return
        }
        if (!subscribed) {
          if (authenticationTimer) clearTimeout(authenticationTimer)
          subscribed = true
          socketFailures = 0
          setConnection("live")
        }
        refetchRef.current()
      }
      socket.onclose = () => {
        if (authenticationTimer) clearTimeout(authenticationTimer)
        socket = null
        if (disposed) return
        // A missed hint is recovered by one canonical read.
        refetchRef.current()
        const delay = SOCKET_RETRY_DELAYS_MS[socketFailures]
        socketFailures += 1
        setConnection("reconnecting")
        if (delay === undefined) {
          poll()
          return
        }
        timer = setTimeout(connect, delay + Math.floor(Math.random() * 400))
      }
      socket.onerror = () => socket?.close()
    }

    if (socketUrl) {
      setConnection("connecting")
      connect()
    } else {
      setConnection("polling")
      poll()
    }

    const onOnline = () => setRestartKey((key) => key + 1)
    window.addEventListener("online", onOnline)
    return () => {
      disposed = true
      window.removeEventListener("online", onOnline)
      if (timer) clearTimeout(timer)
      if (authenticationTimer) clearTimeout(authenticationTimer)
      if (socket) {
        socket.onclose = null
        socket.onmessage = null
        socket.close(1000, "Page closed")
      }
    }
    // restartKey re-runs the bounded connection after Reload or coming back online.
  }, [reportToken, checking, socketUrl, restartKey])

  const reload = useCallback(() => {
    refetchRef.current()
    setRestartKey((key) => key + 1)
  }, [])

  return { query, connection, reload }
}
