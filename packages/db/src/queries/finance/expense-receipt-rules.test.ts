import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import {
  FINANCE_EXPENSE_RECEIPT_CLEANUP_GRACE_MS,
  FINANCE_EXPENSE_RECEIPT_DOWNLOAD_MS,
  FINANCE_EXPENSE_RECEIPT_INTENT_MS,
  FINANCE_EXPENSE_RECEIPT_MAX_BYTES,
  type FinanceExpenseReceiptDownloadGrant,
  type FinanceExpenseReceiptIntent,
  type FinanceExpenseReceiptStored,
  assertFinanceExpenseReceiptAttachment,
  assertFinanceExpenseReceiptAuthority,
  assertFinanceExpenseReceiptDownload,
  assertFinanceExpenseReceiptSafetyCoverage,
  assertFinanceExpenseReceiptStored,
  financeExpenseReceiptCleanupEligible,
  financeExpenseReceiptFileName,
  financeExpenseReceiptIntentHash,
  financeExpenseReceiptStoragePath,
  verifyFinanceExpenseReceiptBytes,
} from "./expense-receipt-rules"
import { FinanceError } from "./rules"

const createdAt = new Date("2026-10-02T10:00:00Z")
const now = new Date("2026-10-02T10:05:00Z")
const bytes = new TextEncoder().encode(
  "%PDF-1.7\nsynthetic receipt, not a valid scanned document",
)
const contentDigest = createHash("sha256").update(bytes).digest("hex")
const scope = {
  tenantId: "tenant",
  bookId: "book",
  billId: "expense",
  actorUserId: "owner",
}

type Authority = Parameters<typeof assertFinanceExpenseReceiptAuthority>[0]
function authority(): Authority & {
  tenant: NonNullable<Authority["tenant"]>
  membership: NonNullable<Authority["membership"]>
  book: NonNullable<Authority["book"]>
  expense: NonNullable<Authority["expense"]>
} {
  return {
    scope: { ...scope },
    tenant: { id: "tenant", isActive: true, qaPurgeStartedAt: null },
    membership: {
      tenantId: "tenant",
      userId: "owner",
      status: "ACTIVE",
      role: "OWNER",
    },
    book: { id: "book", tenantId: "tenant" },
    expense: { id: "expense", bookId: "book", kind: "EXPENSE", voidedAt: null },
    action: "CREATE_INTENT",
  }
}

function intent(
  overrides: Partial<FinanceExpenseReceiptIntent> = {},
): FinanceExpenseReceiptIntent {
  return {
    ...scope,
    assetId: "receipt",
    clientCommandId: "receipt-command",
    originalFileName: "supplier receipt.pdf",
    contentDigest,
    contentType: "application/pdf",
    sizeBytes: bytes.byteLength,
    createdAt: new Date(createdAt),
    expiresAt: new Date(
      createdAt.getTime() + FINANCE_EXPENSE_RECEIPT_INTENT_MS,
    ),
    uploadLeaseUntil: null,
    attachedAt: null,
    retentionHold: false,
    ...overrides,
  }
}

function stored(
  overrides: Partial<FinanceExpenseReceiptStored> = {},
): FinanceExpenseReceiptStored {
  const result: FinanceExpenseReceiptStored = {
    ...scope,
    assetId: "receipt",
    contentDigest,
    contentType: "application/pdf",
    sizeBytes: bytes.byteLength,
    storageProvider: "vercel_blob_private",
    storagePath: "",
    verifiedAt: new Date(now),
    ...overrides,
  }
  result.storagePath =
    overrides.storagePath ?? financeExpenseReceiptStoragePath(result)
  return result
}

function refused(run: () => unknown, code: FinanceError["code"]) {
  try {
    run()
    throw new Error("Expected refusal")
  } catch (error) {
    expect(error).toBeInstanceOf(FinanceError)
    expect((error as FinanceError).code).toBe(code)
  }
}

function download(): Parameters<typeof assertFinanceExpenseReceiptDownload>[0] {
  const grant: FinanceExpenseReceiptDownloadGrant = {
    ...scope,
    assetId: "receipt",
    contentDigest,
    issuedAt: new Date(now),
    expiresAt: new Date(now.getTime() + FINANCE_EXPENSE_RECEIPT_DOWNLOAD_MS),
  }
  return {
    scope: { ...scope },
    intent: intent({ attachedAt: new Date(now) }),
    stored: stored(),
    grant,
    safetyState: "SAFE",
    bytesDeletedAt: null,
    now: new Date(now),
  }
}

function safety() {
  return {
    byteSize: bytes.byteLength,
    contentDigest,
    mimeType: "application/pdf",
    provider: "qa_fixture",
    modelVersion: "synthetic-1",
    source: "qa_fixture",
    coverage: {
      kind: "document",
      pagesDetected: 2,
      pagesTextInspected: 2,
      pagesVisualInspected: 2,
    },
  }
}

describe("expense receipt current authority", () => {
  test("active Owners and Admins can manage their actual expense", () => {
    for (const role of ["OWNER", "ADMIN"] as const) {
      const input = authority()
      input.membership = { ...input.membership, role }
      expect(() => assertFinanceExpenseReceiptAuthority(input)).not.toThrow()
    }
  })

  test("missing, inactive, purging or foreign Tenant refuses before document lookup", () => {
    const original = authority().tenant
    for (const tenant of [
      null,
      { ...original, isActive: false },
      { ...original, qaPurgeStartedAt: now },
      { ...original, id: "foreign" },
    ]) {
      refused(
        () =>
          assertFinanceExpenseReceiptAuthority({
            ...authority(),
            tenant,
            book: null,
            expense: null,
          }),
        "FORBIDDEN",
      )
    }
  })

  test("missing, revoked, foreign and wrong-actor memberships refuse", () => {
    const original = authority().membership
    for (const membership of [
      null,
      { ...original, status: "SUSPENDED" as const },
      { ...original, tenantId: "foreign" },
      { ...original, userId: "another-owner" },
    ]) {
      refused(
        () =>
          assertFinanceExpenseReceiptAuthority({ ...authority(), membership }),
        "FORBIDDEN",
      )
    }
  })

  test("Manager and operational-role storage access cannot grant financial authority", () => {
    for (const role of [
      "MANAGER",
      "CASHIER",
      "OPERATOR",
      "SUPPORT",
      "MEMBER",
    ] as const) {
      refused(
        () =>
          assertFinanceExpenseReceiptAuthority({
            ...authority(),
            membership: { ...authority().membership, role },
          }),
        "FORBIDDEN",
      )
    }
  })

  test("missing and cross-Tenant Book refuses", () => {
    for (const book of [
      null,
      { id: "book", tenantId: "foreign" },
      { id: "foreign", tenantId: "tenant" },
    ]) {
      refused(
        () => assertFinanceExpenseReceiptAuthority({ ...authority(), book }),
        "NOT_FOUND",
      )
    }
  })

  test("missing, cross-book and purchase sources are not expenses", () => {
    const original = authority().expense
    for (const expense of [
      null,
      { ...original, id: "another-expense" },
      { ...original, bookId: "other-book" },
      { ...original, kind: "PURCHASE" as const },
      { ...original, kind: "PURCHASE_ACCRUAL" as const },
    ]) {
      refused(
        () => assertFinanceExpenseReceiptAuthority({ ...authority(), expense }),
        "NOT_FOUND",
      )
    }
  })

  test("cancellation blocks new evidence but preserves authorized historical reads", () => {
    const input = {
      ...authority(),
      expense: { ...authority().expense, voidedAt: now },
    }
    for (const action of ["CREATE_INTENT", "ATTACH"] as const) {
      refused(
        () => assertFinanceExpenseReceiptAuthority({ ...input, action }),
        "CONFLICT",
      )
    }
    expect(() =>
      assertFinanceExpenseReceiptAuthority({ ...input, action: "READ" }),
    ).not.toThrow()
  })
})

describe("expense receipt immutable upload contract", () => {
  test("quarantine path binds Tenant, Book, Expense, server asset and original digest", () => {
    expect(financeExpenseReceiptStoragePath(stored())).toBe(
      `finance/expense-receipts/quarantine/tenant/book/expense/receipt/${contentDigest}.pdf`,
    )
    expect(financeExpenseReceiptStoragePath(stored())).not.toContain(
      intent().originalFileName,
    )
    for (const field of ["tenantId", "bookId", "billId", "assetId"] as const) {
      refused(
        () =>
          financeExpenseReceiptStoragePath({
            ...stored(),
            [field]: "../foreign",
          }),
        "INVALID_JOURNAL",
      )
    }
  })

  test("filenames retain display provenance but reject traversal, controls and bidi", () => {
    expect(financeExpenseReceiptFileName("  receipt October.pdf  ")).toBe(
      "receipt October.pdf",
    )
    for (const name of [
      "",
      " ",
      ".",
      "..",
      "../receipt.pdf",
      "C:\\receipt.pdf",
      "receipt.pdf\r\nX-Test: yes",
      "receipt.pdf\n",
      "receipt\u0000.pdf",
      "receipt\u202e.pdf",
      "x".repeat(161),
    ]) {
      refused(() => financeExpenseReceiptFileName(name), "INVALID_JOURNAL")
    }
  })

  test("stable normalized payload replay; changed actor/source/content/name conflicts", () => {
    const original = intent()
    const hash = financeExpenseReceiptIntentHash(original)
    expect(
      financeExpenseReceiptIntentHash({
        ...original,
        originalFileName: " supplier receipt.pdf ",
      }),
    ).toBe(hash)
    expect(
      financeExpenseReceiptIntentHash({
        ...original,
        clientCommandId: "different-command",
      }),
    ).toBe(hash)
    for (const patch of [
      { actorUserId: "admin" },
      { tenantId: "other" },
      { bookId: "other" },
      { billId: "other" },
      { contentDigest: "f".repeat(64) },
      { contentType: "image/png" as const },
      { sizeBytes: original.sizeBytes + 1 },
      { originalFileName: "other.pdf" },
    ]) {
      expect(
        financeExpenseReceiptIntentHash({ ...original, ...patch }),
      ).not.toBe(hash)
    }
  })

  test("zero, fractional, unsafe and oversized byte declarations refuse", () => {
    for (const sizeBytes of [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.MAX_SAFE_INTEGER + 1,
      FINANCE_EXPENSE_RECEIPT_MAX_BYTES + 1,
    ]) {
      refused(
        () => financeExpenseReceiptIntentHash({ ...intent(), sizeBytes }),
        "INVALID_JOURNAL",
      )
    }
    expect(() =>
      financeExpenseReceiptIntentHash(
        intent({ sizeBytes: FINANCE_EXPENSE_RECEIPT_MAX_BYTES }),
      ),
    ).not.toThrow()
  })

  test("blank and overlong command identities cannot create intents", () => {
    for (const clientCommandId of [" ".repeat(8), "x".repeat(129)]) {
      refused(
        () => financeExpenseReceiptIntentHash({ ...intent(), clientCommandId }),
        "INVALID_JOURNAL",
      )
    }
  })

  test("original digest, exact length and detected MIME must all agree", () => {
    expect(() =>
      verifyFinanceExpenseReceiptBytes({ ...intent(), bytes }),
    ).not.toThrow()
    for (const input of [
      { ...intent(), bytes: bytes.slice(0, -1) },
      { ...intent(), bytes, contentDigest: "f".repeat(64) },
      { ...intent(), bytes, contentType: "image/png" as const },
    ]) {
      refused(() => verifyFinanceExpenseReceiptBytes(input), "CONFLICT")
    }
  })

  test("HTML masquerading as a PDF fails even with its exact digest", () => {
    const html = new TextEncoder().encode("<script>alert('receipt')</script>")
    refused(
      () =>
        verifyFinanceExpenseReceiptBytes({
          ...intent(),
          bytes: html,
          sizeBytes: html.length,
          contentDigest: createHash("sha256").update(html).digest("hex"),
        }),
      "CONFLICT",
    )
  })

  test("same original stored descriptor replays, foreign tuples fail", () => {
    expect(() =>
      assertFinanceExpenseReceiptStored(intent(), stored()),
    ).not.toThrow()
    for (const field of ["tenantId", "bookId", "billId", "assetId"] as const) {
      refused(
        () =>
          assertFinanceExpenseReceiptStored(
            intent(),
            stored({ [field]: "other" }),
          ),
        "NOT_FOUND",
      )
    }
  })

  test("provider path, content and verification date cannot be substituted", () => {
    for (const patch of [
      { storagePath: "https://public.example/receipt.pdf" },
      { storagePath: "catalog/quarantine/tenant/store/asset.pdf" },
      { contentDigest: "f".repeat(64) },
      { contentType: "image/png" as const },
      { sizeBytes: bytes.length + 1 },
      { verifiedAt: new Date(createdAt.getTime() - 1) },
    ]) {
      refused(
        () => assertFinanceExpenseReceiptStored(intent(), stored(patch)),
        "CONFLICT",
      )
    }
  })
})

describe("expense receipt verified attachment and safety evidence", () => {
  test("only unexpired actor-owned verified SAFE originals may attach", () => {
    const input = {
      scope,
      intent: intent(),
      stored: stored(),
      safetyState: "SAFE",
      now,
    }
    expect(() => assertFinanceExpenseReceiptAttachment(input)).not.toThrow()
    for (const patch of [
      { safetyState: "STORED" },
      { safetyState: "PENDING_REVIEW" },
      { safetyState: "REJECTED" },
      { intent: intent({ actorUserId: "other" }) },
      { intent: intent({ expiresAt: now }) },
      { intent: intent({ attachedAt: now }) },
      { stored: stored({ verifiedAt: new Date(now.getTime() + 1) }) },
    ]) {
      refused(
        () => assertFinanceExpenseReceiptAttachment({ ...input, ...patch }),
        "CONFLICT",
      )
    }
  })

  test("attaching to another financial source never moves original provenance", () => {
    refused(
      () =>
        assertFinanceExpenseReceiptAttachment({
          scope: { ...scope, billId: "replacement-expense" },
          intent: intent(),
          stored: stored(),
          safetyState: "SAFE",
          now,
        }),
      "NOT_FOUND",
    )
  })

  test("complete synthetic document coverage is only evidence shape validation", () => {
    expect(
      assertFinanceExpenseReceiptSafetyCoverage(stored(), safety()).source,
    ).toBe("qa_fixture")
  })

  test("uninspected pages, image-only previews and mismatched originals refuse", () => {
    for (const patch of [
      { contentDigest: "f".repeat(64) },
      { byteSize: bytes.length + 1 },
      { mimeType: "image/png" },
      {
        coverage: {
          kind: "document",
          pagesDetected: 2,
          pagesTextInspected: 1,
          pagesVisualInspected: 2,
        },
      },
      {
        coverage: {
          kind: "document",
          pagesDetected: 2,
          pagesTextInspected: 2,
          pagesVisualInspected: 1,
        },
      },
      { coverage: { kind: "image", framesDetected: 1, framesInspected: 1 } },
    ]) {
      refused(
        () =>
          assertFinanceExpenseReceiptSafetyCoverage(stored(), {
            ...safety(),
            ...patch,
          }),
        "CONFLICT",
      )
    }
  })

  test("image coverage must inspect every original frame", () => {
    const image = stored({ contentType: "image/heic" })
    const evidence = {
      ...safety(),
      mimeType: "image/heic",
      coverage: { kind: "image", framesDetected: 3, framesInspected: 3 },
    }
    expect(() =>
      assertFinanceExpenseReceiptSafetyCoverage(image, evidence),
    ).not.toThrow()
    refused(
      () =>
        assertFinanceExpenseReceiptSafetyCoverage(image, {
          ...evidence,
          coverage: { kind: "image", framesDetected: 3, framesInspected: 1 },
        }),
      "CONFLICT",
    )
  })

  test("missing and forged extra verdict fields cannot satisfy evidence shape", () => {
    for (const evidence of [
      undefined,
      {},
      { ...safety(), safe: true },
      { ...safety(), source: "merchant" },
    ]) {
      refused(
        () => assertFinanceExpenseReceiptSafetyCoverage(stored(), evidence),
        "CONFLICT",
      )
    }
  })
})

describe("expense receipt download and retained evidence", () => {
  test("current merchant can view attached original after upload intent expires", () => {
    const input = download()
    input.intent.expiresAt = new Date(createdAt)
    input.scope.actorUserId = "current-admin"
    input.grant.actorUserId = "current-admin"
    expect(() => assertFinanceExpenseReceiptDownload(input)).not.toThrow()
  })

  test("expired, future-issued and overlong grants refuse at the exact boundary", () => {
    const input = download()
    for (const grant of [
      { ...input.grant, expiresAt: now },
      { ...input.grant, issuedAt: new Date(now.getTime() + 1) },
      {
        ...input.grant,
        expiresAt: new Date(
          now.getTime() + FINANCE_EXPENSE_RECEIPT_DOWNLOAD_MS + 1,
        ),
      },
      { ...input.grant, issuedAt: new Date("invalid") },
    ]) {
      refused(
        () => assertFinanceExpenseReceiptDownload({ ...input, grant }),
        Number.isNaN(grant.issuedAt.getTime())
          ? "INVALID_JOURNAL"
          : "FORBIDDEN",
      )
    }
  })

  test("cross-Tenant, Book, Expense and asset grants refuse", () => {
    const input = download()
    for (const field of ["tenantId", "bookId", "billId", "assetId"] as const) {
      refused(
        () =>
          assertFinanceExpenseReceiptDownload({
            ...input,
            grant: { ...input.grant, [field]: "foreign" },
          }),
        "NOT_FOUND",
      )
    }
  })

  test("another actor, digest, unsafe, unassociated or deleted asset refuses", () => {
    const input = download()
    for (const patch of [
      { grant: { ...input.grant, actorUserId: "other" } },
      { grant: { ...input.grant, contentDigest: "f".repeat(64) } },
      { safetyState: "QUARANTINED" },
      { intent: intent() },
      { bytesDeletedAt: now },
    ]) {
      refused(
        () => assertFinanceExpenseReceiptDownload({ ...input, ...patch }),
        "FORBIDDEN",
      )
    }
  })

  test("revocation after grant issue still fails current repository authority", () => {
    expect(() => assertFinanceExpenseReceiptDownload(download())).not.toThrow()
    refused(
      () =>
        assertFinanceExpenseReceiptAuthority({
          ...authority(),
          membership: null,
          action: "READ",
        }),
      "FORBIDDEN",
    )
  })

  test("historical attachment cannot predate verified original upload", () => {
    const input = download()
    input.intent.attachedAt = new Date(createdAt)
    refused(() => assertFinanceExpenseReceiptDownload(input), "FORBIDDEN")
  })

  test("orphan cleanup waits for exact intent expiry plus in-flight grace", () => {
    const asset = intent()
    const eligibleAt =
      asset.expiresAt.getTime() + FINANCE_EXPENSE_RECEIPT_CLEANUP_GRACE_MS
    expect(
      financeExpenseReceiptCleanupEligible(asset, new Date(eligibleAt - 1)),
    ).toBe(false)
    expect(
      financeExpenseReceiptCleanupEligible(asset, new Date(eligibleAt)),
    ).toBe(true)
  })

  test("renewed upload leases defer orphan cleanup", () => {
    const asset = intent({
      uploadLeaseUntil: new Date(
        createdAt.getTime() + 2 * FINANCE_EXPENSE_RECEIPT_INTENT_MS,
      ),
    })
    expect(
      financeExpenseReceiptCleanupEligible(
        asset,
        new Date(
          asset.expiresAt.getTime() + FINANCE_EXPENSE_RECEIPT_CLEANUP_GRACE_MS,
        ),
      ),
    ).toBe(false)
    expect(
      financeExpenseReceiptCleanupEligible(
        asset,
        new Date(
          (asset.uploadLeaseUntil ?? createdAt).getTime() +
            FINANCE_EXPENSE_RECEIPT_CLEANUP_GRACE_MS,
        ),
      ),
    ).toBe(true)
  })

  test("ever-attached and held evidence never enters orphan deletion", () => {
    const later = new Date("2036-10-02T10:00:00Z")
    expect(
      financeExpenseReceiptCleanupEligible(intent({ attachedAt: now }), later),
    ).toBe(false)
    expect(
      financeExpenseReceiptCleanupEligible(
        intent({ retentionHold: true }),
        later,
      ),
    ).toBe(false)
  })
})
