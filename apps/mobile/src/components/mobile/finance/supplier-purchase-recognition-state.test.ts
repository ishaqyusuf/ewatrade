import { describe, expect, it } from "bun:test"
import { financePurchaseRegistrationSchema } from "../../../../../api/src/schemas/finance-purchases"
import {
  authorizePurchaseRestartRetry,
  availablePurchaseRecognitionStages,
  beginPurchasePreparation,
  buildPurchaseRegistrationLine,
  canConfirmRetainedPurchaseCommand,
  canReversePurchaseRecognitionEvent,
  matchPurchaseBalance,
  matchesPurchaseRestartRetryAuthorization,
  purchaseRecognitionPagesAreComplete,
  purchaseRecognitionPagesMatchScope,
  snapshotPurchaseRestartRetryIdentity,
} from "./supplier-purchase-recognition-state"

describe("supplier purchase recognition state", () => {
  it("authorizes restart re-entry only for the exact retained purchase identity and scope", () => {
    const scope = {
      actorUserId: "owner",
      tenantId: "business",
      bookId: "book",
    }
    const retained = {
      command: {
        ...scope,
        version: 1 as const,
        operation: "recognizePurchase",
        clientCommandId: "purchase-command",
        payloadDigest: "a".repeat(64),
        salt: "private-salt",
        createdAt: "2026-10-02T00:00:00.000Z",
      },
    }
    const authorization = authorizePurchaseRestartRetry({
      status: "NOT_FOUND",
      retained,
      scope,
      contextKey: "supplier/source",
      operation: "recognizePurchase",
    })
    expect(authorization).not.toBeNull()
    const liveIdentity = snapshotPurchaseRestartRetryIdentity(
      retained,
      "supplier/source",
    )
    expect(
      matchesPurchaseRestartRetryAuthorization({
        authorization,
        retained,
        scope,
        contextKey: "supplier/source",
        operation: "recognizePurchase",
      }),
    ).toBe(true)
    expect(
      authorizePurchaseRestartRetry({
        status: "COMMITTED",
        retained,
        scope,
        contextKey: "supplier/source",
        operation: "recognizePurchase",
      }),
    ).toBeNull()
    expect(
      authorizePurchaseRestartRetry({
        status: "NOT_FOUND",
        retained: { ...retained, rejectedCode: "CONFLICT" },
        scope,
        contextKey: "supplier/source",
        operation: "recognizePurchase",
      }),
    ).toBeNull()
    for (const mismatched of [
      {
        retained,
        scope: { ...scope, bookId: "other-book" },
        contextKey: "supplier/source",
      },
      { retained, scope, contextKey: "supplier/other-source" },
      {
        retained: {
          command: { ...retained.command, operation: "registerPurchase" },
        },
        scope,
        contextKey: "supplier/source",
      },
    ])
      expect(
        matchesPurchaseRestartRetryAuthorization({
          authorization,
          retained: mismatched.retained,
          scope: mismatched.scope,
          contextKey: mismatched.contextKey,
          operation: "recognizePurchase",
        }),
      ).toBe(false)
    expect(
      matchesPurchaseRestartRetryAuthorization({
        authorization,
        retained: {
          command: { ...retained.command, clientCommandId: "another-id" },
        },
        scope,
        contextKey: "supplier/source",
        operation: "recognizePurchase",
      }),
    ).toBe(false)
    expect(
      canConfirmRetainedPurchaseCommand({
        authorization,
        retained,
        scope,
        contextKey: "supplier/source",
        operation: "recognizePurchase",
        hasLiveExactPayload: false,
        liveIdentity: null,
        pending: false,
      }),
    ).toBe(true)
    expect(
      canConfirmRetainedPurchaseCommand({
        authorization: null,
        retained,
        scope,
        contextKey: "supplier/source",
        operation: "recognizePurchase",
        hasLiveExactPayload: true,
        liveIdentity,
        pending: false,
      }),
    ).toBe(true)
    expect(
      canConfirmRetainedPurchaseCommand({
        authorization: null,
        retained,
        scope,
        contextKey: "supplier/source",
        operation: "recognizePurchase",
        hasLiveExactPayload: true,
        liveIdentity,
        pending: true,
      }),
    ).toBe(false)
    expect(
      canConfirmRetainedPurchaseCommand({
        authorization: null,
        retained,
        scope,
        contextKey: "supplier/other-source",
        operation: "recognizePurchase",
        hasLiveExactPayload: true,
        liveIdentity,
        pending: false,
      }),
    ).toBe(false)
    expect(
      canConfirmRetainedPurchaseCommand({
        authorization: null,
        retained,
        scope,
        contextKey: "supplier/source",
        operation: "reversePurchaseRecognition",
        hasLiveExactPayload: true,
        liveIdentity,
        pending: false,
      }),
    ).toBe(false)
    expect(
      canConfirmRetainedPurchaseCommand({
        authorization,
        retained,
        scope,
        contextKey: "supplier/source",
        operation: "recognizePurchase",
        hasLiveExactPayload: true,
        liveIdentity,
        pending: true,
      }),
    ).toBe(false)
    let writes = 0
    if (
      canConfirmRetainedPurchaseCommand({
        authorization,
        retained: {
          command: { ...retained.command, payloadDigest: "c".repeat(64) },
        },
        scope,
        contextKey: "supplier/source",
        operation: "recognizePurchase",
        hasLiveExactPayload: false,
        liveIdentity: null,
        pending: false,
      })
    )
      writes += 1
    expect(writes).toBe(0)
    expect(
      matchesPurchaseRestartRetryAuthorization({
        authorization,
        retained: {
          command: { ...retained.command, payloadDigest: "b".repeat(64) },
        },
        scope,
        contextKey: "supplier/source",
        operation: "recognizePurchase",
      }),
    ).toBe(false)
  })

  it("keeps edit, Back, and duplicate confirmation locked through deferred preparation and recovery", async () => {
    const latch = { current: false }
    const release = beginPurchasePreparation(latch)
    expect(typeof release).toBe("function")
    expect(beginPurchasePreparation(latch)).toBeNull()

    let resolveRead: (() => void) | undefined
    const deferredRead = new Promise<void>((resolve) => {
      resolveRead = resolve
    })
    const preparation = (async () => {
      try {
        await deferredRead
      } finally {
        release?.()
      }
    })()

    const editOrBackAllowed = !latch.current
    expect(editOrBackAllowed).toBe(false)
    expect(latch.current).toBe(true)

    resolveRead?.()
    await preparation
    expect(latch.current).toBe(false)
    const releaseRetry = beginPurchasePreparation(latch)
    expect(typeof releaseRetry).toBe("function")
    let resolveStatus: (() => void) | undefined
    const deferredStatus = new Promise<void>((resolve) => {
      resolveStatus = resolve
    })
    const recovery = (async () => {
      try {
        await deferredStatus
      } finally {
        releaseRetry?.()
      }
    })()
    expect(beginPurchasePreparation(latch)).toBeNull()
    expect(latch.current).toBe(true)
    resolveStatus?.()
    await recovery
    expect(latch.current).toBe(false)
  })

  it("accepts only server pages whose records match the current book and supplier", () => {
    const page = {
      bookId: "book",
      supplierId: "supplier",
      currencyCode: "NGN",
      nextCursor: "source",
      items: [
        {
          id: "source",
          bookId: "book",
          supplierId: "supplier",
          storeId: "store",
          agreedAt: "2026-10-02T00:00:00.000Z",
          description: "Farm eggs",
          amountMinor: "4800000",
        },
      ],
    }
    expect(
      purchaseRecognitionPagesMatchScope([page], {
        bookId: "book",
        supplierId: "supplier",
        currencyCode: "NGN",
      }),
    ).toBe(true)
    expect(
      purchaseRecognitionPagesMatchScope([page], {
        bookId: "other-book",
        supplierId: "supplier",
        currencyCode: "NGN",
      }),
    ).toBe(false)
    expect(
      purchaseRecognitionPagesMatchScope(
        [
          {
            ...page,
            items: [{ ...page.items[0], supplierId: "other-supplier" }],
          },
        ],
        { bookId: "book", supplierId: "supplier", currencyCode: "NGN" },
      ),
    ).toBe(false)
    expect(
      purchaseRecognitionPagesMatchScope([], {
        bookId: "book",
        supplierId: "supplier",
        currencyCode: "NGN",
      }),
    ).toBe(false)
  })

  it("rejects duplicate records and invalid keyset page chains", () => {
    const first = {
      bookId: "book",
      supplierId: "supplier",
      currencyCode: "NGN",
      nextCursor: "source-1",
      items: [
        {
          id: "source-1",
          bookId: "book",
          supplierId: "supplier",
          storeId: "store",
          agreedAt: "2026-10-02T00:00:00.000Z",
          description: "Farm eggs",
          amountMinor: "4800000",
        },
      ],
    }
    const second = {
      ...first,
      nextCursor: null,
      items: [{ ...first.items[0], id: "source-2" }],
    }
    expect(purchaseRecognitionPagesAreComplete([first], [undefined])).toBe(true)
    expect(
      purchaseRecognitionPagesAreComplete(
        [first, { ...second, items: first.items }],
        [undefined, "source-1"],
      ),
    ).toBe(false)
    expect(
      purchaseRecognitionPagesAreComplete(
        [first, second],
        [undefined, "stale"],
      ),
    ).toBe(false)
  })

  it("offers each original fact once and freezes corrected documents", () => {
    expect(availablePurchaseRecognitionStages([], false)).toEqual([
      "INVOICE",
      "OWNERSHIP",
      "RECEIPT",
    ])
    expect(
      availablePurchaseRecognitionStages(
        [
          {
            id: "invoice",
            stage: "INVOICE",
            reversalOfId: null,
            reversalId: null,
          },
          {
            id: "ownership",
            stage: "OWNERSHIP",
            reversalOfId: null,
            reversalId: null,
          },
        ],
        false,
      ),
    ).toEqual(["RECEIPT"])
    expect(
      availablePurchaseRecognitionStages(
        [
          {
            id: "receipt",
            stage: "RECEIPT",
            reversalOfId: null,
            reversalId: null,
          },
        ],
        true,
      ),
    ).toEqual([])
    expect(
      availablePurchaseRecognitionStages(
        [
          {
            id: "receipt",
            stage: "RECEIPT",
            sequence: "1",
            reversalOfId: null,
            reversalId: null,
          },
        ],
        false,
      ),
    ).toEqual(["INVOICE"])
  })

  it("permits correction only for an unreversed original fact", () => {
    expect(
      canReversePurchaseRecognitionEvent(
        {
          id: "invoice",
          stage: "INVOICE",
          sequence: "1",
          reversalOfId: null,
          reversalId: null,
        },
        [],
      ),
    ).toBe(true)
    expect(
      canReversePurchaseRecognitionEvent(
        {
          id: "invoice",
          stage: "INVOICE",
          sequence: "1",
          reversalOfId: null,
          reversalId: "correction",
        },
        [],
      ),
    ).toBe(false)
    expect(
      canReversePurchaseRecognitionEvent(
        {
          id: "invoice",
          stage: "INVOICE",
          sequence: "1",
          reversalOfId: null,
          reversalId: null,
        },
        [
          {
            id: "invoice",
            stage: "INVOICE",
            sequence: "1",
            reversalOfId: null,
            reversalId: null,
          },
          {
            id: "ownership",
            stage: "OWNERSHIP",
            sequence: "2",
            reversalOfId: null,
            reversalId: null,
          },
        ],
      ),
    ).toBe(false)
  })

  it("reopens the original invoice for correction after ownership is reversed", () => {
    const invoice = {
      id: "invoice",
      stage: "INVOICE" as const,
      sequence: "1",
      reversalOfId: null,
      reversalId: null,
    }
    const ownership = {
      id: "ownership",
      stage: "OWNERSHIP" as const,
      sequence: "2",
      reversalOfId: null,
      reversalId: "ownership-reversal",
    }
    const ownershipReversal = {
      id: "ownership-reversal",
      stage: "OWNERSHIP" as const,
      sequence: "3",
      reversalOfId: "ownership",
      reversalId: null,
    }
    const history = [invoice, ownership, ownershipReversal]
    expect(canReversePurchaseRecognitionEvent(ownership, history)).toBe(false)
    expect(canReversePurchaseRecognitionEvent(invoice, history)).toBe(true)
    expect(
      canReversePurchaseRecognitionEvent(
        {
          id: "receipt",
          stage: "RECEIPT",
          sequence: "4",
          reversalOfId: null,
          reversalId: null,
        },
        history,
      ),
    ).toBe(false)
  })

  it("matches the exact Store, source, unit and configuration version", () => {
    const row = {
      balanceSourceId: "balance",
      storeId: "store",
      inventoryUnitId: "unit",
      configurationVersionId: "version",
      revision: 9,
    }
    expect(
      matchPurchaseBalance({
        rows: [row],
        balanceSourceId: "balance",
        storeId: "store",
        inventoryUnitId: "unit",
        configurationVersionId: "version",
      }),
    ).toEqual(row)
    expect(
      matchPurchaseBalance({
        rows: [row],
        balanceSourceId: "balance",
        storeId: "other-store",
        inventoryUnitId: "unit",
        configurationVersionId: "version",
      }),
    ).toBeUndefined()
  })

  it("builds only fields accepted by the strict registration contract", () => {
    const line = buildPurchaseRegistrationLine({
      balance: {
        balanceSourceId: "balance",
        configurationVersionId: "version",
        inventoryUnitId: "unit",
        inventoryUnitTransactionScale: 3,
      },
      description: "Farm eggs",
      enteredQuantity: "12.000",
      amount: "48.00",
      categories: [{ name: "Poultry" }],
      categoryInput: "",
    })
    const registration = {
      bookId: "book",
      clientCommandId: "purchase-command",
      supplierId: "supplier",
      storeId: "store",
      description: "Farm purchase",
      agreedAt: new Date("2026-10-02T00:00:00.000Z"),
      lines: [line],
    }
    expect(financePurchaseRegistrationSchema.parse(registration).lines).toEqual(
      [line],
    )
    expect(line).not.toHaveProperty("expectedBalanceRevision")
    expect(() =>
      financePurchaseRegistrationSchema.parse({
        ...registration,
        lines: [{ ...line, expectedBalanceRevision: 3 }],
      }),
    ).toThrow()
  })
})
