import { describe, expect, it } from "bun:test"
import {
  assertSupplierHistoryRequestAllowed,
  calculateAdvanceAvailability,
  claimSupplierHistoryCursor,
  preparePurchasePayment,
  preparePurchasePaymentReversal,
  prepareSupplierAdvanceAllocation,
  prepareSupplierAllocationRelease,
  resolveSupplierPurchaseView,
  runSupplierFreshRead,
  settlementDateAtOrAfter,
  supplierPurchasePageReadLimit,
  validateEmptySupplierPurchaseSentinel,
  validateSupplierPurchaseHistoryPage,
  validateSupplierStatementPage,
} from "./supplier-purchase-settlement-state"

describe("native supplier purchase settlement preparation", () => {
  it("derives exact available advances after allocations and releases", () => {
    expect(
      calculateAdvanceAvailability(
        [
          {
            id: "advance-1",
            amountMinor: "999999999999999",
            kind: "ADVANCE",
            effectiveAt: "2026-10-01T10:00:00.000Z",
          },
        ],
        [
          {
            advanceEntryId: "advance-1",
            amountMinor: "500000000000000",
            effectiveAt: "2026-10-02T10:00:00.000Z",
            releases: [
              {
                amountMinor: "100000000000000",
                effectiveAt: "2026-10-03T10:00:00.000Z",
              },
            ],
          },
        ],
      ),
    ).toEqual([
      {
        id: "advance-1",
        amountMinor: "999999999999999",
        kind: "ADVANCE",
        effectiveAt: "2026-10-01T10:00:00.000Z",
        allocatedMinor: "500000000000000",
        releasedMinor: "100000000000000",
        availableMinor: "599999999999999",
        latestSettlementAt: new Date("2026-10-03T10:00:00.000Z"),
      },
    ])
  })

  it("rejects incomplete or contradictory allocation history", () => {
    expect(() =>
      calculateAdvanceAvailability(
        [
          {
            id: "advance-1",
            amountMinor: "100",
            kind: "ADVANCE",
            effectiveAt: "2026-10-01",
          },
        ],
        [
          {
            advanceEntryId: "missing",
            amountMinor: "1",
            effectiveAt: "2026-10-02",
            releases: [],
          },
        ],
      ),
    ).toThrow("unavailable supplier advance")
    expect(() =>
      calculateAdvanceAvailability(
        [
          {
            id: "advance-1",
            amountMinor: "100",
            kind: "ADVANCE",
            effectiveAt: "2026-10-01",
          },
        ],
        [
          {
            advanceEntryId: "advance-1",
            amountMinor: "10",
            effectiveAt: "2026-10-02",
            releases: [{ amountMinor: "11", effectiveAt: "2026-10-03" }],
          },
        ],
      ),
    ).toThrow("releases more than the source allocation")
  })

  it("validates reversed advances while keeping them unavailable for selection", () => {
    const availability = calculateAdvanceAvailability(
      [
        {
          id: "reversed-advance",
          amountMinor: "1000",
          kind: "ADVANCE",
          effectiveAt: "2026-10-01T10:00:00.000Z",
          reversed: true,
        },
        {
          id: "current-advance",
          amountMinor: "500",
          kind: "ADVANCE",
          effectiveAt: "2026-10-04T10:00:00.000Z",
        },
      ],
      [
        {
          advanceEntryId: "reversed-advance",
          amountMinor: "1000",
          effectiveAt: "2026-10-02T10:00:00.000Z",
          releases: [
            {
              amountMinor: "1000",
              effectiveAt: "2026-10-03T10:00:00.000Z",
            },
          ],
        },
      ],
    )
    expect(availability.map((source) => source.availableMinor)).toEqual([
      "0",
      "500",
    ])
    expect(availability[0]?.reversed).toBe(true)
    expect(() =>
      calculateAdvanceAvailability(
        [
          {
            id: "reversed-advance",
            amountMinor: "1000",
            kind: "ADVANCE",
            effectiveAt: "2026-10-01T10:00:00.000Z",
            reversed: true,
          },
        ],
        [
          {
            advanceEntryId: "reversed-advance",
            amountMinor: "1000",
            effectiveAt: "2026-10-02T10:00:00.000Z",
            releases: [],
          },
        ],
      ),
    ).toThrow("still has an unreleased allocation")
    expect(() =>
      calculateAdvanceAvailability(
        [
          {
            id: "current-advance",
            amountMinor: "100",
            kind: "ADVANCE",
            effectiveAt: "2026-10-01",
          },
          {
            id: "current-advance",
            amountMinor: "100",
            kind: "ADVANCE",
            effectiveAt: "2026-10-01",
          },
        ],
        [],
      ),
    ).toThrow("duplicate advance source")
  })

  it("bounds supplier purchase pages, counts, cursors, and duplicate bill sources", () => {
    const ids = new Set<string>()
    expect(
      validateSupplierPurchaseHistoryPage({
        page: { count: 1, items: [{ id: "bill-1" }], nextCursor: null },
        accumulatedRows: 0,
        maxRows: 100,
        pageSize: 50,
        seenIds: ids,
      }),
    ).toBeNull()
    expect(() =>
      validateSupplierPurchaseHistoryPage({
        page: { count: 1, items: [{ id: "bill-1" }], nextCursor: null },
        accumulatedRows: 0,
        maxRows: 100,
        pageSize: 50,
        seenIds: ids,
      }),
    ).toThrow("duplicate or invalid bill source")
    expect(() =>
      validateSupplierPurchaseHistoryPage({
        page: { count: 101, items: [], nextCursor: null },
        accumulatedRows: 0,
        maxRows: 100,
        pageSize: 50,
        seenIds: new Set(),
      }),
    ).toThrow("malformed or changing bill count")
    expect(() =>
      validateSupplierPurchaseHistoryPage({
        page: { count: 2, items: [{ id: "bill-2" }], nextCursor: null },
        accumulatedRows: 0,
        maxRows: 100,
        pageSize: 50,
        seenIds: new Set(),
      }),
    ).toThrow("contradict their advertised count")
    expect(() =>
      assertSupplierHistoryRequestAllowed({
        requests: 6,
        maxRequests: 6,
        accumulatedRows: 20,
        maxRows: 100,
      }),
    ).toThrow("safe mobile read limit")
    const cursors = new Set<string>()
    claimSupplierHistoryCursor(cursors, "cursor-1")
    expect(() => claimSupplierHistoryCursor(cursors, "cursor-1")).toThrow(
      "repeated",
    )
  })

  it("accepts capped continuation pages only while their advertised count remains exact", () => {
    const seenIds = new Set<string>()
    const firstCursor = validateSupplierPurchaseHistoryPage({
      page: {
        count: 3,
        items: [{ id: "bill-1" }, { id: "bill-2" }],
        nextCursor: "cursor-1",
      },
      accumulatedRows: 0,
      totalRows: 0,
      maxRows: 100,
      pageSize: 2,
      seenIds,
    })
    expect(firstCursor).toBe("cursor-1")
    expect(
      validateSupplierPurchaseHistoryPage({
        page: { count: 3, items: [{ id: "bill-3" }], nextCursor: null },
        expectedCount: 3,
        accumulatedRows: 2,
        totalRows: 2,
        maxRows: 100,
        pageSize: 1,
        seenIds,
      }),
    ).toBeNull()
  })

  it("checks remaining status partitions with empty sentinels at exactly 100 bills", () => {
    const seenIds = new Set<string>()
    let rows = 0
    let advertisedRows = 0
    let requests = 0
    for (const status of ["UNPAID", "PARTIAL"] as const) {
      const pageLimit = supplierPurchasePageReadLimit({
        accumulatedRows: rows,
        advertisedRows,
        maxRows: 100,
        pageSize: 50,
      })
      expect(pageLimit).toEqual({ limit: 50, emptySentinel: false })
      const items = Array.from({ length: 50 }, (_, index) => ({
        id: `${status}-${index}`,
      }))
      validateSupplierPurchaseHistoryPage({
        page: { count: 50, items, nextCursor: null },
        accumulatedRows: 0,
        totalRows: rows,
        maxRows: 100,
        pageSize: pageLimit.limit,
        seenIds,
      })
      rows += items.length
      advertisedRows += 50
      requests += 1
    }
    expect(rows).toBe(100)
    for (const _status of ["PAID", "VOID"] as const) {
      const pageLimit = supplierPurchasePageReadLimit({
        accumulatedRows: rows,
        advertisedRows,
        maxRows: 100,
        pageSize: 50,
      })
      expect(pageLimit).toEqual({ limit: 1, emptySentinel: true })
      assertSupplierHistoryRequestAllowed({
        requests,
        maxRequests: 6,
        accumulatedRows: rows,
        maxRows: 100,
        allowEmptySentinel: pageLimit.emptySentinel,
      })
      validateEmptySupplierPurchaseSentinel({
        count: 0,
        items: [],
        nextCursor: null,
      })
      requests += 1
    }
    expect(requests).toBe(4)
    expect(
      supplierPurchasePageReadLimit({
        accumulatedRows: 50,
        advertisedRows: 100,
        maxRows: 100,
        pageSize: 50,
      }),
    ).toEqual({ limit: 1, emptySentinel: true })
    expect(() =>
      validateEmptySupplierPurchaseSentinel({
        count: 1,
        items: [{ id: "bill-over-limit" }],
        nextCursor: null,
      }),
    ).toThrow("safe mobile read limit")
  })

  it("enforces statement row and cursor limits as each page is adopted", () => {
    const ids = new Set<string>()
    validateSupplierStatementPage({
      items: [{ id: "entry-1" }],
      nextCursor: null,
      accumulatedRows: 999,
      maxRows: 1000,
      pageSize: 50,
      seenIds: ids,
    })
    expect(() =>
      validateSupplierStatementPage({
        items: [{ id: "entry-2" }, { id: "entry-3" }],
        nextCursor: null,
        accumulatedRows: 999,
        maxRows: 1000,
        pageSize: 50,
        seenIds: ids,
      }),
    ).toThrow("safe source limit")
    expect(() =>
      validateSupplierStatementPage({
        items: [{ id: "entry-4" }],
        nextCursor: "cursor-2",
        accumulatedRows: 0,
        maxRows: 1000,
        pageSize: 50,
        seenIds: new Set(),
      }),
    ).toThrow("safe source limit")
  })

  it("does not accept a deferred pre-offline response in a new online generation", async () => {
    function deferred<T>() {
      let resolve!: (value: T) => void
      const promise = new Promise<T>((done) => {
        resolve = done
      })
      return { promise, resolve }
    }
    let online = true
    let generation = 0
    let queryState: {
      status: "pending" | "success"
      fetchStatus: "idle" | "fetching"
    } = { status: "pending", fetchStatus: "idle" }
    const priorResponse = deferred<string>()
    const freshResponse = deferred<string>()
    const priorRead = runSupplierFreshRead({
      isCurrent: () => online && generation === 0,
      cancelPrior: async () => {
        queryState = { status: "pending", fetchStatus: "idle" }
      },
      getState: () => queryState,
      fetch: () => {
        queryState = { status: "pending", fetchStatus: "fetching" }
        return priorResponse.promise
      },
    })
    await Promise.resolve()
    expect(queryState.fetchStatus).toBe("fetching")

    online = false
    generation += 1
    online = true
    const freshRead = runSupplierFreshRead({
      isCurrent: () => online && generation === 1,
      cancelPrior: async () => {
        queryState = { status: "pending", fetchStatus: "idle" }
      },
      getState: () => queryState,
      fetch: () => {
        queryState = { status: "pending", fetchStatus: "fetching" }
        return freshResponse.promise
      },
    })
    await Promise.resolve()
    expect(queryState.fetchStatus).toBe("fetching")
    priorResponse.resolve("old response")
    await expect(priorRead).rejects.toThrow("account or network changed")
    freshResponse.resolve("fresh response")
    queryState = { status: "success", fetchStatus: "idle" }
    await expect(freshRead).resolves.toBe("fresh response")
  })

  it("keeps a verified settlement form and completes review during a deferred same-key bill refresh", async () => {
    const originalBill = {
      id: "bill-1",
      bookId: "book-1",
      supplierId: "supplier-1",
      outstandingMinor: "5000",
    }
    const updatedBill = { ...originalBill, outstandingMinor: "4000" }
    const viewInput = {
      bookId: "book-1",
      billId: "bill-1",
      supplierId: "supplier-1",
      verified: true,
      success: true,
      paused: false,
      offline: false,
      error: false,
      settlementOpen: true,
    }
    let query = { data: originalBill, fetching: false }
    const initialView = resolveSupplierPurchaseView({
      ...viewInput,
      ...query,
    })
    expect(initialView.detail).toBe(originalBill)
    expect(initialView.settlement).toBe(originalBill)

    const review = preparePurchasePayment({
      bookId: "book-1",
      billId: "bill-1",
      amount: "10.00",
      outstandingMinor: originalBill.outstandingMinor,
      moneyAccountId: "cash-1",
      description: "Part payment",
      reference: "part-payment",
      date: "2026-10-02",
      minimumAt: "2026-10-01T00:00:00.000Z",
      today: "2026-10-02",
    })
    const childState = { review, draftAmount: "10.00" }
    let resolveRefresh!: (bill: typeof updatedBill) => void
    const deferredRefresh = new Promise<typeof updatedBill>((resolve) => {
      resolveRefresh = resolve
    })
    query = { data: originalBill, fetching: true }
    const duringRefresh = resolveSupplierPurchaseView({
      ...viewInput,
      ...query,
    })
    expect(duringRefresh.detail).toBeUndefined()
    expect(duringRefresh.settlement).toBe(originalBill)
    expect(childState.review).toBe(review)
    expect(childState.draftAmount).toBe("10.00")

    resolveRefresh(updatedBill)
    query = { data: await deferredRefresh, fetching: false }
    const afterRefresh = resolveSupplierPurchaseView({
      ...viewInput,
      ...query,
    })
    expect(afterRefresh.detail).toBe(updatedBill)
    expect(afterRefresh.settlement).toBe(updatedBill)
    expect(childState.review).toBe(review)
    let recordedPayload: typeof review | null = null
    const recordReviewedPayload = async (payload: typeof review) => {
      recordedPayload = payload
      return true
    }
    let accepted = false
    if (afterRefresh.settlement && childState.review)
      accepted = await recordReviewedPayload(childState.review)
    expect(accepted).toBe(true)
    expect(recordedPayload).toBe(review)

    for (const blocked of [
      { ...viewInput, offline: true },
      { ...viewInput, paused: true },
      { ...viewInput, error: true },
      { ...viewInput, success: false },
      { ...viewInput, verified: false },
      { ...viewInput, billId: "other-bill" },
      { ...viewInput, bookId: "other-book" },
      { ...viewInput, supplierId: "other-supplier" },
    ]) {
      const blockedView = resolveSupplierPurchaseView({
        ...blocked,
        ...query,
      })
      expect(blockedView.detail).toBeUndefined()
      expect(blockedView.settlement).toBeUndefined()
    }
  })

  it("keeps settlement dates within the source chronology and UTC today", () => {
    expect(
      settlementDateAtOrAfter(
        "2026-10-02",
        "2026-10-02T13:14:15.000Z",
        "2026-10-02",
      ),
    ).toEqual(new Date("2026-10-02T13:14:15.000Z"))
    expect(() =>
      settlementDateAtOrAfter(
        "2026-10-03",
        "2026-10-02T00:00:00.000Z",
        "2026-10-02",
      ),
    ).toThrow("future")
  })

  it("prepares bounded payment, reversal, allocation, and release payloads", () => {
    const payment = preparePurchasePayment({
      bookId: "book-1",
      billId: "bill-1",
      amount: "12.34",
      outstandingMinor: "2000",
      moneyAccountId: "cash-1",
      description: "  Part payment  ",
      reference: "  ref-1  ",
      date: "2026-10-02",
      minimumAt: "2026-10-01T14:20:00.000Z",
      today: "2026-10-02",
    })
    expect(payment).toEqual({
      bookId: "book-1",
      billId: "bill-1",
      amountMinor: "1234",
      moneyAccountId: "cash-1",
      description: "Part payment",
      reference: "ref-1",
      effectiveAt: new Date("2026-10-02T00:00:00.000Z"),
    })
    expect(
      preparePurchasePaymentReversal({
        bookId: "book-1",
        paymentId: "payment-1",
        reason: "  Duplicate  ",
        date: "2026-10-02",
        paymentAt: "2026-10-02T10:00:00.000Z",
        latestBillEntryAt: "2026-10-01T10:00:00.000Z",
        today: "2026-10-02",
      }).effectiveAt,
    ).toEqual(new Date("2026-10-02T10:00:00.000Z"))
    expect(
      prepareSupplierAdvanceAllocation({
        bookId: "book-1",
        billId: "bill-1",
        advanceEntryId: "advance-1",
        amount: "8.00",
        availableMinor: "1000",
        outstandingMinor: "900",
        description: "Apply advance",
        date: "2026-10-02",
        latestBillEntryAt: "2026-10-01T10:00:00.000Z",
        advanceEffectiveAt: "2026-10-01T12:00:00.000Z",
        latestAdvanceSettlementAt: "2026-10-01T15:00:00.000Z",
        today: "2026-10-02",
      }).amountMinor,
    ).toBe("800")
    expect(
      prepareSupplierAllocationRelease({
        bookId: "book-1",
        allocationId: "allocation-1",
        amount: "2.50",
        unreleasedMinor: "300",
        reason: "Return to advance",
        date: "2026-10-02",
        allocationAt: "2026-10-01T10:00:00.000Z",
        latestBillEntryAt: "2026-10-01T11:00:00.000Z",
        latestAdvanceSettlementAt: "2026-10-01T12:00:00.000Z",
        today: "2026-10-02",
      }).amountMinor,
    ).toBe("250")
    expect(() =>
      prepareSupplierAllocationRelease({
        bookId: "book-1",
        allocationId: "allocation-1",
        amount: "3.01",
        unreleasedMinor: "300",
        reason: "Too much",
        date: "2026-10-02",
        allocationAt: "2026-10-01T10:00:00.000Z",
        latestBillEntryAt: "2026-10-01T11:00:00.000Z",
        latestAdvanceSettlementAt: null,
        today: "2026-10-02",
      }),
    ).toThrow("exceeds")
  })
})
