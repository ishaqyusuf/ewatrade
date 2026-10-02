import {
  type ExpenseReceiptDeliveryAuthority,
  type ExpenseReceiptDeliveryRepository,
  FinanceError,
  assertSameExpenseReceiptDeliveryOriginal,
} from "@ewatrade/db/finance-expense-receipt-delivery"
import {
  EXPENSE_RECEIPT_DOWNLOAD_PURPOSE,
  EXPENSE_RECEIPT_DOWNLOAD_VERSION,
  createExpenseReceiptDownloadTokenCodec,
  expenseReceiptDownloadSessionDigest,
} from "@ewatrade/private-media/expense-receipt-download-token"
import {
  ExpenseReceiptStorageError,
  createExpenseReceiptStorage,
} from "@ewatrade/private-media/expense-receipts"
import type { ExpenseReceiptUploadStorage } from "./expense-receipt-upload-workflow"

export class ExpenseReceiptDeliveryError extends Error {
  constructor(readonly status: 408) {
    super("Receipt download was interrupted. Request a new download grant.")
    this.name = "ExpenseReceiptDeliveryError"
  }
}

export type ExpenseReceiptDeliveryContext = {
  repository: ExpenseReceiptDeliveryRepository
  // Actual authenticated session ID; never a body/query/header-selected value.
  sessionId: string
  // Production reloads current protected context and the persisted live session.
  checkSession: () => Promise<void>
  secret: unknown
  storage: () => ExpenseReceiptUploadStorage
  signal: AbortSignal
}

function aborted(signal: AbortSignal) {
  if (signal.aborted) throw new ExpenseReceiptDeliveryError(408)
}

async function currentSession(input: ExpenseReceiptDeliveryContext) {
  aborted(input.signal)
  await input.checkSession()
  aborted(input.signal)
}

function availability(
  configured: ExpenseReceiptUploadStorage,
  authority: ExpenseReceiptDeliveryAuthority,
) {
  createExpenseReceiptStorage(configured).assertAvailable(authority.scope)
  if (configured.storeId !== authority.original.storageStoreId)
    throw new FinanceError("CONFLICT", "Original receipt storage has changed.")
}

export async function issueFinanceExpenseReceiptDownload(
  input: ExpenseReceiptDeliveryContext,
) {
  await currentSession(input)
  const codec = createExpenseReceiptDownloadTokenCodec(input.secret)
  const original = structuredClone(await input.repository.inspect())
  const configured = input.storage()
  availability(configured, original)
  const signed = codec.issue()
  const protocol = {
    nonceDigest: signed.nonceDigest,
    sessionDigest: expenseReceiptDownloadSessionDigest(input.sessionId),
    purpose: signed.purpose,
    version: signed.version,
  }
  const grant = await input.repository.issue(protocol)
  const now = Date.now()
  if (
    grant.purpose !== signed.purpose ||
    grant.version !== signed.version ||
    !(grant.issuedAt instanceof Date) ||
    !(grant.expiresAt instanceof Date) ||
    !Number.isFinite(grant.issuedAt.getTime()) ||
    !Number.isFinite(grant.expiresAt.getTime()) ||
    grant.issuedAt.getTime() > now ||
    grant.expiresAt.getTime() <= now ||
    grant.expiresAt.getTime() - grant.issuedAt.getTime() > 60_000
  )
    throw new FinanceError(
      "FORBIDDEN",
      "Receipt download grant is unavailable.",
    )
  await currentSession(input)
  const fresh = await input.repository.inspect()
  assertSameExpenseReceiptDeliveryOriginal(fresh, original)
  availability(configured, fresh)
  aborted(input.signal)
  return { token: signed.token, expiresAt: grant.expiresAt }
}

export async function downloadFinanceExpenseReceiptOriginal(
  input: ExpenseReceiptDeliveryContext & { token: unknown },
) {
  await currentSession(input)
  const codec = createExpenseReceiptDownloadTokenCodec(input.secret)
  const signed = codec.verifySignature(input.token)
  const protocol = {
    ...signed,
    sessionDigest: expenseReceiptDownloadSessionDigest(input.sessionId),
  }
  if (
    protocol.purpose !== EXPENSE_RECEIPT_DOWNLOAD_PURPOSE ||
    protocol.version !== EXPENSE_RECEIPT_DOWNLOAD_VERSION
  )
    throw new FinanceError(
      "FORBIDDEN",
      "Receipt download grant is unavailable.",
    )
  const original = structuredClone(await input.repository.inspect())
  const configured = input.storage()
  availability(configured, original)
  await currentSession(input)
  // A consumed grant is never renewed or replayed after provider/read failure.
  const consumed = structuredClone(await input.repository.consume(protocol))
  assertSameExpenseReceiptDeliveryOriginal(consumed, original)
  const held = { ...protocol, grantId: consumed.grantId }
  let authorityFailure: { error: unknown } | undefined
  async function revalidate() {
    await currentSession(input)
    const fresh = await input.repository.revalidate(held)
    assertSameExpenseReceiptDeliveryOriginal(fresh, original)
    availability(configured, fresh)
    aborted(input.signal)
    return fresh
  }
  const transport = createExpenseReceiptStorage({
    ...configured,
    port: {
      async put() {
        throw new ExpenseReceiptStorageError("RECEIPT_STORAGE_UNAVAILABLE")
      },
      async get(path, options) {
        try {
          await revalidate()
          if (path !== original.original.storagePath)
            throw new FinanceError("CONFLICT", "Original receipt has changed.")
          aborted(options.abortSignal)
        } catch (error) {
          authorityFailure = { error }
          throw error
        }
        return configured.port.get(path, options)
      },
    },
  })
  try {
    // Physical original verification is low-level transport. The consumed grant
    // and current attached SAFE authority above supply merchant read permission.
    const verified = await transport.readQuarantinedOriginal({
      scope: consumed.scope,
      object: { ...consumed.original, state: "QUARANTINED" },
      abortSignal: input.signal,
    })
    if (authorityFailure) throw authorityFailure.error
    // No bytes escape before a second current session/source/grant check.
    await revalidate()
    const extensions = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/heic": "heic",
      "image/heif": "heif",
      "application/pdf": "pdf",
    } as const
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(consumed.original.assetId))
      throw new FinanceError("CONFLICT", "Original receipt has changed.")
    return {
      bytes: verified,
      contentType: consumed.original.contentType,
      fileName: `receipt-${consumed.original.assetId}.${extensions[consumed.original.contentType]}`,
    }
  } catch (error) {
    aborted(input.signal)
    if (authorityFailure) throw authorityFailure.error
    throw error
  }
}
