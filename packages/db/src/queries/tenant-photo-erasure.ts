import { randomUUID } from "node:crypto"
import {
  CATALOG_PHOTO_CLEANUP_GRACE_MS,
  CATALOG_PHOTO_CONTENT_TYPES,
  catalogPhotoStoragePath,
} from "@ewatrade/catalog/photo-contracts"
import {
  Prisma,
  type PrismaClient,
  type TenantPhotoErasureHoldReason,
  type TenantPhotoErasureObjectKind,
  type TenantPhotoErasureObjectState,
} from "../../generated/prisma/client"

/**
 * Whole-Tenant private-object erasure. A platform operator starts one run per
 * closed (inactive) Tenant under an approved deletion authority reference. A
 * gated job inventories every object the Tenant may own, deletes deletable
 * bytes with an actual not-found read, retries with bounded backoff and holds
 * anything a stated retention policy keeps. COMPLETED requires a verification
 * pass that finds nothing new and every ledger object DELETED.
 */

const options = { maxWait: 10_000, timeout: 30_000 } as const
const PAGE = 100
const LEASE_MS = 60_000
const MAX_ATTEMPTS = 8
const BASE_BACKOFF_MS = 300_000
const MAX_BACKOFF_MS = 6 * 60 * 60_000
const KINDS = [
  "CATALOG_ORIGINAL",
  "CATALOG_DERIVATIVE",
  "EXPENSE_RECEIPT",
  "ORDER_ATTACHMENT",
  "ASSISTANT_ATTACHMENT",
  "SERVICE_MEDIA",
  "PRESCRIPTION_MEDIA",
] as const satisfies readonly TenantPhotoErasureObjectKind[]
// Failures a retry cannot fix; they wait for an operator resume.
const TERMINAL_FAILURES = new Set([
  "INVALID_OBJECT",
  "PROVIDER_UNSUPPORTED",
  "STORE_PIN_MISMATCH",
])

export class TenantPhotoErasureError extends Error {
  constructor(
    readonly code:
      | "DISABLED"
      | "OPERATOR_REQUIRED"
      | "INVALID_AUTHORITY"
      | "NOT_FOUND"
      | "TENANT_ACTIVE"
      | "OPERATOR_IS_MEMBER"
      | "AUTHORITY_CONFLICT"
      | "NOT_RESUMABLE",
  ) {
    super(code)
    this.name = "TenantPhotoErasureError"
  }
}

type Classification = "LIVE" | "QA"
type Cursor = Partial<Record<TenantPhotoErasureObjectKind, string | true>>
export type TenantPhotoErasureInventoryRow = {
  kind: TenantPhotoErasureObjectKind
  sourceId: string
  storageProvider: string | null
  storageStoreId: string | null
  storagePath: string | null
  contentDigest: string | null
  sizeBytes: number | null
  holdReason: TenantPhotoErasureHoldReason | null
  notBefore: Date
}

function enabled() {
  if (process.env.TENANT_PHOTO_ERASURE_ENABLED !== "true")
    throw new TenantPhotoErasureError("DISABLED")
}

async function requireOperator(
  db: Pick<PrismaClient, "user">,
  operatorUserId: string,
) {
  const operator = await db.user.findUnique({
    where: { id: operatorUserId },
    select: { isPlatformAdmin: true },
  })
  if (!operator?.isPlatformAdmin)
    throw new TenantPhotoErasureError("OPERATOR_REQUIRED")
}

function later(...dates: Array<Date | null | undefined>) {
  return new Date(
    Math.max(...dates.map((date) => date?.getTime() ?? 0)) +
      CATALOG_PHOTO_CLEANUP_GRACE_MS,
  )
}

const PROVIDERS: Record<Classification, string> = {
  LIVE: "vercel_blob_private",
  QA: "local_test",
}

/**
 * Pure classification of one possibly-stored object. Missing ownership is
 * uncertainty, never proof that no bytes exist, except the established QA rule
 * that unpinned, pathless QA metadata never reached a provider.
 */
export function classifyTenantPhotoErasureObject(
  classification: Classification,
  object: Omit<TenantPhotoErasureInventoryRow, "holdReason"> & {
    retained?: TenantPhotoErasureHoldReason | null
  },
): TenantPhotoErasureInventoryRow | null {
  const { retained, ...row } = object
  if (classification === "QA" && !row.storageStoreId && !row.storagePath)
    return null
  if (retained) return { ...row, holdReason: retained }
  if (!row.storageProvider || !row.storageStoreId || !row.storagePath)
    return { ...row, holdReason: "OWNERSHIP_UNKNOWN" }
  if (row.storageProvider !== PROVIDERS[classification])
    return { ...row, holdReason: "PROVIDER_UNSUPPORTED" }
  return { ...row, holdReason: null }
}

function catalogPath(asset: {
  id: string
  tenantId: string
  storeId: string
  contentDigest: string
  contentType: string
  storagePath: string | null
}) {
  const contentType = CATALOG_PHOTO_CONTENT_TYPES.find(
    (type) => type === asset.contentType,
  )
  if (!contentType) return null
  try {
    const canonical = catalogPhotoStoragePath({
      ...asset,
      assetId: asset.id,
      contentType,
    })
    // A contradictory stored path is unknown ownership, not a delete target.
    return asset.storagePath === null || asset.storagePath === canonical
      ? canonical
      : null
  } catch {
    return null
  }
}

type InventoryClient = Pick<
  Prisma.TransactionClient,
  | "catalogPhotoAsset"
  | "catalogPhotoDerivative"
  | "financeExpenseReceiptAsset"
  | "commercialOrderAttachment"
  | "assistantAttachment"
  | "serviceCommerceMediaAsset"
  | "prescriptionMedia"
>

/** One bounded page of one kind. Only rows whose bytes may still exist. */
export async function readTenantPhotoErasurePage(
  tx: InventoryClient,
  input: {
    kind: TenantPhotoErasureObjectKind
    tenantId: string
    after?: string
    classification: Classification
    now: Date
  },
) {
  const { tenantId, now, classification } = input
  const page = {
    where: { tenantId, ...(input.after ? { id: { gt: input.after } } : {}) },
    orderBy: { id: "asc" as const },
    take: PAGE,
  }
  const rows: Array<{
    id: string
    row: Parameters<typeof classifyTenantPhotoErasureObject>[1]
  }> = []
  switch (input.kind) {
    case "CATALOG_ORIGINAL":
      for (const asset of await tx.catalogPhotoAsset.findMany({
        ...page,
        where: { ...page.where, bytesDeletedAt: null },
      }))
        rows.push({
          id: asset.id,
          row: {
            kind: input.kind,
            sourceId: asset.id,
            storageProvider: asset.storageProvider,
            storageStoreId: asset.storageStoreId,
            storagePath: asset.storageStoreId ? catalogPath(asset) : null,
            contentDigest: asset.contentDigest,
            sizeBytes: asset.sizeBytes,
            notBefore: later(now),
          },
        })
      break
    case "CATALOG_DERIVATIVE":
      for (const derivative of await tx.catalogPhotoDerivative.findMany(page))
        rows.push({
          id: derivative.id,
          row: {
            kind: input.kind,
            sourceId: derivative.id,
            // Derivatives share the original's private Blob store pin.
            storageProvider:
              derivative.dataClassification === classification
                ? PROVIDERS[classification]
                : null,
            storageStoreId: derivative.storageStoreId,
            storagePath: derivative.storagePath,
            contentDigest: derivative.contentDigest,
            sizeBytes: derivative.sizeBytes,
            notBefore: later(now, derivative.writeUntil),
          },
        })
      break
    case "EXPENSE_RECEIPT":
      for (const receipt of await tx.financeExpenseReceiptAsset.findMany({
        ...page,
        where: { ...page.where, bytesDeletedAt: null },
      }))
        rows.push({
          id: receipt.id,
          row: {
            kind: input.kind,
            sourceId: receipt.id,
            storageProvider: receipt.storageProvider,
            storageStoreId: receipt.storageStoreId,
            storagePath: receipt.storagePath,
            contentDigest: receipt.contentDigest,
            sizeBytes: receipt.sizeBytes,
            notBefore: later(now, receipt.uploadLeaseUntil),
            // Ever-attached financial evidence has no approved erasure policy.
            retained: receipt.retentionHold
              ? "RETENTION_HOLD"
              : receipt.attachedAt || receipt.attachmentState !== "UNATTACHED"
                ? "FINANCIAL_EVIDENCE_POLICY_PENDING"
                : null,
          },
        })
      break
    case "ORDER_ATTACHMENT":
      for (const attachment of await tx.commercialOrderAttachment.findMany(
        page,
      ))
        rows.push({
          id: attachment.id,
          row: {
            kind: input.kind,
            sourceId: attachment.id,
            storageProvider: attachment.storageProvider,
            storageStoreId: attachment.storageStoreId,
            storagePath: attachment.storagePath,
            contentDigest: attachment.contentDigest,
            sizeBytes: attachment.sizeBytes,
            notBefore: later(now, attachment.uploadExpiresAt),
          },
        })
      break
    case "ASSISTANT_ATTACHMENT":
      for (const attachment of await tx.assistantAttachment.findMany(page))
        rows.push({
          id: attachment.id,
          row: {
            kind: input.kind,
            sourceId: attachment.id,
            storageProvider: attachment.storageProvider,
            storageStoreId: attachment.storageStoreId,
            storagePath: attachment.storagePath,
            contentDigest: attachment.contentDigest,
            sizeBytes: attachment.sizeBytes,
            notBefore: later(now, attachment.uploadExpiresAt),
          },
        })
      break
    case "SERVICE_MEDIA":
      for (const media of await tx.serviceCommerceMediaAsset.findMany({
        ...page,
        where: {
          ...page.where,
          objectKey: { not: null },
          deletedAt: null,
          lifecycle: { not: "DELETED" },
        },
      }))
        rows.push({
          id: media.id,
          row: {
            kind: input.kind,
            sourceId: media.id,
            storageProvider: media.provider,
            storageStoreId: null,
            storagePath: media.objectKey,
            contentDigest: media.contentDigest,
            sizeBytes: media.verifiedSizeBytes,
            notBefore: later(now),
            // No production adapter or store pin exists for this media yet.
            retained:
              media.retentionClass === "CLINICAL_EXTENSION"
                ? "CLINICAL_RETENTION"
                : media.retentionHoldAt || media.lifecycle === "RETENTION_HOLD"
                  ? "RETENTION_HOLD"
                  : "PROVIDER_UNSUPPORTED",
          },
        })
      break
    case "PRESCRIPTION_MEDIA":
      for (const media of await tx.prescriptionMedia.findMany({
        ...page,
        where: { ...page.where, deletedAt: null, status: { not: "DELETED" } },
      }))
        rows.push({
          id: media.id,
          row: {
            kind: input.kind,
            sourceId: media.id,
            storageProvider: null,
            storageStoreId: null,
            storagePath: media.objectKey,
            contentDigest: media.sha256,
            sizeBytes: media.sizeBytes,
            notBefore: later(now),
            retained: "CLINICAL_RETENTION",
          },
        })
      break
  }
  const last = rows.at(-1)?.id
  return {
    rows: rows
      .map(({ row }) => classifyTenantPhotoErasureObject(classification, row))
      .filter((row): row is TenantPhotoErasureInventoryRow => row !== null),
    next: rows.length < PAGE || !last ? (true as const) : last,
  }
}

function sameIdentity(
  a: Pick<
    TenantPhotoErasureInventoryRow,
    "storageProvider" | "storageStoreId" | "storagePath" | "contentDigest"
  >,
  b: typeof a,
) {
  return (
    a.storageProvider === b.storageProvider &&
    a.storageStoreId === b.storageStoreId &&
    a.storagePath === b.storagePath &&
    a.contentDigest === b.contentDigest
  )
}

/** Inserts new objects and reclassifies held/changed ones. Returns work added. */
async function recordPage(
  tx: Prisma.TransactionClient,
  run: { id: string; tenantId: string },
  kind: TenantPhotoErasureObjectKind,
  rows: TenantPhotoErasureInventoryRow[],
  now: Date,
) {
  if (!rows.length) return 0
  const existing = new Map(
    (
      await tx.tenantPhotoErasureObject.findMany({
        where: {
          runId: run.id,
          kind,
          sourceId: { in: rows.map((row) => row.sourceId) },
        },
      })
    ).map((row) => [row.sourceId, row]),
  )
  let added = 0
  for (const row of rows) {
    const state: TenantPhotoErasureObjectState = row.holdReason
      ? "HELD"
      : "PENDING"
    const identity = {
      storageProvider: row.storageProvider,
      storageStoreId: row.storageStoreId,
      storagePath: row.storagePath,
      contentDigest: row.contentDigest,
      sizeBytes: row.sizeBytes,
    }
    const previous = existing.get(row.sourceId)
    if (!previous) {
      await tx.tenantPhotoErasureObject.create({
        data: {
          runId: run.id,
          tenantId: run.tenantId,
          kind,
          sourceId: row.sourceId,
          ...identity,
          state,
          holdReason: row.holdReason,
          nextAttemptAt: row.notBefore,
        },
      })
      if (state === "PENDING") added++
      continue
    }
    const leased = previous.leaseUntil && previous.leaseUntil > now
    if (leased) continue
    const changed = !sameIdentity(previous, identity)
    // A source change after deletion means new bytes; held rows may be released.
    if (
      changed ||
      (previous.state === "HELD" &&
        (state !== "HELD" || previous.holdReason !== row.holdReason))
    ) {
      await tx.tenantPhotoErasureObject.update({
        where: { id: previous.id },
        data: {
          ...identity,
          state,
          holdReason: row.holdReason,
          attempts: 0,
          nextAttemptAt: row.notBefore,
          lastErrorCode: null,
          deletedAt: null,
        },
      })
      if (state === "PENDING") added++
    }
  }
  return added
}

async function lockRun(tx: Prisma.TransactionClient, runId: string) {
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "TenantPhotoErasureRun" WHERE "id"=${runId} FOR UPDATE`,
  )
  return tx.tenantPhotoErasureRun.findUnique({ where: { id: runId } })
}

/** Starts (or replays) the erasure run for one closed Tenant. */
export async function startTenantPhotoErasure(
  db: PrismaClient,
  input: {
    tenantId: string
    operatorUserId: string
    authorityReference: string
  },
) {
  enabled()
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(input.authorityReference))
    throw new TenantPhotoErasureError("INVALID_AUTHORITY")
  await requireOperator(db, input.operatorUserId)
  return db.$transaction(async (tx) => {
    const [tenant] = await tx.$queryRaw<
      Array<{ isActive: boolean; dataClassification: Classification }>
    >(Prisma.sql`
      SELECT "isActive", "dataClassification" FROM "Tenant"
      WHERE "id"=${input.tenantId} FOR UPDATE
    `)
    if (!tenant) throw new TenantPhotoErasureError("NOT_FOUND")
    if (tenant.isActive) throw new TenantPhotoErasureError("TENANT_ACTIVE")
    if (
      await tx.membership.count({
        where: { tenantId: input.tenantId, userId: input.operatorUserId },
      })
    )
      throw new TenantPhotoErasureError("OPERATOR_IS_MEMBER")
    const existing = await tx.tenantPhotoErasureRun.findUnique({
      where: { tenantId: input.tenantId },
    })
    if (existing) {
      if (existing.authorityReference !== input.authorityReference)
        throw new TenantPhotoErasureError("AUTHORITY_CONFLICT")
      return { runId: existing.id, status: existing.status, replay: true }
    }
    const run = await tx.tenantPhotoErasureRun.create({
      data: {
        tenantId: input.tenantId,
        dataClassification: tenant.dataClassification,
        authorityReference: input.authorityReference,
        startedByUserId: input.operatorUserId,
      },
    })
    return { runId: run.id, status: run.status, replay: false }
  }, options)
}

/**
 * Advances one run by one bounded step: an inventory/verification page or a
 * state transition. Safe to call repeatedly; a reactivated Tenant pauses it.
 */
export async function stepTenantPhotoErasureRun(
  db: PrismaClient,
  runId: string,
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const run = await lockRun(tx, runId)
    if (!run || run.status === "COMPLETED" || run.status === "NEEDS_REVIEW")
      return { status: run?.status ?? null, progressed: false }
    const tenant = await tx.tenant.findUnique({
      where: { id: run.tenantId },
      select: { isActive: true },
    })
    if (tenant?.isActive) return { status: run.status, progressed: false }
    if (run.status === "DELETING") {
      const pending = await tx.tenantPhotoErasureObject.count({
        where: { runId, state: "PENDING" },
      })
      if (pending) return { status: run.status, progressed: false }
      await tx.tenantPhotoErasureRun.update({
        where: { id: runId },
        data: {
          status: "VERIFYING",
          inventoryCursor: {},
          passAdded: 0,
          passCount: { increment: 1 },
        },
      })
      return { status: "VERIFYING" as const, progressed: true }
    }
    const cursor = { ...(run.inventoryCursor as Cursor) }
    const kind = KINDS.find((candidate) => cursor[candidate] !== true)
    if (kind) {
      const after = cursor[kind]
      const page = await readTenantPhotoErasurePage(tx, {
        kind,
        tenantId: run.tenantId,
        after: typeof after === "string" ? after : undefined,
        classification: run.dataClassification as Classification,
        now,
      })
      const added = await recordPage(tx, run, kind, page.rows, now)
      cursor[kind] = page.next
      await tx.tenantPhotoErasureRun.update({
        where: { id: runId },
        data: {
          inventoryCursor: cursor,
          passAdded: { increment: added },
        },
      })
      return { status: run.status, progressed: true }
    }
    const counts = await tx.tenantPhotoErasureObject.groupBy({
      by: ["state"],
      where: { runId },
      _count: { _all: true },
    })
    const count = (state: TenantPhotoErasureObjectState) =>
      counts.find((row) => row.state === state)?._count._all ?? 0
    const status =
      run.status === "INVENTORYING" || run.passAdded > 0 || count("PENDING")
        ? ("DELETING" as const)
        : count("FAILED") || count("HELD")
          ? ("NEEDS_REVIEW" as const)
          : ("COMPLETED" as const)
    await tx.tenantPhotoErasureRun.update({
      where: { id: runId },
      data: {
        status,
        inventoryCursor: {},
        passAdded: 0,
        ...(run.status === "INVENTORYING" ? { inventoriedAt: now } : {}),
        ...(run.status === "VERIFYING" && status !== "DELETING"
          ? { verifiedAt: now }
          : {}),
        ...(status === "COMPLETED" ? { completedAt: now } : {}),
      },
    })
    return { status, progressed: true }
  }, options)
}

/** Runs that a job tick should advance; bounded and identifier-only. */
export async function listActiveTenantPhotoErasureRuns(
  db: Pick<PrismaClient, "tenantPhotoErasureRun">,
) {
  return db.tenantPhotoErasureRun.findMany({
    where: { status: { in: ["INVENTORYING", "DELETING", "VERIFYING"] } },
    orderBy: { updatedAt: "asc" },
    select: { id: true },
    take: 8,
  })
}

/** Leases one due object. Only closed (or already removed) Tenants qualify. */
export async function claimTenantPhotoErasureObject(
  db: PrismaClient,
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<
      Array<{ id: string; dataClassification: string }>
    >(Prisma.sql`
      SELECT o."id", r."dataClassification" FROM "TenantPhotoErasureObject" o
      JOIN "TenantPhotoErasureRun" r ON r."id"=o."runId"
      LEFT JOIN "Tenant" t ON t."id"=o."tenantId"
      WHERE o."state"='PENDING' AND o."nextAttemptAt" <= ${now}
      AND (o."leaseUntil" IS NULL OR o."leaseUntil" <= ${now})
      AND r."status" IN ('DELETING','VERIFYING')
      AND (t."id" IS NULL OR t."isActive"=false)
      ORDER BY o."nextAttemptAt", o."id" LIMIT 1 FOR UPDATE OF o SKIP LOCKED
    `)
    if (!row) return null
    const leaseToken: string = randomUUID()
    const entry = await tx.tenantPhotoErasureObject.update({
      where: { id: row.id },
      data: {
        leaseToken,
        leaseUntil: new Date(now.getTime() + LEASE_MS),
        attempts: { increment: 1 },
      },
    })
    if (
      !entry.storageProvider ||
      !entry.storageStoreId ||
      !entry.storagePath ||
      (row.dataClassification !== "LIVE" && row.dataClassification !== "QA")
    )
      return null
    return {
      id: entry.id,
      leaseToken,
      attempts: entry.attempts,
      target: {
        storageProvider: entry.storageProvider,
        storageStoreId: entry.storageStoreId,
        storagePath: entry.storagePath,
        dataClassification: row.dataClassification as Classification,
      },
    }
  }, options)
}

export function tenantPhotoErasureBackoffMs(attempts: number) {
  return Math.min(
    BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1),
    MAX_BACKOFF_MS,
  )
}

/** Records the provider outcome for the exact live lease only. */
export async function finishTenantPhotoErasureObject(
  db: PrismaClient,
  claim: { id: string; leaseToken: string; attempts: number },
  result: { ok: true } | { ok: false; code: string },
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const lease = {
      id: claim.id,
      leaseToken: claim.leaseToken,
      leaseUntil: { gt: now },
      state: "PENDING" as const,
    }
    if (!result.ok) {
      const terminal =
        TERMINAL_FAILURES.has(result.code) || claim.attempts >= MAX_ATTEMPTS
      const updated = await tx.tenantPhotoErasureObject.updateMany({
        where: lease,
        data: {
          state: terminal ? "FAILED" : "PENDING",
          leaseToken: null,
          leaseUntil: null,
          lastErrorCode: result.code,
          nextAttemptAt: new Date(
            now.getTime() + tenantPhotoErasureBackoffMs(claim.attempts),
          ),
        },
      })
      return {
        recorded: updated.count === 1,
        state: terminal ? "FAILED" : "PENDING",
      }
    }
    const updated = await tx.tenantPhotoErasureObject.updateMany({
      where: lease,
      data: {
        state: "DELETED",
        deletedAt: now,
        leaseToken: null,
        leaseUntil: null,
        lastErrorCode: null,
      },
    })
    if (updated.count !== 1) return { recorded: false, state: "PENDING" }
    const object = await tx.tenantPhotoErasureObject.findUniqueOrThrow({
      where: { id: claim.id },
    })
    // Mirror verified absence on source rows that track their own bytes.
    if (object.kind === "CATALOG_ORIGINAL")
      await tx.catalogPhotoAsset.updateMany({
        where: {
          id: object.sourceId,
          tenantId: object.tenantId,
          bytesDeletedAt: null,
          storageStoreId: object.storageStoreId,
        },
        data: { bytesDeletedAt: now, storagePath: null },
      })
    if (object.kind === "CATALOG_DERIVATIVE")
      await tx.catalogPhotoDerivative.deleteMany({
        where: {
          id: object.sourceId,
          tenantId: object.tenantId,
          storageStoreId: object.storageStoreId ?? "",
          storagePath: object.storagePath ?? "",
        },
      })
    if (object.kind === "EXPENSE_RECEIPT")
      await tx.financeExpenseReceiptAsset.updateMany({
        where: {
          id: object.sourceId,
          tenantId: object.tenantId,
          bytesDeletedAt: null,
          storagePath: object.storagePath ?? "",
        },
        data: { bytesDeletedAt: now, uploadState: "DELETED" },
      })
    return { recorded: true, state: "DELETED" }
  }, options)
}

/** Operator recovery: failed objects get a fresh bounded retry budget and the
 * next verification pass reclassifies held objects. Holds are never cleared here. */
export async function resumeTenantPhotoErasure(
  db: PrismaClient,
  input: { tenantId: string; operatorUserId: string; now?: Date },
) {
  enabled()
  await requireOperator(db, input.operatorUserId)
  const now = input.now ?? new Date()
  return db.$transaction(async (tx) => {
    const found = await tx.tenantPhotoErasureRun.findUnique({
      where: { tenantId: input.tenantId },
      select: { id: true },
    })
    if (!found) throw new TenantPhotoErasureError("NOT_FOUND")
    const run = await lockRun(tx, found.id)
    if (!run || run.status === "COMPLETED")
      throw new TenantPhotoErasureError("NOT_RESUMABLE")
    const retried = await tx.tenantPhotoErasureObject.updateMany({
      where: { runId: run.id, state: "FAILED" },
      data: {
        state: "PENDING",
        attempts: 0,
        nextAttemptAt: now,
        leaseToken: null,
        leaseUntil: null,
      },
    })
    await tx.tenantPhotoErasureRun.update({
      where: { id: run.id },
      data: { status: "VERIFYING", inventoryCursor: {}, passAdded: 0 },
    })
    return { runId: run.id, retried: retried.count, status: "VERIFYING" }
  }, options)
}

/** Restricted counts only: no paths, digests, store pins or source ids. */
export async function getTenantPhotoErasureStatus(
  db: Pick<
    PrismaClient,
    "user" | "tenantPhotoErasureRun" | "tenantPhotoErasureObject"
  >,
  input: { tenantId: string; operatorUserId: string },
) {
  await requireOperator(db, input.operatorUserId)
  const run = await db.tenantPhotoErasureRun.findUnique({
    where: { tenantId: input.tenantId },
    select: {
      id: true,
      status: true,
      dataClassification: true,
      passCount: true,
      inventoriedAt: true,
      verifiedAt: true,
      completedAt: true,
      createdAt: true,
    },
  })
  if (!run) return null
  const groups = await db.tenantPhotoErasureObject.groupBy({
    by: ["kind", "state", "holdReason", "lastErrorCode"],
    where: { runId: run.id },
    _count: { _all: true },
  })
  return {
    ...run,
    objects: groups.map((group) => ({
      kind: group.kind,
      state: group.state,
      holdReason: group.holdReason,
      lastErrorCode: group.lastErrorCode,
      count: group._count._all,
    })),
  }
}

export type TenantPhotoErasureBlocker =
  | "NOT_STARTED"
  | "INCOMPLETE"
  | "TENANT_ACTIVE"
  | "OBJECTS_REMAIN"
  | "BYTES_REMAIN"

type AssessmentClient = Pick<
  Prisma.TransactionClient,
  | "tenant"
  | "tenantPhotoErasureRun"
  | "tenantPhotoErasureObject"
  | "catalogPhotoAsset"
  | "catalogPhotoDerivative"
  | "financeExpenseReceiptAsset"
  | "commercialOrderAttachment"
  | "assistantAttachment"
  | "serviceCommerceMediaAsset"
  | "prescriptionMedia"
>

/**
 * Read-only certification gate for Tenant hard deletion. A COMPLETED run is
 * rechecked against current source rows so later uploads cannot hide behind it.
 */
export async function assessTenantPhotoErasure(
  db: AssessmentClient,
  tenantId: string,
) {
  const blockers: TenantPhotoErasureBlocker[] = []
  const run = await db.tenantPhotoErasureRun.findUnique({
    where: { tenantId },
    select: { id: true, status: true, verifiedAt: true },
  })
  if (!run) return { complete: false, blockers: ["NOT_STARTED" as const] }
  if (run.status !== "COMPLETED") blockers.push("INCOMPLETE")
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { isActive: true },
  })
  if (tenant?.isActive) blockers.push("TENANT_ACTIVE")
  const remaining = await db.tenantPhotoErasureObject.count({
    where: { runId: run.id, state: { not: "DELETED" } },
  })
  if (remaining) blockers.push("OBJECTS_REMAIN")
  const since = run.verifiedAt ?? new Date(0)
  const residual = [
    await db.catalogPhotoAsset.count({
      where: { tenantId, bytesDeletedAt: null, storageStoreId: { not: null } },
    }),
    await db.catalogPhotoDerivative.count({ where: { tenantId } }),
    await db.financeExpenseReceiptAsset.count({
      where: { tenantId, bytesDeletedAt: null },
    }),
    await db.commercialOrderAttachment.count({
      where: { tenantId, createdAt: { gt: since } },
    }),
    await db.assistantAttachment.count({
      where: { tenantId, createdAt: { gt: since } },
    }),
    await db.serviceCommerceMediaAsset.count({
      where: {
        tenantId,
        objectKey: { not: null },
        deletedAt: null,
        lifecycle: { not: "DELETED" },
      },
    }),
    await db.prescriptionMedia.count({
      where: { tenantId, deletedAt: null, status: { not: "DELETED" } },
    }),
  ]
  if (residual.some((count) => count > 0)) blockers.push("BYTES_REMAIN")
  return { complete: blockers.length === 0, blockers }
}
