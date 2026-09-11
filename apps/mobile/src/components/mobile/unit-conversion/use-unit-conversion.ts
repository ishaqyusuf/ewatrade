import { useModal } from "@/components/ui/modal"
import { useAuthContext } from "@/hooks/use-auth"
import { createInventoryConversionFixture } from "@/internal-tooling/fixture-recipes"
import { canManageMobileOperations } from "@/lib/mobile-roles"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { useEffect, useMemo, useRef, useState } from "react"
import { Keyboard } from "react-native"
import {
  compatibleConversionTarget,
  conversionCommand,
  EMPTY_CONVERSION,
  projectConversion,
  type ConversionDraft,
  type ConversionInput,
  type ConversionProps,
  type ConversionReview,
} from "./unit-conversion-model"

export function useUnitConversion({ onComplete }: ConversionProps) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { profile } = useAuthContext()
  const canManage = canManageMobileOperations(profile?.role)
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const [draft, setDraft] = useState<ConversionDraft>(EMPTY_CONVERSION)
  const draftRef = useRef(draft)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [phase, setPhase] = useState<
    "editing" | "posting" | "retry" | "complete"
  >("editing")
  const [review, setReview] = useState<ConversionReview | null>(null)
  const reviewRef = useRef<ConversionReview | null>(null)
  const attempt = useRef<ConversionInput | null>(null)
  const busy = useRef(false)
  const completed = useRef(false)
  const mounted = useRef(true)
  const fillSnapshot = useRef<ConversionDraft | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const reviewModal = useModal()
  const origin = useRef<{ businessId: string; userId: string } | null>(null)
  if (!origin.current && profile?.businessId && profile.id)
    origin.current = { businessId: profile.businessId, userId: profile.id }
  const availability = useQuery(
    trpc.tenant.featureAvailability.queryOptions(undefined, {
      enabled: canManage && !offline,
      retry: false,
    }),
  )
  const storeId = availability.data?.storeId
  const firstStore = useRef<string | undefined>(undefined)
  if (!firstStore.current && storeId) firstStore.current = storeId
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
  const scopeChanged =
    Boolean(
      origin.current &&
        (origin.current.businessId !== profile?.businessId ||
          origin.current.userId !== profile?.id),
    ) || Boolean(firstStore.current && storeId !== firstStore.current)
  const balances = useQuery(
    trpc.inventory.balanceReport.queryOptions(
      { includeCompatibleTotals: false, storeId },
      {
        enabled: canManage && !offline && !scopeChanged && Boolean(storeId),
        retry: false,
      },
    ),
  )
  const rows = useMemo(
    () =>
      canManage && !scopeChanged && storeId
        ? (balances.data?.rows ?? []).filter(
            (row) => row.storeId === storeId && row.kind === "PACKAGED_STOCK",
          )
        : [],
    [balances.data?.rows, canManage, scopeChanged, storeId],
  )
  const source = rows.find((row) => row.balanceSourceId === draft.sourceId)
  const target = rows.find((row) => row.balanceSourceId === draft.targetId)
  const targetRows = source
    ? rows.filter((row) => compatibleConversionTarget(source, row))
    : []
  const projection = projectConversion(
    source,
    target,
    draft.sourceQuantity,
    draft.targetQuantity,
  )
  const loading =
    canManage &&
    !offline &&
    (availability.isPending || (Boolean(storeId) && balances.isPending))
  const loadError =
    availability.error?.message ?? balances.error?.message ?? null
  const pending = phase === "posting"
  const locked =
    offline ||
    !canManage ||
    scopeChanged ||
    pending ||
    Boolean(review) ||
    Boolean(attempt.current) ||
    completed.current
  const mutation = useMutation(
    trpc.inventory.transformPackagedStock.mutationOptions({ retry: false }),
  )
  const canReview =
    canManage &&
    !offline &&
    !scopeChanged &&
    !pending &&
    !completed.current &&
    (Boolean(attempt.current) ||
      Boolean(storeId && source && target && !loading && !loadError))
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    if (review) reviewModal.present()
  }, [review, reviewModal.present])

  function edit(patch: Partial<ConversionDraft>) {
    if (
      locked ||
      busy.current ||
      completed.current ||
      attempt.current ||
      reviewRef.current
    )
      return
    const next = { ...draftRef.current, ...patch }
    draftRef.current = next
    setDraft(next)
    setError(null)
  }
  function selectSource(id: string) {
    if (id === draftRef.current.sourceId) return
    const next = rows.find((row) => row.balanceSourceId === id)
    if (!next) return
    const previousTarget = rows.find(
      (row) => row.balanceSourceId === draftRef.current.targetId,
    )
    edit({
      sourceId: id,
      targetId:
        previousTarget && compatibleConversionTarget(next, previousTarget)
          ? previousTarget.balanceSourceId
          : "",
      sourceQuantity: "",
      targetQuantity: "",
    })
  }
  function selectTarget(id: string) {
    if (id === draftRef.current.targetId) return
    const currentSource = rows.find(
      (row) => row.balanceSourceId === draftRef.current.sourceId,
    )
    const next = rows.find((row) => row.balanceSourceId === id)
    if (
      !currentSource ||
      !next ||
      !compatibleConversionTarget(currentSource, next)
    )
      return
    edit({ targetId: id, targetQuantity: "" })
  }
  function retryLoad() {
    if (!canManage || scopeChanged || offline || busy.current) return
    void availability.refetch()
    if (storeId) void balances.refetch()
  }
  function openReview() {
    if (!canReview || busy.current || completed.current) return
    if (attempt.current) {
      reviewModal.present()
      return
    }
    const current = draftRef.current
    const source = rows.find((row) => row.balanceSourceId === current.sourceId)
    const target = rows.find((row) => row.balanceSourceId === current.targetId)
    const ready = projectConversion(
      source,
      target,
      current.sourceQuantity,
      current.targetQuantity,
    )
    if (!ready.value || ready.error) {
      setError(ready.error)
      return
    }
    const reason = current.reason.trim()
    if (!reason || reason.length > 500) {
      setError("Add a reason of 1–500 characters.")
      return
    }
    if (!source || !target || !storeId || !profile?.businessId || !profile.id)
      return
    const snapshot: ConversionReview = {
      source: { ...source },
      target: { ...target },
      projection: ready.value,
      reason,
      storeId,
      businessId: profile.businessId,
      userId: profile.id,
    }
    reviewRef.current = snapshot
    setReview(snapshot)
    setError(null)
    Keyboard.dismiss()
  }
  function dismissReview() {
    if (!busy.current) reviewModal.dismiss()
  }
  function afterDismiss() {
    if (!attempt.current) {
      reviewRef.current = null
      setReview(null)
    }
  }
  function sameScope(snapshot: ConversionReview) {
    return (
      mounted.current &&
      scope.current.canManage &&
      snapshot.userId === scope.current.userId &&
      snapshot.businessId === scope.current.businessId &&
      snapshot.storeId === scope.current.storeId
    )
  }
  async function confirm() {
    const snapshot = reviewRef.current
    if (!snapshot || busy.current || completed.current) return
    if (
      !sameScope(snapshot) ||
      useOperationalModeStore.getState().isOfflineMode
    ) {
      setError(
        "Return online to the original account, business and Store with inventory management permission.",
      )
      return
    }
    if (!attempt.current)
      attempt.current = conversionCommand(
        snapshot,
        `transform-${Crypto.randomUUID()}`,
      )
    busy.current = true
    setPhase("posting")
    setError(null)
    try {
      await mutation.mutateAsync(attempt.current)
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
            trpc.catalog.listItemsPage.queryFilter(),
          ),
          queryClient.invalidateQueries(
            trpc.tenant.featureAvailability.queryFilter(),
          ),
        ])
      } catch {
        if (mounted.current)
          setNotice(
            "Transformation recorded. Some lists could not refresh; reload them when connected.",
          )
      }
      if (sameScope(snapshot)) onComplete?.()
    } catch (failure) {
      if (completed.current || !mounted.current) return
      setPhase("retry")
      setError(
        failure instanceof Error
          ? failure.message
          : "Transformation not confirmed. Retry only the retained request.",
      )
    } finally {
      busy.current = false
    }
  }
  function fill() {
    if (locked || busy.current || loading || loadError) return
    const fixture = createInventoryConversionFixture(rows)
    if (!fixture) {
      setError(
        "Add two compatible packaged balances with enough exact available stock before filling this draft.",
      )
      return
    }
    fillSnapshot.current = { ...draftRef.current }
    edit({
      sourceId: fixture.sourceBalanceSourceId,
      sourceQuantity: fixture.sourceQuantity,
      targetId: fixture.targetBalanceSourceId,
      targetQuantity: fixture.targetQuantity,
      reason: fixture.reason,
    })
    setCanUndo(true)
  }
  function undo() {
    if (locked || busy.current || !fillSnapshot.current) return
    edit(fillSnapshot.current)
    fillSnapshot.current = null
    setCanUndo(false)
  }
  return {
    draft,
    edit,
    rows,
    source,
    target,
    targetRows,
    selectSource,
    selectTarget,
    projection,
    error,
    notice,
    phase,
    pending,
    locked,
    canManage,
    offline,
    scopeChanged,
    loading,
    loadError,
    missingStore: !loading && !storeId,
    hasBalanceData: Boolean(balances.data),
    storeName: source?.storeName ?? rows[0]?.storeName ?? "Current Store",
    canReview,
    hasAttempt: Boolean(attempt.current),
    review,
    reviewModal,
    openReview,
    dismissReview,
    afterDismiss,
    confirm,
    retryLoad,
    fill,
    undo,
    canUndo,
  }
}
export type UnitConversionModel = ReturnType<typeof useUnitConversion>
