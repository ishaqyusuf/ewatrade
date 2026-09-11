import { useModal } from "@/components/ui/modal"
import { useAuthContext } from "@/hooks/use-auth"
import { createInventoryFixture } from "@/internal-tooling/fixture-recipes"
import { canManageMobileOperations } from "@/lib/mobile-roles"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { useEffect, useMemo, useRef, useState } from "react"
import { Keyboard } from "react-native"
import {
  INITIAL_STOCK_DRAFT,
  stockCommand,
  stockCustodyLabel,
  stockDraftReadiness,
  type StockAttempt,
  type StockDraft,
  type StockIntakeProps,
  type StockReview,
} from "./stock-intake-model"

export function useStockIntake({ onComplete }: StockIntakeProps) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { profile } = useAuthContext()
  const canManage = canManageMobileOperations(profile?.role)
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const [draft, setDraft] = useState<StockDraft>(INITIAL_STOCK_DRAFT)
  const draftRef = useRef(draft)
  const [query, setQuery] = useState("")
  const [personQuery, setPersonQuery] = useState("")
  const [personPage, setPersonPage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [review, setReview] = useState<StockReview | null>(null)
  const reviewRef = useRef<StockReview | null>(null)
  const [phase, setPhase] = useState<
    "editing" | "posting" | "finalizing" | "retry" | "complete"
  >("editing")
  const [notice, setNotice] = useState<string | null>(null)
  const attempt = useRef<StockAttempt | null>(null)
  const busy = useRef(false)
  const complete = useRef(false)
  const mounted = useRef(true)
  const fillSnapshot = useRef<Pick<StockDraft, "quantity" | "reason"> | null>(
    null,
  )
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
  const initialStore = useRef<string | undefined>(undefined)
  if (!initialStore.current && storeId) initialStore.current = storeId
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
    ) || Boolean(initialStore.current && storeId !== initialStore.current)
  const balances = useQuery(
    trpc.inventory.balanceReport.queryOptions(
      { includeCompatibleTotals: false, storeId },
      {
        enabled: canManage && !offline && !scopeChanged && Boolean(storeId),
        retry: false,
      },
    ),
  )
  const assignees = useQuery(
    trpc.services.assignees.queryOptions(undefined, {
      enabled:
        canManage && !offline && !scopeChanged && draft.mode === "custody",
      retry: false,
    }),
  )
  const rows = useMemo(
    () =>
      canManage && !scopeChanged && storeId
        ? (balances.data?.rows ?? []).filter((row) => row.storeId === storeId)
        : [],
    [balances.data?.rows, canManage, scopeChanged, storeId],
  )
  const people = canManage && !scopeChanged ? (assignees.data ?? []) : []
  const visibleRows = rows.filter((row) =>
    [
      row.productName,
      row.variantName,
      row.inventoryUnitName,
      stockCustodyLabel(row, people),
    ]
      .join(" ")
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  )
  const filteredPeople = people.filter((person) =>
    `${person.name} ${person.email}`
      .toLowerCase()
      .includes(personQuery.trim().toLowerCase()),
  )
  const pageCount = Math.max(1, Math.ceil(filteredPeople.length / 12))
  const activePersonPage = Math.min(personPage, pageCount - 1)
  const selected = rows.find((row) => row.balanceSourceId === draft.balanceId)
  const loading =
    canManage &&
    !offline &&
    (availability.isPending || (Boolean(storeId) && balances.isPending))
  const loadError =
    availability.error?.message ?? balances.error?.message ?? null
  const pending = phase === "posting" || phase === "finalizing"
  const locked =
    offline ||
    !canManage ||
    scopeChanged ||
    pending ||
    Boolean(attempt.current) ||
    complete.current ||
    Boolean(review)
  const needsPeople =
    draft.mode === "custody" && draft.targetCustodyType === "staff"
  const readiness = stockDraftReadiness(draft, selected, people)
  const canReview =
    !offline &&
    canManage &&
    !scopeChanged &&
    !pending &&
    !complete.current &&
    (Boolean(attempt.current) ||
      Boolean(
        !loading &&
          !loadError &&
          selected &&
          storeId &&
          (!needsPeople || (!assignees.isPending && !assignees.isError)),
      ))
  const post = useMutation(
    trpc.inventory.postBalanceOperation.mutationOptions({ retry: false }),
  )
  const createCount = useMutation(
    trpc.inventory.createStockCount.mutationOptions({ retry: false }),
  )
  const finalizeCount = useMutation(
    trpc.inventory.finalizeStockCount.mutationOptions({ retry: false }),
  )
  const move = useMutation(
    trpc.inventory.moveCustody.mutationOptions({ retry: false }),
  )
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    if (review) reviewModal.present()
  }, [review, reviewModal.present])

  function edit(patch: Partial<StockDraft>) {
    if (
      locked ||
      busy.current ||
      attempt.current ||
      complete.current ||
      reviewRef.current
    )
      return
    const next = { ...draftRef.current, ...patch }
    draftRef.current = next
    setDraft(next)
    setError(null)
  }
  function retryLoad() {
    if (offline || busy.current || !canManage || scopeChanged) return
    void availability.refetch()
    if (storeId) void balances.refetch()
  }
  function openReview() {
    if (!canReview || busy.current || complete.current) return
    if (attempt.current) {
      reviewModal.present()
      return
    }
    const current = draftRef.current
    const balance = rows.find(
      (row) => row.balanceSourceId === current.balanceId,
    )
    if (!balance || !profile?.businessId || !profile.id || !storeId) return
    const ready = stockDraftReadiness(current, balance, people)
    if (ready.error || !ready.quantity) {
      setError(ready.error)
      return
    }
    const snapshot: StockReview = {
      balance: { ...balance },
      draft: { ...current, reason: current.reason.trim() },
      quantity: ready.quantity,
      recipientName:
        current.targetCustodyType === "store"
          ? "Central store"
          : (people.find(
              (person) => person.id === current.targetCustodyReferenceId,
            )?.name ?? "Team member"),
      businessId: profile.businessId,
      userId: profile.id,
      storeId,
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
  function canSend(snapshot: StockReview) {
    return (
      mounted.current &&
      !useOperationalModeStore.getState().isOfflineMode &&
      scope.current.canManage &&
      snapshot.businessId === scope.current.businessId &&
      snapshot.userId === scope.current.userId &&
      snapshot.storeId === scope.current.storeId
    )
  }
  async function confirm() {
    const snapshot = reviewRef.current
    if (!snapshot || busy.current || complete.current) return
    if (!canSend(snapshot)) {
      setError(
        "Return online to the original account, business and Store with inventory management permission.",
      )
      return
    }
    if (!attempt.current)
      attempt.current = {
        review: snapshot,
        command: stockCommand(snapshot, `stock-${Crypto.randomUUID()}`),
        finalId: `count-final-${Crypto.randomUUID()}`,
      }
    const current = attempt.current
    busy.current = true
    setPhase("posting")
    setError(null)
    try {
      if (current.command.kind === "count") {
        if (!current.countId)
          current.countId = (
            await createCount.mutateAsync(current.command.input)
          ).id
        if (!canSend(snapshot))
          throw new Error(
            "The Count draft was saved but not finalized. Return to the original account, business and Store, then retry the same review.",
          )
        setPhase("finalizing")
        await finalizeCount.mutateAsync({
          clientOperationId: current.finalId,
          schemaVersion: 1,
          stockCountId: current.countId,
          reason: snapshot.draft.reason,
        })
      } else if (current.command.kind === "custody")
        await move.mutateAsync(current.command.input)
      else await post.mutateAsync(current.command.input)
      complete.current = true
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
            "Stock operation recorded. Some lists could not refresh; reload them when connected.",
          )
      }
      if (canSend(snapshot)) onComplete?.()
    } catch (failure) {
      if (!mounted.current || complete.current) return
      setPhase("retry")
      setError(
        failure instanceof Error
          ? failure.message
          : "The operation was not confirmed. Retry only this retained request.",
      )
    } finally {
      busy.current = false
    }
  }
  function fill(context: Parameters<typeof createInventoryFixture>[0]) {
    if (locked || busy.current) return
    if (!selected) {
      setError("Select an eligible stock balance before filling this draft.")
      return
    }
    fillSnapshot.current = {
      quantity: draftRef.current.quantity,
      reason: draftRef.current.reason,
    }
    const fixture = createInventoryFixture(context)
    edit({ quantity: fixture.quantity, reason: fixture.reason })
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
    rows: visibleRows,
    totalRows: rows.length,
    hasBalanceData: Boolean(balances.data),
    selected,
    query,
    setQuery,
    people,
    visiblePeople: filteredPeople.slice(
      activePersonPage * 12,
      (activePersonPage + 1) * 12,
    ),
    personQuery,
    setPersonQuery: (value: string) => {
      setPersonQuery(value)
      setPersonPage(0)
    },
    personPage: activePersonPage,
    personPageCount: pageCount,
    setPersonPage,
    peopleLoading: assignees.isPending,
    peopleError: assignees.error?.message,
    retryPeople: () => {
      if (!offline && canManage && !scopeChanged) void assignees.refetch()
    },
    canManage,
    offline,
    scopeChanged,
    loading,
    loadError,
    missingStore: !loading && !storeId,
    storeName: selected?.storeName ?? rows[0]?.storeName ?? "Current Store",
    locked,
    pending,
    phase,
    error,
    notice,
    readiness,
    canReview,
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
    hasAttempt: Boolean(attempt.current),
    hasCountDraft: Boolean(attempt.current?.countId),
  }
}

export type StockIntakeModel = ReturnType<typeof useStockIntake>
