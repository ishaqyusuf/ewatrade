import { detectServiceCommerceMediaMimeType } from "@ewatrade/service-commerce"
import { assertQaProviderAllowed } from "@ewatrade/utils/qa-provider-policy"
import {
  type PrivateObjectDescriptor,
  type PrivateObjectPort,
  PrivateObjectStorageError,
  assertPrivateObjectServer,
  createPrivateObjectStorage,
  privateObjectOperationSignal,
} from "./object-storage"
import {
  type PrivateBlobEnvironment,
  createVercelPrivateObjectPort,
} from "./vercel-blob"

export const EXPENSE_RECEIPT_MAX_BYTES = 10_000_000
export type ExpenseReceiptContentType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/heic"
  | "image/heif"
  | "application/pdf"

export type ExpenseReceiptStorageScope = {
  tenantId: string
  bookId: string
  billId: string
  actorUserId: string
  dataClassification: "LIVE" | "QA"
}

/** Loaded from a saved authorized intent/lease; never parse this from a client. */
export type ExpenseReceiptUploadTarget = {
  tenantId: string
  bookId: string
  billId: string
  assetId: string
  actorUserId: string
  contentDigest: string
  contentType: ExpenseReceiptContentType
  sizeBytes: number
  createdAt: Date
  expiresAt: Date
}

/** Verified original bytes only: no SAFE verdict, attachment or delivery authority. */
export type ExpenseReceiptQuarantinedObject =
  PrivateObjectDescriptor<ExpenseReceiptContentType> & {
    tenantId: string
    bookId: string
    billId: string
    assetId: string
    storageProvider: "vercel_blob_private"
    storageStoreId: string
    verifiedAt: Date
    state: "QUARANTINED"
  }

const extensions: Record<ExpenseReceiptContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
}

export class ExpenseReceiptStorageError extends Error {
  constructor(
    readonly code:
      | "INVALID_RECEIPT"
      | "RECEIPT_SCOPE_MISMATCH"
      | "RECEIPT_NOT_FOUND"
      | "RECEIPT_INTEGRITY_MISMATCH"
      | "RECEIPT_STORAGE_UNAVAILABLE",
  ) {
    super(
      {
        INVALID_RECEIPT:
          "Choose an original image or PDF receipt up to 10,000,000 bytes.",
        RECEIPT_SCOPE_MISMATCH:
          "Receipt scope does not match the selected business and Expense.",
        RECEIPT_NOT_FOUND: "Receipt original not found.",
        RECEIPT_INTEGRITY_MISMATCH:
          "The original receipt could not be verified.",
        RECEIPT_STORAGE_UNAVAILABLE:
          "Receipt storage is unavailable. Retry the same original receipt.",
      }[code],
    )
    this.name = "ExpenseReceiptStorageError"
  }
}

function id(value: string) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value))
    throw new ExpenseReceiptStorageError("RECEIPT_SCOPE_MISMATCH")
}

export function expenseReceiptStoragePath(
  target: Pick<
    ExpenseReceiptQuarantinedObject,
    | "tenantId"
    | "bookId"
    | "billId"
    | "assetId"
    | "contentDigest"
    | "contentType"
  >,
) {
  for (const value of [
    target.tenantId,
    target.bookId,
    target.billId,
    target.assetId,
  ])
    id(value)
  if (
    !/^[a-f0-9]{64}$/.test(target.contentDigest) ||
    !Object.hasOwn(extensions, target.contentType)
  )
    throw new ExpenseReceiptStorageError("INVALID_RECEIPT")
  return `finance/expense-receipts/quarantine/${target.tenantId}/${target.bookId}/${target.billId}/${target.assetId}/${target.contentDigest}.${extensions[target.contentType]}`
}

function validateBytes(
  bytes: Uint8Array,
  contentType: ExpenseReceiptContentType,
) {
  if (
    bytes.byteLength < 1 ||
    bytes.byteLength > EXPENSE_RECEIPT_MAX_BYTES ||
    detectServiceCommerceMediaMimeType(bytes) !== contentType
  )
    throw new PrivateObjectStorageError("INTEGRITY_MISMATCH")
}

function failure(error: unknown): never {
  if (error instanceof ExpenseReceiptStorageError) throw error
  if (error instanceof PrivateObjectStorageError) {
    if (error.code === "INVALID_OBJECT")
      throw new ExpenseReceiptStorageError("INVALID_RECEIPT")
    if (error.code === "OBJECT_NOT_FOUND")
      throw new ExpenseReceiptStorageError("RECEIPT_NOT_FOUND")
    if (error.code === "INTEGRITY_MISMATCH")
      throw new ExpenseReceiptStorageError("RECEIPT_INTEGRITY_MISMATCH")
  }
  throw new ExpenseReceiptStorageError("RECEIPT_STORAGE_UNAVAILABLE")
}

/** Storage prerequisite only; repositories still own current actor, lease and lifecycle checks. */
export function createExpenseReceiptStorage(input: {
  port: PrivateObjectPort<ExpenseReceiptContentType>
  configured: () => boolean
  storeId: string | null
  now?: () => Date
  providerMode?: "live" | "test"
}) {
  const objects = createPrivateObjectStorage({
    ...input,
    maxBytes: EXPENSE_RECEIPT_MAX_BYTES,
    validateBytes,
  })
  const now = input.now ?? (() => new Date())
  const storeId = input.storeId
  const mode = input.providerMode ?? "live"

  function ready(scope: ExpenseReceiptStorageScope) {
    assertPrivateObjectServer()
    for (const value of [
      scope.tenantId,
      scope.bookId,
      scope.billId,
      scope.actorUserId,
    ])
      id(value)
    if (mode !== "live" && mode !== "test")
      throw new ExpenseReceiptStorageError("RECEIPT_STORAGE_UNAVAILABLE")
    if (
      mode === "test" &&
      (scope.dataClassification !== "QA" ||
        !["development", "test"].includes(process.env.NODE_ENV ?? "") ||
        [
          process.env.APP_ENV,
          process.env.DEV_PROFILE,
          process.env.EWATRADE_ENV_MODE,
        ].some((value) =>
          ["prod", "production"].includes(value?.trim().toLowerCase() ?? ""),
        ))
    )
      throw new ExpenseReceiptStorageError("RECEIPT_STORAGE_UNAVAILABLE")
    assertQaProviderAllowed({
      adapter: mode,
      operation: "media_analysis",
      tenantDataClassification: scope.dataClassification,
    })
    if (
      !storeId ||
      !/^store_[a-zA-Z0-9]+$/.test(storeId) ||
      !input.configured()
    )
      throw new ExpenseReceiptStorageError("RECEIPT_STORAGE_UNAVAILABLE")
  }
  function scoped(
    scope: ExpenseReceiptStorageScope,
    object: ExpenseReceiptQuarantinedObject,
  ) {
    ready(scope)
    if (
      object.tenantId !== scope.tenantId ||
      object.bookId !== scope.bookId ||
      object.billId !== scope.billId ||
      object.storageProvider !== "vercel_blob_private" ||
      object.storageStoreId !== storeId ||
      object.state !== "QUARANTINED" ||
      !Number.isFinite(object.verifiedAt.getTime()) ||
      object.storagePath !== expenseReceiptStoragePath(object)
    )
      throw new ExpenseReceiptStorageError("RECEIPT_SCOPE_MISMATCH")
  }

  return {
    assertAvailable: ready,
    async stage(request: {
      scope: ExpenseReceiptStorageScope
      target: ExpenseReceiptUploadTarget
      bytes: Uint8Array
      abortSignal?: AbortSignal
    }): Promise<ExpenseReceiptQuarantinedObject> {
      const scope = { ...request.scope }
      const target = {
        ...request.target,
        createdAt: new Date(request.target.createdAt),
        expiresAt: new Date(request.target.expiresAt),
      }
      ready(scope)
      const startedAt = now().getTime()
      if (
        target.tenantId !== scope.tenantId ||
        target.bookId !== scope.bookId ||
        target.billId !== scope.billId ||
        target.actorUserId !== scope.actorUserId
      )
        throw new ExpenseReceiptStorageError("RECEIPT_SCOPE_MISMATCH")
      if (
        !Number.isFinite(startedAt) ||
        !Number.isFinite(target.createdAt.getTime()) ||
        !Number.isFinite(target.expiresAt.getTime()) ||
        target.createdAt.getTime() > startedAt ||
        target.expiresAt.getTime() <= startedAt
      )
        throw new ExpenseReceiptStorageError("INVALID_RECEIPT")
      const object: ExpenseReceiptQuarantinedObject = {
        tenantId: target.tenantId,
        bookId: target.bookId,
        billId: target.billId,
        assetId: target.assetId,
        contentDigest: target.contentDigest,
        contentType: target.contentType,
        sizeBytes: target.sizeBytes,
        storagePath: expenseReceiptStoragePath(target),
        storageProvider: "vercel_blob_private",
        storageStoreId: storeId ?? "",
        verifiedAt: new Date(startedAt),
        state: "QUARANTINED",
      }
      const signal = privateObjectOperationSignal(request.abortSignal)
      try {
        await objects.write({
          object,
          bytes: request.bytes,
          abortSignal: signal,
        })
        // Even a successful put is insufficient for a Finance upload receipt.
        await objects.read({ object, abortSignal: signal })
        const verifiedAt = new Date(now())
        if (
          !Number.isFinite(verifiedAt.getTime()) ||
          verifiedAt.getTime() < startedAt ||
          verifiedAt >= target.expiresAt
        )
          throw new ExpenseReceiptStorageError("RECEIPT_STORAGE_UNAVAILABLE")
        return { ...object, verifiedAt }
      } catch (error) {
        failure(error)
      }
    },
    /** Internal scanner/verification ingress only; not a merchant download endpoint. */
    async readQuarantinedOriginal(request: {
      scope: ExpenseReceiptStorageScope
      object: ExpenseReceiptQuarantinedObject
      abortSignal?: AbortSignal
    }) {
      const object = {
        ...request.object,
        verifiedAt: new Date(request.object.verifiedAt),
      }
      scoped({ ...request.scope }, object)
      try {
        return await objects.read({ object, abortSignal: request.abortSignal })
      } catch (error) {
        failure(error)
      }
    },
  }
}

/** Explicit server configuration only. No default credential reuse or live activation. */
export function createVercelExpenseReceiptStorage(env: PrivateBlobEnvironment) {
  return createExpenseReceiptStorage(
    createVercelPrivateObjectPort<ExpenseReceiptContentType>(env),
  )
}
