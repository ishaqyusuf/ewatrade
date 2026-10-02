import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { MoneyField } from "@/components/mobile/money-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { getSession } from "@/lib/session-store"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type {
  RouterInputs,
  RouterOutputs,
} from "@ewatrade/api/trpc/routers/_app"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { View } from "react-native"
import { FinanceCommandFeedback } from "./finance-command-feedback"
import type { FinanceWorkspace } from "./finance-workspace-gate"
import {
  beginSupplierCommandPreparation,
  createSupplierCommandAuthority,
  invalidateSupplierCommandAuthority,
  isSupplierCommandPreparationCurrent,
  reconcileSupplierCommandScope,
} from "./supplier-command-authority"
import {
  type AdvanceAllocationHistory,
  type AdvanceAvailability,
  assertSupplierHistoryRequestAllowed,
  calculateAdvanceAvailability,
  claimSupplierHistoryCursor,
  preparePurchasePayment,
  preparePurchasePaymentReversal,
  prepareSupplierAdvanceAllocation,
  prepareSupplierAllocationRelease,
  runSupplierFreshRead,
  supplierPurchasePageReadLimit,
  validateEmptySupplierPurchaseSentinel,
  validateSupplierPurchaseHistoryPage,
  validateSupplierStatementPage,
} from "./supplier-purchase-settlement-state"
import { useMobileFinanceCommand } from "./use-mobile-finance-command"

type Supplier = { id: string; code: string; name: string }
export type PurchaseSettlementMode =
  | "pay"
  | "reverse-payment"
  | "allocate"
  | "release"
type PurchaseDetail = RouterOutputs["finance"]["purchase"]
type Payment = PurchaseDetail["payments"][number]
type Allocation = PurchaseDetail["allocations"][number]
type AdvanceSelection = {
  id: string
  kind: string
  amountMinor: string
  description: string
  effectiveAt: Date | string
  reversal: { id: string } | null
}
type PaymentPayload = ReturnType<typeof preparePurchasePayment>
type PaymentReversalPayload = ReturnType<typeof preparePurchasePaymentReversal>
type AllocationPayload = ReturnType<typeof prepareSupplierAdvanceAllocation>
type ReleasePayload = ReturnType<typeof prepareSupplierAllocationRelease>
type ReviewAuthority = { generation: number; scope: string }
type Review =
  | { mode: "pay"; payload: PaymentPayload; preparation: ReviewAuthority }
  | {
      mode: "reverse-payment"
      payload: PaymentReversalPayload
      preparation: ReviewAuthority
    }
  | {
      mode: "allocate"
      payload: AllocationPayload
      source: AdvanceAvailability
      preparation: ReviewAuthority
    }
  | {
      mode: "release"
      payload: ReleasePayload
      allocation: Allocation
      unreleasedMinor: string
      preparation: ReviewAuthority
    }

const MAX_HISTORY_BILLS = 100
const MAX_HISTORY_ENTRIES = 1000
const HISTORY_PAGE_SIZE = 50
const MAX_STATEMENT_PAGES = Math.ceil(MAX_HISTORY_ENTRIES / HISTORY_PAGE_SIZE)
const MAX_PURCHASE_HISTORY_PAGES = 6

export function SupplierPurchaseSettlementForm({
  book,
  actorUserId,
  tenantId,
  supplier,
  purchase,
  mode,
  payment,
  allocation,
  advanceToAllocate,
  onBack,
  onRecorded,
}: FinanceWorkspace & {
  supplier: Supplier
  purchase: PurchaseDetail
  mode: PurchaseSettlementMode
  payment?: Payment
  allocation?: Allocation
  advanceToAllocate?: AdvanceSelection
  onBack: () => void
  onRecorded: () => void
}) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const command = useMobileFinanceCommand({
    actorUserId,
    tenantId,
    bookId: book.id,
  })
  const scope = [
    actorUserId,
    tenantId,
    book.id,
    supplier.id,
    purchase.id,
    mode,
    payment?.id ?? allocation?.id ?? advanceToAllocate?.id ?? "source",
  ].join(":")
  const authority = useRef(createSupplierCommandAuthority(scope))
  authority.current = reconcileSupplierCommandScope(authority.current, scope)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    const unsubscribe = useOperationalModeStore.subscribe((next, previous) => {
      if (!previous.isOfflineMode && next.isOfflineMode) {
        authority.current = invalidateSupplierCommandAuthority(
          authority.current,
        )
        setPreparing(false)
        setReview(null)
        setAdvances(null)
        setAdvanceToken(null)
      }
    })
    return () => {
      mounted.current = false
      authority.current = invalidateSupplierCommandAuthority(authority.current)
      unsubscribe()
    }
  }, [])

  const [amount, setAmount] = useState("")
  const [description, setDescription] = useState("")
  const [reference, setReference] = useState("")
  const [reason, setReason] = useState("")
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [moneyAccountId, setMoneyAccountId] = useState("")
  const [advanceEntryId, setAdvanceEntryId] = useState(
    advanceToAllocate?.id ?? "",
  )
  const [advances, setAdvances] = useState<AdvanceAvailability[] | null>(null)
  const [advanceToken, setAdvanceToken] = useState<{
    generation: number
    scope: string
  } | null>(null)
  const [review, setReview] = useState<Review | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const payMutation = useMutation(trpc.finance.payPurchase.mutationOptions())
  const reversePaymentMutation = useMutation(
    trpc.finance.reversePurchasePayment.mutationOptions(),
  )
  const allocateMutation = useMutation(
    trpc.finance.allocateSupplierAdvance.mutationOptions(),
  )
  const releaseMutation = useMutation(
    trpc.finance.releaseSupplierAllocation.mutationOptions(),
  )

  function isCurrent(token?: { generation: number; scope: string }) {
    const profile = getSession()?.profile
    const currentActor =
      profile?.id === actorUserId &&
      profile.businessId === tenantId &&
      ["OWNER", "ADMIN"].includes(profile.role?.trim().toUpperCase() ?? "")
    const online = !useOperationalModeStore.getState().isOfflineMode
    return (
      mounted.current &&
      currentActor &&
      online &&
      (token
        ? isSupplierCommandPreparationCurrent(
            authority.current,
            token,
            scope,
            true,
          )
        : authority.current.scope === scope)
    )
  }

  useEffect(() => {
    if (offline) {
      if (preparing) setPreparing(false)
      setReview(null)
      setAdvances(null)
      setAdvanceToken(null)
    }
  }, [offline, preparing])

  function freshRead<T>(
    queryKey: readonly unknown[],
    preparation: { generation: number; scope: string },
    fetch: () => Promise<T>,
  ) {
    return runSupplierFreshRead({
      isCurrent: () => isCurrent(preparation),
      cancelPrior: () =>
        client.cancelQueries({ queryKey, exact: true }, { silent: true }),
      getState: () => client.getQueryState(queryKey),
      fetch,
    })
  }

  async function fetchPurchase(preparation: {
    generation: number
    scope: string
  }) {
    const input = { bookId: book.id, billId: purchase.id }
    const queryKey = trpc.finance.purchase.queryKey(input)
    const current = await freshRead(queryKey, preparation, () =>
      client.fetchQuery(
        trpc.finance.purchase.queryOptions(input, {
          staleTime: 0,
          retry: false,
        }),
      ),
    )
    if (!isCurrent(preparation))
      throw new Error(
        "The account or network changed. Review the purchase again.",
      )
    if (
      current.id !== purchase.id ||
      current.bookId !== book.id ||
      current.supplierId !== supplier.id
    )
      throw new Error(
        "This purchase no longer belongs to the selected supplier and finance book.",
      )
    return current
  }

  async function fetchAllocationHistory(preparation: {
    generation: number
    scope: string
  }): Promise<AdvanceAvailability[]> {
    const statementInput = {
      bookId: book.id,
      supplierId: supplier.id,
      limit: 50,
    }
    const statementKey = trpc.finance.supplierStatement.queryKey(statementInput)
    const firstStatement = await freshRead(statementKey, preparation, () =>
      client.fetchQuery(
        trpc.finance.supplierStatement.queryOptions(statementInput, {
          staleTime: 0,
          retry: false,
        }),
      ),
    )
    const statementCursors = new Set<string>()
    const statementIds = new Set<string>()
    validateSupplierStatementPage({
      items: firstStatement.data,
      nextCursor: firstStatement.nextCursor,
      accumulatedRows: 0,
      maxRows: MAX_HISTORY_ENTRIES,
      pageSize: HISTORY_PAGE_SIZE,
      seenIds: statementIds,
    })
    const statementEntries = [...firstStatement.data]
    const snapshotSequence = firstStatement.snapshotSequence
    let statementCursor = firstStatement.nextCursor ?? undefined
    let statementPages = 1
    while (statementCursor) {
      if (
        statementEntries.length >= MAX_HISTORY_ENTRIES ||
        statementPages >= MAX_STATEMENT_PAGES
      )
        throw new Error(
          "Supplier statement history exceeds the safe source limit for allocation.",
        )
      claimSupplierHistoryCursor(statementCursors, statementCursor)
      assertSupplierHistoryRequestAllowed({
        requests: statementPages,
        maxRequests: MAX_STATEMENT_PAGES,
        accumulatedRows: statementEntries.length,
        maxRows: MAX_HISTORY_ENTRIES,
      })
      const input = {
        bookId: book.id,
        supplierId: supplier.id,
        snapshotSequence,
        cursor: statementCursor,
        limit: Math.min(
          HISTORY_PAGE_SIZE,
          MAX_HISTORY_ENTRIES - statementEntries.length,
        ),
      }
      const queryKey = trpc.finance.supplierStatement.queryKey(input)
      const page = await freshRead(queryKey, preparation, () =>
        client.fetchQuery(
          trpc.finance.supplierStatement.queryOptions(input, {
            staleTime: 0,
            retry: false,
          }),
        ),
      )
      if (page.snapshotSequence !== snapshotSequence)
        throw new Error(
          "The supplier statement snapshot changed. Refresh before continuing.",
        )
      validateSupplierStatementPage({
        items: page.data,
        nextCursor: page.nextCursor,
        accumulatedRows: statementEntries.length,
        maxRows: MAX_HISTORY_ENTRIES,
        pageSize: input.limit,
        seenIds: statementIds,
      })
      if (page.data.length === 0)
        throw new Error("Supplier statement pagination did not advance.")
      statementEntries.push(...page.data)
      statementPages += 1
      statementCursor = page.nextCursor ?? undefined
    }

    const sources = statementEntries
      .filter(
        (entry) =>
          (entry.kind === "OPENING_ADVANCE" || entry.kind === "ADVANCE") &&
          entry.side === "DEBIT" &&
          entry.reversalOfId === null,
      )
      .map((entry) => ({
        id: entry.id,
        kind: entry.kind as "OPENING_ADVANCE" | "ADVANCE",
        amountMinor: entry.amountMinor,
        effectiveAt: entry.effectiveAt,
        reversed: entry.reversal !== null,
      }))

    const billIds: string[] = []
    const seenBillIds = new Set<string>()
    let advertisedBillCount = 0
    let purchaseRows = 0
    let purchasePageRequests = 0
    const purchaseLists: Array<{
      status: "UNPAID" | "PARTIAL" | "PAID" | "VOID"
      count: number
      cursor: string | null
      rows: number
      cursors: Set<string>
    }> = []
    for (const status of ["UNPAID", "PARTIAL", "PAID", "VOID"] as const) {
      const pageRead = supplierPurchasePageReadLimit({
        accumulatedRows: purchaseRows,
        advertisedRows: advertisedBillCount,
        maxRows: MAX_HISTORY_BILLS,
        pageSize: HISTORY_PAGE_SIZE,
      })
      assertSupplierHistoryRequestAllowed({
        requests: purchasePageRequests,
        maxRequests: MAX_PURCHASE_HISTORY_PAGES,
        accumulatedRows: purchaseRows,
        maxRows: MAX_HISTORY_BILLS,
        allowEmptySentinel: pageRead.emptySentinel,
      })
      const firstInput = {
        bookId: book.id,
        supplierId: supplier.id,
        status,
        limit: pageRead.limit,
      }
      const firstKey = trpc.finance.purchases.queryKey(firstInput)
      const firstPage = await freshRead(firstKey, preparation, () =>
        client.fetchQuery(
          trpc.finance.purchases.queryOptions(firstInput, {
            staleTime: 0,
            retry: false,
          }),
        ),
      )
      purchasePageRequests += 1
      if (pageRead.emptySentinel) {
        validateEmptySupplierPurchaseSentinel({
          count: firstPage.count,
          items: firstPage.items,
          nextCursor: firstPage.nextCursor,
        })
        continue
      }
      const page = {
        count: firstPage.count,
        items: firstPage.items,
        nextCursor: firstPage.nextCursor,
      }
      const nextAdvertisedCount = advertisedBillCount + firstPage.count
      if (nextAdvertisedCount > MAX_HISTORY_BILLS)
        throw new Error(
          "This supplier has too many purchase bills for a complete allocation history check in mobile.",
        )
      let statusRows = 0
      const cursor = validateSupplierPurchaseHistoryPage({
        page,
        accumulatedRows: statusRows,
        totalRows: purchaseRows,
        maxRows: MAX_HISTORY_BILLS,
        pageSize: pageRead.limit,
        seenIds: seenBillIds,
      })
      for (const item of page.items) billIds.push(item.id)
      statusRows += page.items.length
      purchaseRows += page.items.length
      advertisedBillCount = nextAdvertisedCount
      purchaseLists.push({
        status,
        count: firstPage.count,
        cursor,
        rows: statusRows,
        cursors: new Set(),
      })
    }

    for (const list of purchaseLists) {
      let cursor = list.cursor
      while (cursor) {
        claimSupplierHistoryCursor(list.cursors, cursor)
        assertSupplierHistoryRequestAllowed({
          requests: purchasePageRequests,
          maxRequests: MAX_PURCHASE_HISTORY_PAGES,
          accumulatedRows: purchaseRows,
          maxRows: MAX_HISTORY_BILLS,
        })
        if (list.rows >= list.count)
          throw new Error(
            "Supplier purchase history has an unexpected extra page.",
          )
        const input = {
          bookId: book.id,
          supplierId: supplier.id,
          status: list.status,
          cursor,
          limit: Math.min(
            HISTORY_PAGE_SIZE,
            MAX_HISTORY_BILLS - purchaseRows,
            list.count - list.rows,
          ),
        }
        const queryKey = trpc.finance.purchases.queryKey(input)
        const nextPage = await freshRead(queryKey, preparation, () =>
          client.fetchQuery(
            trpc.finance.purchases.queryOptions(input, {
              staleTime: 0,
              retry: false,
            }),
          ),
        )
        purchasePageRequests += 1
        cursor = validateSupplierPurchaseHistoryPage({
          page: {
            count: nextPage.count,
            items: nextPage.items,
            nextCursor: nextPage.nextCursor,
          },
          expectedCount: list.count,
          accumulatedRows: list.rows,
          totalRows: purchaseRows,
          maxRows: MAX_HISTORY_BILLS,
          pageSize: input.limit,
          seenIds: seenBillIds,
        })
        for (const item of nextPage.items) billIds.push(item.id)
        list.rows += nextPage.items.length
        purchaseRows += nextPage.items.length
      }
      if (list.rows !== list.count)
        throw new Error(
          "Supplier purchase history contains missing bill sources.",
        )
    }
    if (billIds.length !== advertisedBillCount)
      throw new Error(
        "Supplier purchase history contains duplicate or missing bill sources.",
      )

    const detailInputs = billIds.map((billId) => ({ bookId: book.id, billId }))
    const details: RouterOutputs["finance"]["purchase"][] = []
    for (let index = 0; index < detailInputs.length; index += 8) {
      const batch = detailInputs.slice(index, index + 8)
      const pages = await Promise.all(
        batch.map(async (input) => {
          const queryKey = trpc.finance.purchase.queryKey(input)
          return freshRead(queryKey, preparation, () =>
            client.fetchQuery(
              trpc.finance.purchase.queryOptions(input, {
                staleTime: 0,
                retry: false,
              }),
            ),
          )
        }),
      )
      if (!isCurrent(preparation))
        throw new Error(
          "The active finance scope changed during allocation history reads.",
        )
      details.push(...pages)
    }
    if (details.length !== billIds.length)
      throw new Error(
        "Complete purchase allocation history could not be confirmed.",
      )
    for (const detail of details) {
      if (
        detail.bookId !== book.id ||
        detail.supplierId !== supplier.id ||
        detail.currentSupplierTotals.throughJournalSequence !== snapshotSequence
      )
        throw new Error(
          "The purchase and supplier statement snapshots differ. Refresh before continuing.",
        )
      if (
        detail.allocationsHasMore ||
        detail.allocations.some((item) => item.releasesHasMore)
      )
        throw new Error(
          "Purchase allocation or release history is truncated; mobile cannot verify available advance.",
        )
    }

    const history: AdvanceAllocationHistory[] = details.flatMap((detail) =>
      detail.allocations.map((item) => ({
        advanceEntryId: item.advanceEntry.id,
        amountMinor: item.amountMinor,
        effectiveAt: item.effectiveAt,
        releases: item.releases.map((release) => ({
          amountMinor: release.amountMinor,
          effectiveAt: release.effectiveAt,
        })),
      })),
    )
    return calculateAdvanceAvailability(sources, history)
  }

  async function prepare() {
    if (preparing || !command.ready || command.pending || offline) return
    const preparation = beginSupplierCommandPreparation(authority.current, true)
    if (!preparation) return
    setPreparing(true)
    setError(null)
    try {
      const current = await fetchPurchase(preparation)
      const latestBillEntryAt = current.supplierEntries.reduce<Date | string>(
        (latest, entry) =>
          new Date(entry.effectiveAt) > new Date(latest)
            ? entry.effectiveAt
            : latest,
        current.incurredAt,
      )
      if (mode === "pay") {
        if (current.voidedAt || BigInt(current.outstandingMinor) <= 0n)
          throw new Error("This purchase has no current payable amount.")
        const bookKey = trpc.finance.book.queryKey(undefined)
        const currentBook = await freshRead(bookKey, preparation, () =>
          client.fetchQuery(
            trpc.finance.book.queryOptions(undefined, {
              staleTime: 0,
              retry: false,
            }),
          ),
        )
        if (!isCurrent(preparation))
          throw new Error(
            "The active finance scope changed. Review the payment again.",
          )
        if (currentBook?.id !== book.id)
          throw new Error("The active finance book could not be confirmed.")
        const accounts = currentBook.accounts.filter(
          (account) =>
            account.kind === "ASSET" &&
            ["CASH", "BANK", "CLEARING"].includes(account.purpose) &&
            !account.archivedAt,
        )
        const account = accounts.find(
          (candidate) => candidate.id === moneyAccountId,
        )
        if (!account)
          throw new Error(
            "Choose a currently active cash, bank, or clearing account.",
          )
        const payload = preparePurchasePayment({
          bookId: book.id,
          billId: current.id,
          amount,
          outstandingMinor: current.outstandingMinor,
          moneyAccountId: account.id,
          description,
          reference,
          date,
          minimumAt: latestBillEntryAt,
        })
        if (isCurrent(preparation))
          setReview({ mode: "pay", payload, preparation })
        return
      }

      if (mode === "reverse-payment") {
        if (!payment)
          throw new Error("Choose a payment from this purchase history.")
        const source = current.payments.find((item) => item.id === payment.id)
        if (!source || source.reversedAt)
          throw new Error(
            "This purchase payment is already reversed or unavailable.",
          )
        const payload = preparePurchasePaymentReversal({
          bookId: book.id,
          paymentId: source.id,
          reason,
          date,
          paymentAt: source.effectiveAt,
          latestBillEntryAt,
        })
        if (isCurrent(preparation))
          setReview({ mode: "reverse-payment", payload, preparation })
        return
      }

      const availability = await fetchAllocationHistory(preparation)
      if (!isCurrent(preparation)) return
      setAdvances(availability)
      setAdvanceToken(preparation)

      if (mode === "allocate") {
        if (current.voidedAt || BigInt(current.outstandingMinor) <= 0n)
          throw new Error(
            "This purchase has no current payable amount for an advance allocation.",
          )
        const selectedId = advanceEntryId || advanceToAllocate?.id
        const source = selectedId
          ? availability.find((item) => item.id === selectedId)
          : undefined
        if (selectedId && !source)
          throw new Error(
            "The selected supplier advance is no longer available.",
          )
        if (source && BigInt(source.availableMinor) <= 0n)
          throw new Error(
            "This supplier advance has no amount left to allocate.",
          )
        if (!source) return
        const payload = prepareSupplierAdvanceAllocation({
          bookId: book.id,
          billId: current.id,
          advanceEntryId: source.id,
          amount,
          availableMinor: source.availableMinor,
          outstandingMinor: current.outstandingMinor,
          description,
          date,
          latestBillEntryAt,
          advanceEffectiveAt: source.effectiveAt,
          latestAdvanceSettlementAt: source.latestSettlementAt,
        })
        if (isCurrent(preparation))
          setReview({ mode: "allocate", payload, source, preparation })
        return
      }

      if (!allocation)
        throw new Error("Choose an allocation from this purchase history.")
      const currentAllocation = current.allocations.find(
        (item) => item.id === allocation.id,
      )
      if (!currentAllocation || currentAllocation.releasesHasMore)
        throw new Error(
          "This allocation is unavailable or its release history is incomplete.",
        )
      const released = currentAllocation.releases.reduce(
        (sum, release) => sum + BigInt(release.amountMinor),
        0n,
      )
      const unreleasedMinor = (
        BigInt(currentAllocation.amountMinor) - released
      ).toString()
      if (BigInt(unreleasedMinor) <= 0n)
        throw new Error("This allocation has already been fully released.")
      const source = availability.find(
        (item) => item.id === currentAllocation.advanceEntry.id,
      )
      if (!source)
        throw new Error(
          "The original supplier advance history could not be verified.",
        )
      const payload = prepareSupplierAllocationRelease({
        bookId: book.id,
        allocationId: currentAllocation.id,
        amount,
        unreleasedMinor,
        reason,
        date,
        allocationAt: currentAllocation.effectiveAt,
        latestBillEntryAt,
        latestAdvanceSettlementAt: source.latestSettlementAt,
      })
      if (isCurrent(preparation))
        setReview({
          mode: "release",
          payload,
          allocation: currentAllocation,
          unreleasedMinor,
          preparation,
        })
    } catch (failure) {
      if (isCurrent(preparation))
        setError(
          failure instanceof Error
            ? failure.message
            : "The settlement sources could not be confirmed.",
        )
    } finally {
      if (isCurrent(preparation)) setPreparing(false)
    }
  }

  async function confirm() {
    if (!review || offline) return
    if (!isCurrent(review.preparation)) {
      setReview(null)
      return
    }
    const preparation = beginSupplierCommandPreparation(authority.current, true)
    if (!preparation) return
    let accepted = false
    if (review.mode === "pay") {
      const payload = review.payload
      accepted = await command.run(
        "payPurchase",
        payload,
        (clientCommandId) =>
          payMutation.mutateAsync({ ...payload, clientCommandId }),
        "Purchase payment recorded.",
      )
    } else if (review.mode === "reverse-payment") {
      const payload = review.payload
      accepted = await command.run(
        "reversePurchasePayment",
        payload,
        (clientCommandId) =>
          reversePaymentMutation.mutateAsync({ ...payload, clientCommandId }),
        "Purchase payment reversal recorded.",
      )
    } else if (review.mode === "allocate") {
      const payload = review.payload
      accepted = await command.run(
        "allocateSupplierAdvance",
        payload,
        (clientCommandId) =>
          allocateMutation.mutateAsync({ ...payload, clientCommandId }),
        "Supplier advance allocated to this purchase.",
      )
    } else {
      const payload = review.payload
      accepted = await command.run(
        "releaseSupplierAllocation",
        payload,
        (clientCommandId) =>
          releaseMutation.mutateAsync({ ...payload, clientCommandId }),
        "Supplier advance allocation released.",
      )
    }
    if (accepted && isCurrent(preparation)) onRecorded()
  }

  const currentReview = review && isCurrent(review.preparation) ? review : null
  const currentAdvances =
    advances && advanceToken && isCurrent(advanceToken) ? advances : undefined
  const selectedAdvance = currentAdvances?.find(
    (item) =>
      item.id === (advanceEntryId || advanceToAllocate?.id) &&
      !item.reversed &&
      BigInt(item.availableMinor) > 0n,
  )
  const disabled = !command.ready || command.pending || offline || preparing
  const title = {
    pay: "Pay purchase",
    "reverse-payment": "Reverse payment",
    allocate: "Apply supplier advance",
    release: "Release allocation",
  }[mode]
  const inputLabel =
    mode === "reverse-payment" || mode === "release" ? "Reason" : "Description"

  return (
    <View className="gap-4 rounded-2xl border border-border bg-card p-4">
      <Text className="text-xl font-bold">{title}</Text>
      <Text className="text-sm text-muted-foreground">
        {supplier.code} · {supplier.name} · purchase{" "}
        {purchase.reference ?? purchase.id}
      </Text>
      <FinanceCommandFeedback
        command={command}
        onRecorded={onRecorded}
        onRejected={() => setReview(null)}
      />
      {error ? (
        <StatusBanner
          title="Settlement needs attention"
          message={error}
          tone="destructive"
        />
      ) : null}

      {mode === "allocate" && !currentReview ? (
        <>
          {advanceToAllocate ? (
            <StatusBanner
              title="Source advance selected"
              message={`${advanceToAllocate.kind.replaceAll("_", " ")} · ${new Date(advanceToAllocate.effectiveAt).toISOString().slice(0, 10)} UTC. Current available amount and all allocation/release history are being checked.`}
              tone="primary"
            />
          ) : null}
          {currentAdvances ? (
            <View className="gap-2">
              <Text className="text-xs font-bold uppercase tracking-[1.4px]">
                Current supplier advances · complete purchase history checked
              </Text>
              {currentAdvances.length === 0 ? (
                <StatusBanner
                  message="No active supplier advances are available in this supplier book."
                  tone="muted"
                />
              ) : (
                currentAdvances.map((source) => (
                  <ActionButton
                    key={source.id}
                    variant={
                      advanceEntryId === source.id ? "secondary" : "outline"
                    }
                    disabled={
                      disabled ||
                      source.reversed === true ||
                      BigInt(source.availableMinor) <= 0n
                    }
                    onPress={() => setAdvanceEntryId(source.id)}
                  >
                    <View className="w-full gap-1">
                      <Text className="font-semibold">
                        {source.kind.replaceAll("_", " ")} ·{" "}
                        {formatFinanceMoney(
                          source.reversed ? "0" : source.availableMinor,
                          book.currencyCode,
                        )}{" "}
                        {source.reversed ? "available · reversed" : "available"}
                      </Text>
                      <Text className="text-left text-xs text-muted-foreground">
                        Source{" "}
                        {formatFinanceMoney(
                          source.amountMinor,
                          book.currencyCode,
                        )}{" "}
                        ·{" "}
                        {formatFinanceMoney(
                          source.allocatedMinor,
                          book.currencyCode,
                        )}{" "}
                        allocated ·{" "}
                        {formatFinanceMoney(
                          source.releasedMinor,
                          book.currencyCode,
                        )}{" "}
                        released ·{" "}
                        {new Date(source.effectiveAt)
                          .toISOString()
                          .slice(0, 10)}{" "}
                        UTC
                      </Text>
                    </View>
                  </ActionButton>
                ))
              )}
              {advanceEntryId && !selectedAdvance && advanceToAllocate ? (
                <StatusBanner
                  message="The selected statement advance is unavailable in the fresh current snapshot. Choose another advance."
                  tone="warning"
                />
              ) : null}
            </View>
          ) : (
            <ActionButton
              variant="outline"
              disabled={disabled}
              isLoading={preparing}
              onPress={() => void prepare()}
            >
              Check current supplier advance history
            </ActionButton>
          )}
        </>
      ) : null}

      {currentReview ? (
        <View className="gap-3 rounded-xl border border-border p-4">
          <Text className="font-semibold">Review before recording</Text>
          {currentReview.mode === "pay" ? (
            <>
              <Text>
                {formatFinanceMoney(
                  currentReview.payload.amountMinor,
                  book.currencyCode,
                )}
              </Text>
              <Text>
                {currentReview.payload.effectiveAt.toISOString().slice(0, 10)}{" "}
                UTC · {currentReview.payload.description}
              </Text>
              <Text>
                {currentReview.payload.reference
                  ? `Reference · ${currentReview.payload.reference}`
                  : "No payment reference"}
              </Text>
            </>
          ) : currentReview.mode === "reverse-payment" ? (
            <>
              <Text>
                Payment {payment?.id} ·{" "}
                {payment
                  ? formatFinanceMoney(payment.amountMinor, book.currencyCode)
                  : ""}
              </Text>
              <Text>
                {currentReview.payload.effectiveAt.toISOString().slice(0, 10)}{" "}
                UTC · {currentReview.payload.reason}
              </Text>
            </>
          ) : currentReview.mode === "allocate" ? (
            <>
              <Text>
                Source advance ·{" "}
                {currentReview.source.kind.replaceAll("_", " ")}
              </Text>
              <Text>
                {formatFinanceMoney(
                  currentReview.payload.amountMinor,
                  book.currencyCode,
                )}{" "}
                of{" "}
                {formatFinanceMoney(
                  currentReview.source.availableMinor,
                  book.currencyCode,
                )}{" "}
                currently available
              </Text>
              <Text>
                {currentReview.payload.effectiveAt.toISOString().slice(0, 10)}{" "}
                UTC · {currentReview.payload.description}
              </Text>
            </>
          ) : (
            <>
              <Text>
                Allocation ·{" "}
                {formatFinanceMoney(
                  currentReview.unreleasedMinor,
                  book.currencyCode,
                )}{" "}
                unreleased of{" "}
                {formatFinanceMoney(
                  currentReview.allocation.amountMinor,
                  book.currencyCode,
                )}
              </Text>
              <Text>
                {formatFinanceMoney(
                  currentReview.payload.amountMinor,
                  book.currencyCode,
                )}{" "}
                to release ·{" "}
                {currentReview.payload.effectiveAt.toISOString().slice(0, 10)}{" "}
                UTC
              </Text>
              <Text>{currentReview.payload.reason}</Text>
            </>
          )}
          <Text className="text-xs text-muted-foreground">
            Finance rechecks current source, supplier, payable, allocation,
            account and cutoff authority when recording.
          </Text>
          <ActionButton
            disabled={disabled}
            isLoading={command.pending}
            onPress={() => void confirm()}
          >
            Confirm and record
          </ActionButton>
          <ActionButton
            variant="outline"
            disabled={command.pending}
            onPress={() => setReview(null)}
          >
            Back to details
          </ActionButton>
        </View>
      ) : mode !== "allocate" || currentAdvances ? (
        <View className="gap-4">
          {mode === "pay" ? (
            <>
              <Text className="text-sm text-muted-foreground">
                Current purchase payable ·{" "}
                {formatFinanceMoney(
                  purchase.outstandingMinor,
                  book.currencyCode,
                )}
                . The payment is dated no earlier than the latest purchase
                supplier entry.
              </Text>
              <MoneyField
                currencyCode={book.currencyCode}
                label={`Amount (${book.currencyCode})`}
                value={amount}
                onChangeValue={setAmount}
              />
              <View className="gap-2">
                <Text className="text-xs font-bold uppercase tracking-[1.4px]">
                  Pay from · choose active account
                </Text>
                {book.accounts
                  .filter(
                    (account) =>
                      account.kind === "ASSET" &&
                      ["CASH", "BANK", "CLEARING"].includes(account.purpose) &&
                      !account.archivedAt,
                  )
                  .map((account) => (
                    <ActionButton
                      key={account.id}
                      variant={
                        moneyAccountId === account.id ? "secondary" : "outline"
                      }
                      disabled={disabled}
                      onPress={() => setMoneyAccountId(account.id)}
                    >
                      {account.name} · {account.purpose.toLowerCase()}
                    </ActionButton>
                  ))}
              </View>
              <FormField
                label="Reference (optional)"
                value={reference}
                onChangeText={setReference}
                maxLength={160}
              />
            </>
          ) : mode === "reverse-payment" ? (
            <StatusBanner
              title="Selected payment"
              message={`${payment?.account.name ?? "Payment source"} · ${payment ? formatFinanceMoney(payment.amountMinor, book.currencyCode) : ""} · ${payment ? new Date(payment.effectiveAt).toISOString().slice(0, 10) : ""} UTC. The linked original remains in history.`}
              tone="warning"
            />
          ) : mode === "release" ? (
            <StatusBanner
              title="Selected allocation"
              message={`${allocation ? formatFinanceMoney(allocation.amountMinor, book.currencyCode) : ""} allocated · only its unreleased portion can be released.`}
              tone="warning"
            />
          ) : null}
          {mode === "allocate" ? (
            <>
              {selectedAdvance ? (
                <>
                  <Text className="text-sm text-muted-foreground">
                    Selected advance ·{" "}
                    {formatFinanceMoney(
                      selectedAdvance.availableMinor,
                      book.currencyCode,
                    )}{" "}
                    available after allocations and releases across all current
                    supplier purchases.
                  </Text>
                  <MoneyField
                    currencyCode={book.currencyCode}
                    label={`Amount (${book.currencyCode})`}
                    value={amount}
                    onChangeValue={setAmount}
                  />
                </>
              ) : null}
            </>
          ) : null}
          {mode === "release" ? (
            <MoneyField
              currencyCode={book.currencyCode}
              label={`Release amount (${book.currencyCode})`}
              value={amount}
              onChangeValue={setAmount}
            />
          ) : null}
          {mode === "pay" || mode === "allocate" ? (
            <FormField
              label={inputLabel}
              value={description}
              onChangeText={setDescription}
              maxLength={400}
              multiline
            />
          ) : null}
          {mode === "reverse-payment" || mode === "release" ? (
            <FormField
              label="Reason"
              value={reason}
              onChangeText={setReason}
              maxLength={400}
              multiline
            />
          ) : null}
          <FormField
            label="Date (YYYY-MM-DD, UTC)"
            value={date}
            onChangeText={setDate}
            maxLength={10}
            autoCapitalize="none"
          />
          <Text className="text-xs text-muted-foreground">
            Dates must be on or after the original supplier source and its
            latest related settlement, and cannot be in the future.
          </Text>
          <ActionButton
            disabled={
              disabled ||
              (mode === "pay" && !moneyAccountId) ||
              (mode === "allocate" && !selectedAdvance)
            }
            isLoading={preparing}
            onPress={() => void prepare()}
          >
            Review{" "}
            {mode === "pay"
              ? "payment"
              : mode === "reverse-payment"
                ? "payment reversal"
                : mode === "allocate"
                  ? "allocation"
                  : "release"}
          </ActionButton>
        </View>
      ) : null}
    </View>
  )
}
