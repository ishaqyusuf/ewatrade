import { useModal } from "@/components/ui/modal"
import { useAuthContext } from "@/hooks/use-auth"
import { createInventoryFixture } from "@/internal-tooling/fixture-recipes"
import { canManageMobileStock } from "@/lib/mobile-roles"
import {
  type ParsedStockIntakeTarget,
  resolveStockIntakeTarget,
} from "@/lib/stock-intake-target"
import { classifyStockOperationFailure } from "@/lib/stock-operation-outcome"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { collectStockCategoryDraft } from "@ewatrade/utils/inventory-categories"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { useEffect, useRef, useState } from "react"
import { Keyboard } from "react-native"
import {
  INITIAL_STOCK_DRAFT,
  type StockAttempt,
  type StockDraft,
  type StockIntakeProps,
  type StockOutcome,
  type StockReview,
  stockCommand,
  stockCustodyLabel,
  stockDraftReadiness,
  stockResultEffectiveAt,
  stockResultOperationId,
} from "./stock-intake-model"

const GENERIC_TARGET: ParsedStockIntakeTarget = { kind: "generic" }

export function useStockIntake({
  onComplete,
  target = GENERIC_TARGET,
}: StockIntakeProps) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { profile } = useAuthContext()
  const canManage = canManageMobileStock(
    profile?.role,
    profile?.staffAccessMode,
  )
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
  const [outcome, setOutcome] = useState<StockOutcome | null>(null)
  const [refreshThrew, setRefreshThrew] = useState(false)
  const [reviewStale, setReviewStale] = useState(false)
  const reviewStaleRef = useRef(false)
  // After a stock conflict: review waits for a read newer than this time.
  const [conflictReadBaseline, setConflictReadBaseline] = useState<
    number | null
  >(null)
  const attempt = useRef<StockAttempt | null>(null)
  const busy = useRef(false)
  const complete = useRef(false)
  const mounted = useRef(true)
  const fillSnapshot = useRef<Pick<
    StockDraft,
    "quantity" | "reason" | "categories" | "categoryInput"
  > | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const reviewModal = useModal()
  const origin = useRef<{ businessId: string; userId: string } | null>(null)
  if (!origin.current && profile?.businessId && profile.id)
    origin.current = { businessId: profile.businessId, userId: profile.id }
  const availability = useQuery(
    trpc.tenant.featureAvailability.queryOptions(undefined, {
      enabled: canManage && !offline,
      // Always read on mount; the global staleTime must not reuse a Store.
      refetchOnMount: "always",
      retry: false,
    }),
  )
  // The current Store is authoritative only once read during this mount; a
  // cached value (fresh by staleTime or not) may name a Store the user left.
  const availabilityFresh =
    availability.isFetchedAfterMount && !availability.isError
  const storeId = availabilityFresh ? availability.data?.storeId : undefined
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
        refetchOnMount: "always",
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
  // Only rows read during this screen's lifetime count; an older cached report
  // (even one still fresh by staleTime) never drives selection.
  const freshRead = balances.isFetchedAfterMount && !balances.isError
  const resolution = resolveStockIntakeTarget({
    parsed: target,
    rows: balances.data?.rows ?? [],
    storeId,
    enabled:
      canManage &&
      !offline &&
      !scopeChanged &&
      !availability.isError &&
      !balances.isError,
    loading: !freshRead,
    selectedBalanceSourceId: draft.balanceId || undefined,
  })
  const rows = resolution.rows
  const people = canManage && !scopeChanged ? (assignees.data ?? []) : []
  // Search narrows what is displayed only; it never changes the selection.
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
  const selected = resolution.selected ?? undefined
  const loading =
    canManage &&
    !offline &&
    (!availabilityFresh || (Boolean(storeId) && !freshRead))
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
  const conflictReadPending =
    conflictReadBaseline !== null &&
    !(
      balances.dataUpdatedAt > conflictReadBaseline &&
      !balances.isFetching &&
      !balances.isError
    )
  const balancesUpdatedAtRef = useRef(balances.dataUpdatedAt)
  balancesUpdatedAtRef.current = balances.dataUpdatedAt
  const canReview =
    !conflictReadPending &&
    !offline &&
    canManage &&
    !scopeChanged &&
    !pending &&
    !complete.current &&
    (Boolean(attempt.current) ||
      Boolean(
        !loading &&
          !loadError &&
          resolution.status === "selected" &&
          selected &&
          storeId &&
          (!needsPeople || (!assignees.isPending && !assignees.isError)),
      ))
  // Anything that changes which balance (or which revision of it) a review
  // describes, or whether it may be read/written at all.
  const selectionKey = JSON.stringify([
    target,
    profile?.businessId,
    profile?.id,
    storeId,
    canManage,
    scopeChanged,
    offline,
    loading,
    Boolean(loadError),
    resolution.status,
    selected?.balanceSourceId,
    selected?.revision,
    selected?.configurationVersionId,
  ])
  // Monotonic lifetime: every key change starts a new generation, so a
  // callback or review captured earlier is retired permanently, even if the
  // facts later return to the same values (revision 4 → 5 → 4).
  const lastSelectionKey = useRef(selectionKey)
  const generation = useRef(0)
  if (lastSelectionKey.current !== selectionKey) {
    lastSelectionKey.current = selectionKey
    generation.current += 1
  }
  const renderGeneration = generation.current
  const reviewGeneration = useRef<number | null>(null)
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
  useEffect(() => {
    // A retained attempt keeps its exact identity for reconciliation.
    if (
      !reviewRef.current ||
      attempt.current ||
      busy.current ||
      reviewGeneration.current === renderGeneration
    )
      return
    retireReview()
    setError("The stock balance changed. Review the operation again.")
  }, [renderGeneration])

  function edit(patch: Partial<StockDraft>) {
    if (
      renderGeneration !== generation.current ||
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
    // A callback captured in an earlier generation never opens a review.
    if (renderGeneration !== generation.current) return
    const current = draftRef.current
    // The derived exact source is authoritative; a single eligible catalog
    // balance is selected without a hidden draft write.
    const balance = resolution.status === "selected" ? selected : undefined
    if (!balance || !profile?.businessId || !profile.id || !storeId) return
    const ready = stockDraftReadiness(current, balance, people)
    if (ready.error || !ready.quantity) {
      setError(ready.error)
      return
    }
    const snapshot: StockReview = {
      balance: { ...balance },
      draft: {
        ...current,
        balanceId: balance.balanceSourceId,
        reason: current.reason.trim(),
        categories:
          current.mode === "receipt" || current.mode === "adjustment"
            ? collectStockCategoryDraft(
                current.categories,
                current.categoryInput,
              )
            : [...current.categories],
        categoryInput: "",
      },
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
    reviewGeneration.current = renderGeneration
    setReview(snapshot)
    setError(null)
    Keyboard.dismiss()
  }
  function retireReview() {
    reviewRef.current = null
    reviewGeneration.current = null
    setReview(null)
    reviewModal.dismiss()
  }
  function dismissReview() {
    if (!busy.current) reviewModal.dismiss()
  }
  function afterDismiss() {
    if (!attempt.current) {
      reviewRef.current = null
      reviewGeneration.current = null
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
    // A refused review (stock conflict) never posts again; refresh first.
    if (reviewStaleRef.current) return
    // An outgoing Confirm from an earlier generation never confirms a newer
    // review. A retained attempt is exempt: it retries the same request.
    if (!attempt.current && renderGeneration !== generation.current) return
    // Before an attempt exists, only a review from the current generation may
    // post. A retained attempt keeps its stable identity for reconciliation.
    if (!attempt.current && reviewGeneration.current !== generation.current) {
      retireReview()
      setError("The stock balance changed. Review the operation again.")
      return
    }
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
      let result: unknown
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
        result = await finalizeCount.mutateAsync({
          clientOperationId: current.finalId,
          schemaVersion: 1,
          stockCountId: current.countId,
          reason: snapshot.draft.reason,
        })
      } else if (current.command.kind === "custody")
        result = await move.mutateAsync(current.command.input)
      else result = await post.mutateAsync(current.command.input)
      complete.current = true
      // Settle privately whatever scope is active now; only the original,
      // still-entitled scope is ever shown it (see visibleOutcome).
      if (mounted.current) {
        setPhase("complete")
        setOutcome({
          kind: "recorded",
          effectiveAt: stockResultEffectiveAt(result),
          operationId: stockResultOperationId(result),
          readBaseline: balancesUpdatedAtRef.current,
          review: snapshot,
        })
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
            trpc.inventory.categorySuggestions.queryFilter(),
          ),
          queryClient.invalidateQueries(
            trpc.catalog.listItemsPage.pathFilter(),
          ),
          queryClient.invalidateQueries(
            trpc.tenant.featureAvailability.queryFilter(),
          ),
        ])
      } catch {
        // Committed: a refresh failure never downgrades the outcome.
        if (mounted.current) setRefreshThrew(true)
      }
      if (canSend(snapshot)) onComplete?.()
    } catch (failure) {
      if (!mounted.current || complete.current) return
      const kind = classifyStockOperationFailure(failure, {
        previousOutcomeUnknown: current.uncertain,
      })
      if (kind === "unknown") {
        // Keep the exact attempt (and Count draft) for Check status.
        current.uncertain = true
        setPhase("retry")
        setOutcome({ kind: "unknown", review: snapshot })
        reviewModal.dismiss()
      } else if (kind === "refresh_required" && !current.countId) {
        // The server refused before saving; a fresh review mints a new attempt.
        attempt.current = null
        setPhase("editing")
        reviewStaleRef.current = true
        setReviewStale(true)
      } else {
        // A saved Count draft keeps its identity: retry finalizes that draft.
        const canEdit = !current.countId
        setPhase(canEdit ? "editing" : "retry")
        setOutcome({
          kind: "not_recorded",
          review: snapshot,
          canEdit,
          message:
            failure instanceof Error && failure.message
              ? failure.message
              : "The server refused this stock operation.",
        })
        if (canEdit) {
          // Retire the refused review too: no retained Confirm can mint a new
          // operation. Edit keeps the draft; a fresh Review is required.
          attempt.current = null
          retireReview()
        } else reviewModal.dismiss()
      }
    } finally {
      busy.current = false
    }
  }
  /** Not recorded → back to the retained draft (the only way back to it). */
  function editAfterFailure() {
    if (busy.current || attempt.current || outcome?.kind !== "not_recorded")
      return
    retireReview()
    setOutcome(null)
    setError(null)
  }
  /** Stock conflict → drop the stale review and read the balance again. */
  function refreshReview() {
    if (busy.current || attempt.current) return
    reviewStaleRef.current = false
    setReviewStale(false)
    retireReview()
    setError(null)
    // Review stays withheld until this requested read succeeds; cached or
    // failed reads never reopen the refused facts.
    setConflictReadBaseline(balancesUpdatedAtRef.current)
    if (!offline && canManage && !scopeChanged && storeId)
      void balances.refetch()
  }
  // Prior outcomes belong to the scope and access that produced them; the
  // attempt and saved state stay private (offline alone still shows them).
  const visibleOutcome = scopeChanged || !canManage ? null : outcome
  const refreshFailed =
    visibleOutcome?.kind === "recorded" && (refreshThrew || balances.isError)
  // Exact identity from a read completed after the command resolved (a zero
  // difference Count keeps its revision, so revision alone can't prove it).
  const recordedBalance =
    visibleOutcome?.kind === "recorded" &&
    !refreshFailed &&
    !balances.isFetching &&
    balances.dataUpdatedAt > visibleOutcome.readBaseline
      ? balances.data?.rows.find(
          (row) =>
            row.balanceSourceId ===
            visibleOutcome.review.balance.balanceSourceId,
        )
      : undefined
  function fill(context: Parameters<typeof createInventoryFixture>[0]) {
    if (locked || busy.current) return
    if (!selected) {
      setError("Select an eligible stock balance before filling this draft.")
      return
    }
    fillSnapshot.current = {
      quantity: draftRef.current.quantity,
      reason: draftRef.current.reason,
      categories: [...draftRef.current.categories],
      categoryInput: draftRef.current.categoryInput,
    }
    const fixture = createInventoryFixture(context)
    edit({
      quantity: fixture.quantity,
      reason: fixture.reason,
      categories: [{ name: fixture.reason }],
      categoryInput: "",
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
    target,
    resolution: resolution.status,
    allStoreName: balances.data?.rows.find((row) => row.storeId === storeId)
      ?.storeName,
    draft,
    edit,
    rows: visibleRows,
    totalRows: rows.length,
    hasBalanceData: Boolean(balances.data),
    balancesUpdatedAt: balances.dataUpdatedAt,
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
    outcome: visibleOutcome,
    recordedBalance,
    refreshFailed,
    reviewStale,
    editAfterFailure,
    refreshReview,
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
