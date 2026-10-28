"use client"

import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"

import {
  PREFLIGHT_WAIT_MS,
  preflightPollDelay,
  preflightRunning,
} from "./receipt-preflight-model"

/**
 * Reads the receipt check of this visit's prepared DRAFT before the customer's final submit. It
 * only reads the canonical report status (the same query the page shows), never submits, and
 * stops when the check finishes, the report leaves DRAFT, or the bounded wait ends.
 */
export function useReceiptPreflight(input: {
  reportToken: string | null
  /** Set once the receipt bytes reached the server. */
  startedAt: number | null
}) {
  const { reportToken, startedAt } = input
  const trpc = useTRPC()
  const [timedOut, setTimedOut] = useState(false)
  const query = useQuery({
    ...trpc.businessBanking.reportStatus.queryOptions({
      reportToken: reportToken ?? "",
    }),
    enabled: Boolean(reportToken && startedAt !== null),
    staleTime: 0,
    refetchInterval: (current) =>
      startedAt !== null && preflightRunning(current.state.data)
        ? preflightPollDelay(Date.now() - startedAt)
        : false,
  })

  useEffect(() => {
    setTimedOut(false)
    if (startedAt === null) return
    const timer = setTimeout(
      () => setTimedOut(true),
      Math.max(0, startedAt + PREFLIGHT_WAIT_MS - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [startedAt])

  const status = query.data
  return {
    status:
      status?.status === "DRAFT" && status.state !== "draft_cancelled"
        ? status
        : undefined,
    running: preflightRunning(status),
    timedOut: timedOut && preflightRunning(status),
  }
}
