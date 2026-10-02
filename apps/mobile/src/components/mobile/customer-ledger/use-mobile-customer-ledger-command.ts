import { createFinanceCommandRunner } from "@/lib/customer-ledger/command-runner"
import { getSession } from "@/lib/session-store"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import {
  FinanceCommandLockUnavailableError,
  type FinanceCommandScope,
  financeCommandLockName,
} from "@ewatrade/utils/finance-command-identity"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useQueryClient } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { useCallback, useEffect, useRef, useState } from "react"
import { Platform } from "react-native"

const running = new Set<string>()
async function lock<T>(scope: FinanceCommandScope, action: () => Promise<T>) {
  const key = financeCommandLockName(scope)
  if (running.has(key)) throw new FinanceCommandLockUnavailableError()
  running.add(key)
  try {
    if (Platform.OS === "web") {
      if (!navigator.locks)
        throw new Error(
          "Safe submission locking is unavailable. Use the installed mobile app or dashboard.",
        )
      return await navigator.locks.request(
        key,
        { ifAvailable: true },
        async (held) => {
          if (!held) throw new FinanceCommandLockUnavailableError()
          return action()
        },
      )
    }
    return await action()
  } finally {
    running.delete(key)
  }
}

export function useMobileCustomerLedgerCommand(
  scope: FinanceCommandScope & { accountId: string },
) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const mounted = useRef(true)
  const busy = useRef(false)
  const [ready, setReady] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [retained, setRetained] =
    useState<
      Awaited<
        ReturnType<ReturnType<typeof createFinanceCommandRunner>["inspect"]>
      >
    >(null)
  // The enclosing workspace is keyed by authenticated actor, tenant and book.
  const [runner] = useState(() =>
    createFinanceCommandRunner(
      {
        ...scope,
        bookId: `customer-ledger/${scope.bookId}/${scope.accountId}`,
      },
      {
        storage: AsyncStorage,
        uuid: Crypto.randomUUID,
        hash: (value) =>
          Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
        withLock: (action) =>
          lock(
            {
              ...scope,
              bookId: `customer-ledger/${scope.bookId}/${scope.accountId}`,
            },
            action,
          ),
        isCurrent: () => {
          const profile = getSession()?.profile
          return (
            mounted.current &&
            profile?.id === scope.actorUserId &&
            profile.businessId === scope.tenantId &&
            ["OWNER", "ADMIN"].includes(
              profile.role?.trim().toUpperCase() ?? "",
            ) &&
            !useOperationalModeStore.getState().isOfflineMode
          )
        },
        status: async (clientCommandId) =>
          (
            await client.fetchQuery(
              trpc.customerLedger.commandStatus.queryOptions(
                { accountId: scope.accountId, clientCommandId },
                { staleTime: 0 },
              ),
            )
          ).status,
      },
    ),
  )
  const inspect = useCallback(
    async (clearError = false) => {
      try {
        const value = await runner.inspect()
        if (mounted.current) {
          setRetained(value)
          setReady(true)
          if (clearError) setError(null)
        }
      } catch (failure) {
        if (mounted.current) {
          setReady(false)
          setError(
            failure instanceof Error
              ? failure.message
              : "Saved submission status is unavailable.",
          )
        }
      }
    },
    [runner],
  )
  useEffect(() => {
    mounted.current = true
    void inspect()
    return () => {
      mounted.current = false
    }
  }, [inspect])
  async function refresh() {
    try {
      await Promise.all([
        client.invalidateQueries({ queryKey: trpc.customerLedger.pathKey() }),
        client.invalidateQueries({ queryKey: trpc.finance.pathKey() }),
        client.invalidateQueries({ queryKey: trpc.orders.pathKey() }),
        client.invalidateQueries({ queryKey: trpc.customers.pathKey() }),
        client.invalidateQueries({ queryKey: trpc.services.pathKey() }),
      ])
    } catch {
      if (mounted.current)
        setNotice(
          "Recorded successfully. Refresh financial records to see the update.",
        )
    }
  }
  async function run(
    operation: string,
    payload: unknown,
    write: (id: string) => Promise<unknown>,
    successMessage = "Customer record saved.",
  ) {
    if (busy.current || !ready) return false
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
      if (mounted.current) setNotice(successMessage)
      await refresh()
      return true
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "The result could not be confirmed. Check the saved result before continuing.",
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
      if (mounted.current)
        setNotice(
          result === "REJECTED"
            ? "Earlier submission was rejected. Review corrected details before recording."
            : result === "RECORDED"
              ? "Earlier submission is recorded. No second entry was created."
              : "No saved submission needs acknowledgement.",
        )
      await refresh()
      return result
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "The saved result remains unconfirmed.",
        )
      return undefined
    } finally {
      await inspect()
      busy.current = false
      if (mounted.current) setPending(false)
    }
  }
  return { ready, pending, error, notice, retained, run, acknowledge, inspect }
}
