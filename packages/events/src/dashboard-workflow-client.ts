"use client"
import { useEffect, useMemo } from "react"
import {
  type DashboardBrowserAction,
  workflowFailure,
} from "./dashboard-workflows"
import { useEvents } from "./events-context"

/** Explicit fetch wrapper; never intercepts global fetch or reads request bodies. */
export function createDashboardWorkflowClient(
  events: Pick<ReturnType<typeof useEvents>, "workflow">,
  transport: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response> = fetch,
) {
  const track = (...args: Parameters<typeof events.workflow>) => {
    try {
      events.workflow(...args)
    } catch {
      /* Analytics cannot change application outcomes. */
    }
  }
  return {
    track,
    async fetch(
      action: DashboardBrowserAction,
      input: RequestInfo | URL,
      init?: RequestInit,
    ) {
      track(action, "started", { channel: "browser" })
      try {
        const response = await transport(input, init)
        track(
          action,
          response.ok
            ? "completed"
            : workflowFailure(
                response.status === 403
                  ? "FORBIDDEN"
                  : response.status === 401
                    ? "UNAUTHORIZED"
                    : response.status === 409
                      ? "CONFLICT"
                      : response.status === 429
                        ? "TOO_MANY_REQUESTS"
                        : undefined,
              ),
          { channel: "browser_response" },
        )
        return response
      } catch (error) {
        track(action, "failed", { channel: "browser" })
        throw error
      }
    },
  }
}
export function useDashboardWorkflow() {
  const events = useEvents()
  return useMemo(() => createDashboardWorkflowClient(events), [events])
}

/** Mount observations wait for policy resolution and fire once per visible state. */
export function useDashboardEmptyState(
  channel:
    | "directory"
    | "catalog"
    | "orders"
    | "inventory"
    | "customer-ledger"
    | "customers"
    | "staff"
    | "expenses"
    | "finance-bank-statements"
    | "finance-suppliers"
    | "domains"
    | "service-work"
    | "inventory-operations"
    | "stock-transfers"
    | "conversations"
    | "prescriptions"
    | "prescriptions_filtered",
) {
  const events = useEvents()
  useEffect(() => {
    let captured = false
    return events.whenReady(() => {
      if (captured) return
      captured = true
      try {
        events.workflow("empty_state", "observed", { channel })
      } catch {
        /* Optional observation. */
      }
    })
  }, [events, channel])
}
