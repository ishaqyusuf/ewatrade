import { useAuthContext } from "@/hooks/use-auth"
import { canManageMobileOperations } from "@/lib/mobile-roles"
import { createInventoryFixture } from "@/internal-tooling/fixture-recipes"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useModal } from "@/components/ui/modal"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { useEffect, useMemo, useRef, useState } from "react"
import { Keyboard } from "react-native"
import {
  closeoutLines,
  type CloseoutContentProps,
  type CloseoutCreateInput,
  type CloseoutReview,
} from "./closeout-model"

type Attempt = {
  input: CloseoutCreateInput
  finalId: string
  finalReason: string
  businessId: string
  closeoutId?: string
}

export function useCloseout({
  attendantName,
  onComplete,
}: CloseoutContentProps) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { profile } = useAuthContext()
  const canManage = canManageMobileOperations(profile?.role)
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const reviewModal = useModal()
  const [values, setValues] = useState<Record<string, string>>({})
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [review, setReview] = useState<CloseoutReview | null>(null)
  const [phase, setPhase] = useState<
    "editing" | "creating" | "finalizing" | "retry" | "complete"
  >("editing")
  const [notice, setNotice] = useState<string | null>(null)
  const attempt = useRef<Attempt | null>(null)
  const busy = useRef(false)
  const completed = useRef(false)
  const mounted = useRef(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const quickFillSnapshot = useRef<{
    values: Record<string, string>
    reason: string
  } | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])
  const availability = useQuery(
    trpc.tenant.featureAvailability.queryOptions(undefined, {
      enabled: !offline,
      retry: false,
    }),
  )
  const storeId = availability.data?.storeId
  const scope = useRef({
    businessId: profile?.businessId,
    userId: profile?.id,
    storeId,
    canManage,
  })
  scope.current = {
    businessId: profile?.businessId,
    userId: profile?.id,
    storeId,
    canManage,
  }
  const balances = useQuery(
    trpc.inventory.balanceReport.queryOptions(
      { includeCompatibleTotals: false, storeId },
      { enabled: canManage && !offline && Boolean(storeId), retry: false },
    ),
  )
  const custody = useMemo(
    () =>
      (canManage ? (balances.data?.rows ?? []) : []).filter(
        (row) =>
          row.storeId === storeId &&
          row.custodyType === "STAFF" &&
          row.custodyReferenceId === profile?.id,
      ),
    [balances.data?.rows, canManage, profile?.id, storeId],
  )
  const lines = useMemo(() => closeoutLines(custody, values), [custody, values])
  const changedCount = lines.filter(
    (line) => line.variance !== null && line.variance !== "0",
  ).length
  const create = useMutation(trpc.inventory.createCloseout.mutationOptions())
  const finalize = useMutation(
    trpc.inventory.finalizeCloseout.mutationOptions(),
  )
  const loading =
    !offline &&
    canManage &&
    (availability.isPending || (Boolean(storeId) && balances.isPending))
  const loadError =
    availability.error?.message ?? balances.error?.message ?? null
  const pending = phase === "creating" || phase === "finalizing"
  const scopeChanged = Boolean(
    attempt.current &&
      (attempt.current.businessId !== profile?.businessId ||
        attempt.current.input.custodyReferenceId !== profile?.id ||
        attempt.current.input.storeId !== storeId),
  )
  const locked =
    offline ||
    !canManage ||
    pending ||
    Boolean(attempt.current) ||
    completed.current

  function editValue(id: string, value: string) {
    if (locked || busy.current) return
    setValues((current) => ({ ...current, [id]: value }))
    setError(null)
  }
  function editReason(value: string) {
    if (locked || busy.current) return
    setReason(value)
    setError(null)
  }
  function retryLoad() {
    if (offline || busy.current) return
    void availability.refetch()
    if (canManage && storeId) void balances.refetch()
  }
  function openReview() {
    if (busy.current || completed.current || offline || !canManage) return
    if (attempt.current) {
      reviewModal.present()
      return
    }
    if (!profile?.id || !profile.businessId || !storeId || loading || loadError)
      return
    if (
      !lines.length ||
      lines.length > 500 ||
      lines.some((line) => line.error)
    ) {
      setError(
        lines.length > 500
          ? "Closeout supports up to 500 custody balances at a time."
          : "Check every declared quantity before reviewing.",
      )
      return
    }
    const trimmedReason = reason.trim()
    if (trimmedReason.length > 500) {
      setError("Keep the reason to 500 characters or fewer.")
      return
    }
    const snapshot: CloseoutReview = {
      lines,
      reason: trimmedReason,
      businessId: profile.businessId,
      createInput: {
        storeId,
        custodyReferenceId: profile.id,
        custodyType: "staff",
        declarations: lines.flatMap((line) =>
          line.declaredQuantity === null
            ? []
            : [
                {
                  balanceSourceId: line.balance.balanceSourceId,
                  declaredQuantity: line.declaredQuantity,
                  expectedRevision: line.balance.revision,
                },
              ],
        ),
        reason: trimmedReason || "End of shift closeout",
      },
    }
    setReview(snapshot)
    setError(null)
    Keyboard.dismiss()
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      if (mounted.current) reviewModal.present()
    }, 120)
  }
  function dismissReview() {
    if (busy.current) return
    reviewModal.dismiss()
  }
  function afterDismiss() {
    if (!attempt.current) setReview(null)
  }
  async function confirm() {
    if (busy.current || completed.current || !review) return
    if (
      offline ||
      useOperationalModeStore.getState().isOfflineMode ||
      !canManage
    ) {
      setError(
        "Reconnect with inventory management permission to confirm this closeout.",
      )
      return
    }
    if (
      review.businessId !== profile?.businessId ||
      review.createInput.custodyReferenceId !== profile?.id ||
      review.createInput.storeId !== storeId
    ) {
      setError(
        "Return to the original business and Store before retrying this declaration.",
      )
      return
    }
    if (!attempt.current) {
      attempt.current = {
        input: {
          ...review.createInput,
          clientOperationId: `closeout-${Crypto.randomUUID()}`,
          schemaVersion: 1,
        },
        finalId: `closeout-final-${Crypto.randomUUID()}`,
        finalReason: review.reason || "Confirmed closeout",
        businessId: review.businessId,
      }
    }
    const current = attempt.current
    busy.current = true
    setError(null)
    try {
      if (!current.closeoutId) {
        setPhase("creating")
        const result = await create.mutateAsync(current.input)
        current.closeoutId = result.id
      }
      if (
        useOperationalModeStore.getState().isOfflineMode ||
        !scope.current.canManage ||
        scope.current.businessId !== current.businessId ||
        scope.current.userId !== current.input.custodyReferenceId ||
        scope.current.storeId !== current.input.storeId
      ) {
        throw new Error(
          "The declaration was saved but not finalized. Return online to the original business and Store, then retry with inventory management permission.",
        )
      }
      if (mounted.current) setPhase("finalizing")
      await finalize.mutateAsync({
        clientOperationId: current.finalId,
        closeoutId: current.closeoutId,
        reason: current.finalReason,
        schemaVersion: 1,
      })
      completed.current = true
      if (mounted.current) {
        setPhase("complete")
        reviewModal.dismiss()
      }
      try {
        await Promise.all([
          queryClient.invalidateQueries(
            trpc.inventory.balanceReport.queryFilter(),
          ),
          queryClient.invalidateQueries(
            trpc.inventory.operationHistory.queryFilter(),
          ),
          queryClient.invalidateQueries(
            trpc.tenant.featureAvailability.queryFilter(),
          ),
        ])
      } catch {
        if (mounted.current)
          setNotice(
            "Closeout recorded. Some lists could not refresh; reload them when connected.",
          )
      }
      if (mounted.current) onComplete?.()
    } catch (failure) {
      if (completed.current || !mounted.current) return
      setPhase("retry")
      setError(
        failure instanceof Error
          ? failure.message
          : "Closeout was not confirmed. Retry the same reviewed declaration.",
      )
    } finally {
      busy.current = false
    }
  }
  function fill(context: Parameters<typeof createInventoryFixture>[0]) {
    if (locked || busy.current) return
    if (!custody.length) {
      setError(
        "A current staff custody balance is required before filling this draft.",
      )
      return
    }
    quickFillSnapshot.current = { values, reason }
    setValues(
      Object.fromEntries(
        custody.map((row) => [row.balanceSourceId, row.onHandQuantity]),
      ),
    )
    setReason(createInventoryFixture(context).reason)
    setCanUndo(true)
    setError(null)
  }
  function undo() {
    if (locked || busy.current || !quickFillSnapshot.current) return
    setValues(quickFillSnapshot.current.values)
    setReason(quickFillSnapshot.current.reason)
    quickFillSnapshot.current = null
    setCanUndo(false)
  }
  return {
    attendantName: attendantName ?? profile?.name ?? "Staff member",
    storeName: custody[0]?.storeName ?? "Current Store",
    lines,
    changedCount,
    values,
    reason,
    review,
    reviewModal,
    phase,
    error,
    notice,
    canManage,
    offline,
    loading,
    loadError,
    locked,
    pending,
    scopeChanged,
    canUndo,
    hasBalanceData: Boolean(balances.data),
    hasAttempt: Boolean(attempt.current),
    hasDraft: Boolean(reason || Object.keys(values).length),
    hasSavedDraft: Boolean(attempt.current?.closeoutId),
    missingStore: !loading && !loadError && !storeId,
    canReview:
      !offline &&
      canManage &&
      !pending &&
      !completed.current &&
      (Boolean(attempt.current) ||
        (!loading && !loadError && lines.length > 0)),
    editValue,
    editReason,
    retryLoad,
    openReview,
    confirm,
    dismissReview,
    afterDismiss,
    fill,
    undo,
  }
}
