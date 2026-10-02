"use client"
import { createCustomerLedgerCommandRunner } from "@/lib/customer-ledger/command-runner"
import { withFinanceCommandLock } from "@/lib/finance-command-recovery"
import { useTRPC } from "@/trpc/client"
import type { FinanceCommandScope } from "@ewatrade/utils/finance-command-identity"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"
export function useCustomerLedgerCommand(
  scope: FinanceCommandScope & { accountId: string },
) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const mounted = useRef(true)
  const busy = useRef(false)
  const [ready, setReady] = useState(false)
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [retained, setRetained] =
    useState<
      Awaited<
        ReturnType<
          ReturnType<typeof createCustomerLedgerCommandRunner>["inspect"]
        >
      >
    >(null)
  const [runner] = useState(() => {
    const identity = {
      actorUserId: scope.actorUserId,
      tenantId: scope.tenantId,
      bookId: `customer-ledger/${scope.bookId}/${scope.accountId}`,
    }
    return createCustomerLedgerCommandRunner(identity, {
      storage: {
        getItem: async (key) => window.localStorage.getItem(key),
        setItem: async (key, value) => window.localStorage.setItem(key, value),
        removeItem: async (key) => window.localStorage.removeItem(key),
      },
      uuid: () => crypto.randomUUID(),
      hash: async (value) =>
        [
          ...new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(value),
            ),
          ),
        ]
          .map((v) => v.toString(16).padStart(2, "0"))
          .join(""),
      withLock: (action) => withFinanceCommandLock(identity, action),
      isCurrent: () => mounted.current && navigator.onLine,
      status: async (clientCommandId) =>
        (
          await client.fetchQuery(
            trpc.customerLedger.commandStatus.queryOptions(
              { accountId: scope.accountId, clientCommandId },
              { staleTime: 0, retry: false },
            ),
          )
        ).status,
    })
  })
  const inspect = useCallback(async () => {
    try {
      const value = await runner.inspect()
      if (mounted.current) {
        setRetained(value)
        setReady(true)
      }
    } catch (failure) {
      if (mounted.current) {
        setReady(false)
        setError(
          failure instanceof Error ? failure.message : "Recovery unavailable.",
        )
      }
    }
  }, [runner])
  useEffect(() => {
    mounted.current = true
    void inspect()
    const update = () => {
      void inspect()
    }
    window.addEventListener("storage", update)
    window.addEventListener("online", update)
    return () => {
      mounted.current = false
      window.removeEventListener("storage", update)
      window.removeEventListener("online", update)
    }
  }, [inspect])
  async function invalidate() {
    await Promise.all([
      client.invalidateQueries({ queryKey: trpc.customerLedger.pathKey() }),
      client.invalidateQueries({ queryKey: trpc.finance.pathKey() }),
      client.invalidateQueries({ queryKey: trpc.orders.pathKey() }),
      client.invalidateQueries({ queryKey: trpc.customers.pathKey() }),
      client.invalidateQueries({ queryKey: trpc.services.pathKey() }),
    ])
  }
  async function run(
    operation: string,
    payload: unknown,
    write: (id: string) => Promise<unknown>,
  ) {
    if (busy.current || !ready || saved) return false
    busy.current = true
    setPending(true)
    setError(null)
    setNotice(null)
    try {
      await runner.run(operation, payload, write, {
        ...(payload &&
        typeof payload === "object" &&
        "effectiveAt" in payload &&
        payload.effectiveAt instanceof Date
          ? { asOf: payload.effectiveAt.toISOString() }
          : {}),
        ...(payload &&
        typeof payload === "object" &&
        "expectedRevision" in payload &&
        typeof payload.expectedRevision === "string"
          ? { expectedSnapshotSequence: payload.expectedRevision }
          : {}),
      })
      if (mounted.current) {
        setSaved(true)
        setNotice("Recorded. Refresh the statement to see the new snapshot.")
      }
      await invalidate().catch(() =>
        setNotice("Recorded. Refresh financial records to see the update."),
      )
      return true
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Result uncertain. Retain the original details and check the saved result.",
        )
      return false
    } finally {
      await inspect()
      busy.current = false
      if (mounted.current) setPending(false)
    }
  }
  async function acknowledge() {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setError(null)
    try {
      const result = await runner.acknowledge()
      if (mounted.current) {
        setSaved(result === "RECORDED")
        setNotice(
          result === "RECORDED"
            ? "Earlier submission recorded; no second entry created."
            : "Earlier rejection acknowledged. Review corrected details.",
        )
      }
      await invalidate()
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Saved result is unconfirmed.",
        )
    } finally {
      await inspect()
      busy.current = false
      if (mounted.current) setPending(false)
    }
  }
  return {
    ready,
    pending,
    saved,
    error,
    notice,
    retained,
    run,
    acknowledge,
    inspect,
  }
}
