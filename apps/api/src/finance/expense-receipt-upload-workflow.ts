import {
  type ExpenseReceiptUploadClaim,
  type ExpenseReceiptUploadRepository,
  FinanceError,
  assertSameExpenseReceiptUploadOriginal,
} from "@ewatrade/db/finance-expense-receipt-upload"
import {
  ExpenseReceiptUploadError,
  readExpenseReceiptUpload,
} from "@ewatrade/private-media/expense-receipt-upload"
import {
  type ExpenseReceiptContentType,
  createExpenseReceiptStorage,
  expenseReceiptStoragePath,
} from "@ewatrade/private-media/expense-receipts"
import type { PrivateObjectPort } from "@ewatrade/private-media/object-storage"

export type ExpenseReceiptUploadStorage = {
  port: PrivateObjectPort<ExpenseReceiptContentType>
  configured: () => boolean
  storeId: string | null
  providerMode?: "live" | "test"
}

/** Every repository boundary must still belong to the original live session. */
export function withFinanceExpenseReceiptUploadSession(
  repository: ExpenseReceiptUploadRepository,
  checkSession: () => Promise<void>,
): ExpenseReceiptUploadRepository {
  return {
    async load() {
      await checkSession()
      return repository.load()
    },
    async claim(...args) {
      await checkSession()
      return repository.claim(...args)
    },
    async revalidate(...args) {
      await checkSession()
      return repository.revalidate(...args)
    },
    async complete(...args) {
      await checkSession()
      return repository.complete(...args)
    },
  }
}

function assertLiveClaim(
  claim: Pick<ExpenseReceiptUploadClaim, "leaseUntil" | "target">,
) {
  const now = Date.now()
  if (
    !Number.isFinite(claim.leaseUntil.getTime()) ||
    claim.leaseUntil.getTime() <= now ||
    !Number.isFinite(claim.target.expiresAt.getTime()) ||
    claim.target.expiresAt.getTime() <= now
  )
    throw new FinanceError("CONFLICT", "The receipt upload lease has expired.")
}

/** Repository/port injection is trusted server code, never request-selected adapters. */
export async function uploadFinanceExpenseReceipt(input: {
  request: Request
  repository: ExpenseReceiptUploadRepository
  storage: () => ExpenseReceiptUploadStorage
}) {
  const original = await input.repository.load()
  const target = structuredClone(original.target)
  if (original.kind === "VERIFIED") {
    await readExpenseReceiptUpload(input.request, target)
    const current = await input.repository.load()
    assertSameExpenseReceiptUploadOriginal(current.target, target)
    if (current.kind !== "VERIFIED")
      throw new FinanceError(
        "CONFLICT",
        "Original receipt verification is no longer available.",
      )
    if (
      current.stored.verifiedAt.getTime() !==
        original.stored.verifiedAt.getTime() ||
      current.stored.storagePath !== original.stored.storagePath ||
      current.stored.storageProvider !== original.stored.storageProvider ||
      current.stored.storageStoreId !== original.stored.storageStoreId
    )
      throw new FinanceError(
        "CONFLICT",
        "Original receipt verification has changed.",
      )
    return current.metadata
  }
  if (original.kind !== "READY")
    throw new FinanceError(
      "CONFLICT",
      "This original receipt upload is already claimed.",
    )
  const configured = input.storage()
  const availability = createExpenseReceiptStorage(configured)
  availability.assertAvailable(original.scope)
  const bytes = await readExpenseReceiptUpload(input.request, target)
  const claim = structuredClone(
    await input.repository.claim(configured.storeId ?? "", target),
  )
  assertSameExpenseReceiptUploadOriginal(claim.target, target)
  if (claim.storageStoreId !== configured.storeId)
    throw new FinanceError(
      "CONFLICT",
      "The original receipt storage pin has changed.",
    )
  let authorityFailure: { error: unknown } | undefined
  const beforeEffect = async (path: string, signal: AbortSignal) => {
    if (authorityFailure) throw authorityFailure.error
    try {
      signal.throwIfAborted()
      const current = await input.repository.revalidate(claim)
      signal.throwIfAborted()
      assertSameExpenseReceiptUploadOriginal(current.target, target)
      if (
        current.claimId !== claim.claimId ||
        current.claimVersion !== claim.claimVersion ||
        current.storageStoreId !== configured.storeId ||
        current.leaseUntil.getTime() !== claim.leaseUntil.getTime() ||
        current.scope.tenantId !== claim.scope.tenantId ||
        current.scope.actorUserId !== claim.scope.actorUserId ||
        current.scope.bookId !== claim.scope.bookId ||
        current.scope.billId !== claim.scope.billId ||
        path !== expenseReceiptStoragePath(current.target)
      )
        throw new FinanceError(
          "CONFLICT",
          "The receipt upload claim has changed.",
        )
      assertLiveClaim(current)
      availability.assertAvailable(current.scope)
    } catch (error) {
      authorityFailure = { error }
      throw error
    }
  }
  const guarded: PrivateObjectPort<ExpenseReceiptContentType> = {
    async put(path, value, options) {
      await beforeEffect(path, options.abortSignal)
      return configured.port.put(path, value, options)
    },
    async get(path, options) {
      await beforeEffect(path, options.abortSignal)
      return configured.port.get(path, options)
    },
  }
  try {
    const stored = await createExpenseReceiptStorage({
      ...configured,
      port: guarded,
    }).stage({
      scope: claim.scope,
      target: claim.target,
      bytes,
      abortSignal: input.request.signal,
    })
    if (authorityFailure) throw authorityFailure.error
    return await input.repository.complete(claim, stored)
  } catch (error) {
    if (input.request.signal.aborted)
      throw new ExpenseReceiptUploadError(
        408,
        "Receipt upload was interrupted. Retry the same original receipt.",
      )
    if (authorityFailure) throw authorityFailure.error
    throw error
  }
}
