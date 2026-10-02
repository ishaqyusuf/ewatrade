import { createHash } from "node:crypto"
import {
  detectServiceCommerceMediaMimeType,
  privateMediaSafetyAttestationSchema,
} from "@ewatrade/service-commerce"
import type {
  FinanceBill,
  FinanceBook,
  Membership,
  Tenant,
} from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import { FinanceError, financePayloadHash } from "./rules"

export const FINANCE_EXPENSE_RECEIPT_MAX_BYTES = 10_000_000
export const FINANCE_EXPENSE_RECEIPT_INTENT_MS = 24 * 60 * 60 * 1_000
export const FINANCE_EXPENSE_RECEIPT_DOWNLOAD_MS = 60_000
export const FINANCE_EXPENSE_RECEIPT_CLEANUP_GRACE_MS = 180_000
export const FINANCE_EXPENSE_RECEIPT_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const

export type FinanceExpenseReceiptContentType =
  (typeof FINANCE_EXPENSE_RECEIPT_CONTENT_TYPES)[number]

export type FinanceExpenseReceiptScope = FinanceActor & {
  bookId: string
  billId: string
}

type ReceiptIdentity = Pick<
  FinanceExpenseReceiptScope,
  "tenantId" | "bookId" | "billId"
> & { assetId: string }

type ReceiptContent = {
  contentDigest: string
  contentType: FinanceExpenseReceiptContentType
  sizeBytes: number
}

/** Planned internal contract, not an existing Prisma model or public input. */
export type FinanceExpenseReceiptIntent = ReceiptIdentity &
  ReceiptContent & {
    actorUserId: string
    clientCommandId: string
    originalFileName: string
    createdAt: Date
    expiresAt: Date
    uploadLeaseUntil: Date | null
    attachedAt: Date | null
    retentionHold: boolean
  }

/** Only the trusted server storage reader may produce this descriptor. */
export type FinanceExpenseReceiptStored = ReceiptIdentity &
  ReceiptContent & {
    storageProvider: "vercel_blob_private"
    storagePath: string
    verifiedAt: Date
  }

export type FinanceExpenseReceiptDownloadGrant = ReceiptIdentity & {
  actorUserId: string
  contentDigest: string
  issuedAt: Date
  expiresAt: Date
}

const extensions: Record<FinanceExpenseReceiptContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
}

function invalid(message: string): never {
  throw new FinanceError("INVALID_JOURNAL", message)
}

function assertId(value: string) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value))
    invalid("Invalid expense receipt identity.")
}

function timestamp(value: Date) {
  const time = value.getTime()
  if (!Number.isFinite(time)) invalid("Invalid expense receipt date.")
  return time
}

function assertContent(content: ReceiptContent) {
  if (
    !/^[a-f0-9]{64}$/.test(content.contentDigest) ||
    !FINANCE_EXPENSE_RECEIPT_CONTENT_TYPES.includes(content.contentType) ||
    !Number.isSafeInteger(content.sizeBytes) ||
    content.sizeBytes < 1 ||
    content.sizeBytes > FINANCE_EXPENSE_RECEIPT_MAX_BYTES
  ) {
    invalid("Choose an image or PDF receipt up to 10,000,000 bytes.")
  }
}

/** Current persisted facts are required; a storage token is never authority. */
export function assertFinanceExpenseReceiptAuthority(input: {
  scope: FinanceExpenseReceiptScope
  tenant: Pick<Tenant, "id" | "isActive" | "qaPurgeStartedAt"> | null
  membership: Pick<Membership, "tenantId" | "userId" | "status" | "role"> | null
  book: Pick<FinanceBook, "id" | "tenantId"> | null
  expense: Pick<FinanceBill, "id" | "bookId" | "kind" | "voidedAt"> | null
  action: "CREATE_INTENT" | "ATTACH" | "READ"
}) {
  const { scope, tenant, membership, book, expense } = input
  for (const id of Object.values(scope)) assertId(id)
  if (
    !tenant?.isActive ||
    tenant.id !== scope.tenantId ||
    tenant.qaPurgeStartedAt !== null ||
    membership?.tenantId !== scope.tenantId ||
    membership.userId !== scope.actorUserId ||
    membership.status !== "ACTIVE" ||
    !["OWNER", "ADMIN"].includes(membership.role)
  ) {
    throw new FinanceError("FORBIDDEN", "Expense receipt access denied.")
  }
  if (
    book?.id !== scope.bookId ||
    book.tenantId !== scope.tenantId ||
    expense?.id !== scope.billId ||
    expense.bookId !== scope.bookId ||
    expense.kind !== "EXPENSE"
  ) {
    throw new FinanceError("NOT_FOUND", "Expense not found in this business.")
  }
  if (input.action !== "READ" && expense.voidedAt !== null) {
    throw new FinanceError(
      "CONFLICT",
      "Cancelled expenses retain existing receipts but cannot add receipts.",
    )
  }
}

/** Names are display metadata only; paths and download names are generated. */
export function financeExpenseReceiptFileName(value: string) {
  const name = value.trim()
  if (
    !name ||
    value.length > 160 ||
    name === "." ||
    name === ".." ||
    /[/\\\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(value)
  ) {
    invalid(
      "Enter a safe receipt file name without paths or control characters.",
    )
  }
  return name
}

export function financeExpenseReceiptStoragePath(
  receipt: ReceiptIdentity &
    Pick<ReceiptContent, "contentDigest" | "contentType">,
) {
  for (const id of [
    receipt.tenantId,
    receipt.bookId,
    receipt.billId,
    receipt.assetId,
  ])
    assertId(id)
  if (
    !/^[a-f0-9]{64}$/.test(receipt.contentDigest) ||
    !Object.hasOwn(extensions, receipt.contentType)
  )
    invalid("Invalid expense receipt content identity.")
  return `finance/expense-receipts/quarantine/${receipt.tenantId}/${receipt.bookId}/${receipt.billId}/${receipt.assetId}/${receipt.contentDigest}.${extensions[receipt.contentType]}`
}

export function financeExpenseReceiptIntentHash(
  input: FinanceExpenseReceiptScope &
    ReceiptContent & {
      clientCommandId: string
      originalFileName: string
    },
) {
  for (const id of [
    input.tenantId,
    input.bookId,
    input.billId,
    input.actorUserId,
  ])
    assertId(id)
  if (
    !input.clientCommandId.trim() ||
    input.clientCommandId.length < 8 ||
    input.clientCommandId.length > 128
  )
    invalid("Invalid expense receipt command identity.")
  assertContent(input)
  return financePayloadHash({
    tenantId: input.tenantId,
    bookId: input.bookId,
    billId: input.billId,
    actorUserId: input.actorUserId,
    contentDigest: input.contentDigest,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    originalFileName: financeExpenseReceiptFileName(input.originalFileName),
  })
}

/** Signature and SHA-256 checks preserve originals; they are not safety approval. */
export function verifyFinanceExpenseReceiptBytes(
  input: ReceiptContent & {
    bytes: Uint8Array
  },
) {
  assertContent(input)
  if (
    input.bytes.byteLength !== input.sizeBytes ||
    detectServiceCommerceMediaMimeType(input.bytes) !== input.contentType ||
    createHash("sha256").update(input.bytes).digest("hex") !==
      input.contentDigest
  ) {
    throw new FinanceError(
      "CONFLICT",
      "Receipt bytes do not match the upload intent.",
    )
  }
}

function assertIdentity(actual: ReceiptIdentity, expected: ReceiptIdentity) {
  if (
    actual.tenantId !== expected.tenantId ||
    actual.bookId !== expected.bookId ||
    actual.billId !== expected.billId ||
    actual.assetId !== expected.assetId
  )
    throw new FinanceError("NOT_FOUND", "Expense receipt not found.")
}

export function assertFinanceExpenseReceiptStored(
  intent: FinanceExpenseReceiptIntent,
  stored: FinanceExpenseReceiptStored,
) {
  assertIdentity(stored, intent)
  assertContent(intent)
  assertContent(stored)
  if (
    stored.storageProvider !== "vercel_blob_private" ||
    stored.storagePath !== financeExpenseReceiptStoragePath(stored) ||
    stored.contentDigest !== intent.contentDigest ||
    stored.contentType !== intent.contentType ||
    stored.sizeBytes !== intent.sizeBytes ||
    timestamp(stored.verifiedAt) < timestamp(intent.createdAt)
  )
    throw new FinanceError(
      "CONFLICT",
      "Verified receipt storage does not match the intent.",
    )
}

/** Necessary evidence check only; the trusted safety adapter still owns approval. */
export function assertFinanceExpenseReceiptSafetyCoverage(
  stored: FinanceExpenseReceiptStored,
  attestation: unknown,
) {
  const parsed = privateMediaSafetyAttestationSchema.safeParse(attestation)
  if (!parsed.success)
    throw new FinanceError(
      "CONFLICT",
      "Complete original receipt safety evidence is required.",
    )
  const evidence = parsed.data
  const coverage = evidence.coverage
  const complete =
    stored.contentType === "application/pdf"
      ? coverage.kind === "document" &&
        coverage.pagesDetected === coverage.pagesTextInspected &&
        coverage.pagesDetected === coverage.pagesVisualInspected
      : coverage.kind === "image" &&
        coverage.framesDetected === coverage.framesInspected
  if (
    evidence.contentDigest !== stored.contentDigest ||
    evidence.mimeType !== stored.contentType ||
    evidence.byteSize !== stored.sizeBytes ||
    !complete
  )
    throw new FinanceError(
      "CONFLICT",
      "Safety evidence does not cover the original receipt.",
    )
  return evidence
}

/** Caller must repeat current authority and hold the Book/asset locks until commit. */
export function assertFinanceExpenseReceiptAttachment(input: {
  scope: FinanceExpenseReceiptScope
  intent: FinanceExpenseReceiptIntent
  stored: FinanceExpenseReceiptStored
  safetyState: string
  now: Date
}) {
  const { scope, intent, stored } = input
  assertIdentity(intent, { ...scope, assetId: intent.assetId })
  assertFinanceExpenseReceiptStored(intent, stored)
  if (
    intent.actorUserId !== scope.actorUserId ||
    intent.attachedAt !== null ||
    timestamp(intent.expiresAt) <= timestamp(input.now) ||
    timestamp(stored.verifiedAt) > timestamp(input.now) ||
    input.safetyState !== "SAFE"
  )
    throw new FinanceError(
      "CONFLICT",
      "A current verified safe upload is required for attachment.",
    )
}

/** Signature verification, authenticated session and atomic nonce consumption are external. */
export function assertFinanceExpenseReceiptDownload(input: {
  scope: FinanceExpenseReceiptScope
  intent: FinanceExpenseReceiptIntent
  stored: FinanceExpenseReceiptStored
  grant: FinanceExpenseReceiptDownloadGrant
  safetyState: string
  bytesDeletedAt: Date | null
  now: Date
}) {
  const { scope, intent, stored, grant } = input
  assertIdentity(intent, { ...scope, assetId: intent.assetId })
  assertIdentity(grant, intent)
  assertFinanceExpenseReceiptStored(intent, stored)
  const now = timestamp(input.now)
  const issued = timestamp(grant.issuedAt)
  const expires = timestamp(grant.expiresAt)
  if (
    grant.actorUserId !== scope.actorUserId ||
    grant.contentDigest !== stored.contentDigest ||
    intent.attachedAt === null ||
    timestamp(intent.attachedAt) > now ||
    timestamp(intent.attachedAt) < timestamp(stored.verifiedAt) ||
    timestamp(stored.verifiedAt) > now ||
    input.bytesDeletedAt !== null ||
    input.safetyState !== "SAFE" ||
    issued > now ||
    expires <= now ||
    expires <= issued ||
    expires - issued > FINANCE_EXPENSE_RECEIPT_DOWNLOAD_MS
  )
    throw new FinanceError(
      "FORBIDDEN",
      "Expense receipt download is unavailable.",
    )
}

/** Ever-attached financial evidence is outside orphan cleanup, even after reversal. */
export function financeExpenseReceiptCleanupEligible(
  intent: FinanceExpenseReceiptIntent,
  now: Date,
) {
  if (intent.attachedAt !== null || intent.retentionHold) return false
  const lastLease = intent.uploadLeaseUntil
    ? timestamp(intent.uploadLeaseUntil)
    : timestamp(intent.createdAt)
  return (
    timestamp(now) >=
    Math.max(timestamp(intent.expiresAt), lastLease) +
      FINANCE_EXPENSE_RECEIPT_CLEANUP_GRACE_MS
  )
}
