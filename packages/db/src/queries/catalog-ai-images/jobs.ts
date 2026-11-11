import { createHash, randomUUID } from "node:crypto"
import { isLocalCatalogPhotoQaEnabled } from "@ewatrade/catalog/photo-qa-policy"
import {
  type CatalogAiChoice,
  type CatalogAiFacts,
  type CatalogAiPolicy,
  type CatalogAiTokenUsage,
  catalogAiCostMicros,
  catalogAiEffectivePolicy,
  catalogAiFactsSchema,
  catalogAiJobFactsSchema,
  catalogAiPeriodStart,
  catalogAiPolicySchema,
} from "@ewatrade/utils/catalog-ai-images"
import {
  type CatalogAiImageJob,
  Prisma,
  type PrismaClient,
} from "../../../generated/prisma/client"
import {
  CATALOG_GALLERY_KEEP_UNTIL,
  type CatalogPhotoActorScope,
  CatalogPhotoError,
  authorizeCatalogPhotoScope,
} from "../catalog-photos"
import { runInOwnTransaction } from "../own-transaction"
import type { DbClient } from "../types"
import {
  CatalogAiError,
  loadCatalogAiPolicy,
  lockCatalogAiPolicy,
} from "./policy"

export const catalogAiPendingStates = [
  "QUEUED",
  "DISPATCHING",
  "UNCERTAIN",
  "PENDING_REVIEW",
]
const options = { maxWait: 10_000, timeout: 30_000 }
export function catalogAiPublicJob(job: CatalogAiImageJob) {
  return {
    id: job.id,
    runId: job.clientOperationId.split(":")[0] ?? job.clientOperationId,
    mode: job.mode,
    state: job.state,
    sourceAssetId: job.sourceAssetId,
    rootAssetId: job.rootAssetId,
    choice: catalogAiJobFactsSchema.safeParse(job.facts).data?.choice ?? null,
    outputAssetId: job.state === "DELIVERED" ? job.outputAssetId : null,
    failureCode: job.failureCode,
    appliedAt: job.appliedAt,
    createdAt: job.createdAt,
    deliveredAt: job.deliveredAt,
  }
}
export async function catalogAiUsage(
  db: DbClient,
  tenantId: string,
  policy: CatalogAiPolicy,
) {
  const effective = catalogAiEffectivePolicy(policy, tenantId)
  const [usage] = await db.$queryRaw<
    Array<{ used: number; reserved: number }>
  >(Prisma.sql`
    SELECT COUNT(*) FILTER(WHERE "state"='DELIVERED' AND "deliveredAt">=${catalogAiPeriodStart(effective.allowance.period)})::int AS used,
    COUNT(*) FILTER(WHERE "state" IN ('QUEUED','DISPATCHING','UNCERTAIN','PENDING_REVIEW'))::int AS reserved
    FROM "CatalogAiImageJob" WHERE "tenantId"=${tenantId}
  `)
  const used = usage?.used ?? 0
  const reserved = usage?.reserved ?? 0
  return {
    tenantId,
    period: effective.allowance.period,
    limit: effective.allowance.images,
    used,
    reserved,
    remaining: Math.max(0, effective.allowance.images - used - reserved),
    enabled: effective.enabled,
  }
}
async function roleAllowed(
  tx: Prisma.TransactionClient,
  scope: CatalogPhotoActorScope,
  policy: CatalogAiPolicy,
) {
  const member = await tx.membership.findFirst({
    where: {
      tenantId: scope.tenantId,
      userId: scope.actorUserId,
      status: "ACTIVE",
    },
    select: {
      role: true,
      staffAccessMode: true,
      catalogEditor: true,
      staffStoreAssignments: {
        where: {
          tenantId: scope.tenantId,
          status: "ACTIVE",
          store: { tenantId: scope.tenantId, status: "ACTIVE" },
        },
        select: { storeId: true, role: true },
      },
    },
  })
  if (!member || !policy.generation.roles.some((role) => role === member.role))
    return false
  // Fresh equivalent of the existing scoped Catalog + selected Store grants.
  return (
    member.role === "OWNER" ||
    member.role === "ADMIN" ||
    member.staffAccessMode === "LEGACY" ||
    (member.catalogEditor &&
      member.staffStoreAssignments.some((row) => row.role === "MANAGER") &&
      member.staffStoreAssignments.some((row) => row.storeId === scope.storeId))
  )
}
async function activeCatalogAiScope(
  tx: Prisma.TransactionClient,
  scope: CatalogPhotoActorScope,
) {
  try {
    return await authorizeCatalogPhotoScope(tx, scope)
  } catch (error) {
    if (
      error instanceof CatalogPhotoError &&
      error.code === "PHOTO_ACCESS_DENIED"
    )
      return null
    throw error
  }
}
function requireEnabled(policy: CatalogAiPolicy, tenantId: string) {
  if (!catalogAiEffectivePolicy(policy, tenantId).enabled)
    throw new CatalogAiError(
      "UNAVAILABLE",
      "AI generation is paused or has not been enabled.",
    )
}
function hasCatalogAiPhotoStorage(tenant: {
  dataClassification: "LIVE" | "QA"
}) {
  return tenant.dataClassification === "LIVE" || isLocalCatalogPhotoQaEnabled()
}

type StartCatalogAiImage = CatalogPhotoActorScope & {
  clientOperationId: string
  contextKey: string
  catalogItemId?: string
  sourceAssetId?: string
  facts: CatalogAiFacts
  note: string
}

export async function startCatalogAiImage(
  db: PrismaClient,
  input: StartCatalogAiImage,
) {
  const [job] = await startCatalogAiJobs(db, input)
  if (!job)
    throw new CatalogAiError(
      "CONFLICT",
      "The image request could not be confirmed.",
    )
  return job
}

export function startCatalogAiImageBatch(
  db: PrismaClient,
  input: Omit<StartCatalogAiImage, "sourceAssetId"> & {
    choices: CatalogAiChoice[]
  },
) {
  return startCatalogAiJobs(db, input)
}

function startCatalogAiJobs(
  db: PrismaClient,
  input: StartCatalogAiImage & { choices?: CatalogAiChoice[] },
) {
  return runInOwnTransaction(db, (tx) =>
    startCatalogAiJobsInTransaction(tx, input),
  )
}

export async function startCatalogAiJobsInTransaction(
  tx: Prisma.TransactionClient,
  input: StartCatalogAiImage & { choices?: CatalogAiChoice[] },
) {
  const publicFacts = catalogAiFactsSchema.parse(input.facts)
  const count = input.choices?.length ?? 1
  const operations = Array.from({ length: count }, (_, index) =>
    index === 0
      ? input.clientOperationId
      : `${input.clientOperationId}:${index}`,
  )
  const digest = createHash("sha256")
    .update(JSON.stringify({ ...input, facts: publicFacts }))
    .digest("hex")
  await lockCatalogAiPolicy(tx)
  const tenant = await authorizeCatalogPhotoScope(tx, input)
  if (!hasCatalogAiPhotoStorage(tenant))
    throw new CatalogAiError(
      "UNAVAILABLE",
      "Catalog photo storage is unavailable in this environment.",
    )
  const prior = await tx.catalogAiImageJob.findUnique({
    where: {
      tenantId_clientOperationId: {
        tenantId: input.tenantId,
        clientOperationId: input.clientOperationId,
      },
    },
  })
  if (prior) {
    if (prior.payloadHash !== digest)
      throw new CatalogAiError(
        "CONFLICT",
        "This request already has different image details.",
      )
    if (count === 1) return [catalogAiPublicJob(prior)]
    const jobs = await tx.catalogAiImageJob.findMany({
      where: {
        tenantId: input.tenantId,
        clientOperationId: { in: operations },
      },
      orderBy: { clientOperationId: "asc" },
    })
    if (jobs.length !== count || jobs.some((job) => job.payloadHash !== digest))
      throw new CatalogAiError(
        "CONFLICT",
        "The image run could not be confirmed.",
      )
    return jobs.map(catalogAiPublicJob)
  }
  const { policy } = await loadCatalogAiPolicy(tx)
  requireEnabled(policy, input.tenantId)
  if (!(await roleAllowed(tx, input, policy)))
    throw new CatalogAiError(
      "FORBIDDEN",
      "Your role cannot use AI image generations.",
    )
  await assertCatalogAiAllowanceInTransaction(tx, input.tenantId, policy, count)
  const effective = catalogAiEffectivePolicy(policy, input.tenantId)
  await assertCatalogAiSpendInTransaction(tx, effective, count)
  // Admission requires a complete versioned rate set; unset prices never mean free provider calls.
  if (
    catalogAiCostMicros(
      policy,
      effective.model,
      { textInput: 0, imageInput: 0, output: 0 },
      new Date(),
    ) === null
  )
    throw new CatalogAiError(
      "UNAVAILABLE",
      "AI pricing has not been configured.",
    )
  let facts = publicFacts
  let choices = input.choices
  if (input.catalogItemId) {
    const item = await tx.catalogItem.findFirst({
      where: {
        id: input.catalogItemId,
        tenantId: input.tenantId,
        archivedAt: null,
      },
      select: {
        kind: true,
        name: true,
        description: true,
        category: true,
        ...(choices
          ? {
              variants: {
                where: {
                  id: { in: choices.map((choice) => choice.id) },
                  status: "ACTIVE" as const,
                },
                select: { id: true, name: true },
              },
              _count: { select: { photoAssets: true } },
            }
          : {}),
      },
    })
    if (!item) throw new CatalogAiError("NOT_FOUND", "Item not found.")
    facts = catalogAiFactsSchema.parse({
      kind: item.kind,
      name: item.name,
      description: item.description ?? "",
      category: item.category ?? "",
    })
    if (choices) {
      if (item.variants.length !== count)
        throw new CatalogAiError(
          "BAD_REQUEST",
          "One or more customer choices are no longer available.",
        )
      if (item._count.photoAssets + count > 8)
        throw new CatalogAiError(
          "LIMIT",
          "There is room for up to eight images on this item.",
        )
      const savedChoices = new Map(
        item.variants.map((choice) => [choice.id, choice]),
      )
      choices = choices.flatMap((choice) => savedChoices.get(choice.id) ?? [])
    }
  }
  let rootAssetId: string | null = null
  let sourceChoice: CatalogAiChoice | undefined
  if (input.sourceAssetId) {
    const source = await tx.catalogPhotoAsset.findFirst({
      where: {
        id: input.sourceAssetId,
        tenantId: input.tenantId,
        storeId: input.storeId,
        state: "APPROVED",
        bytesDeletedAt: null,
        OR: [
          { actorUserId: input.actorUserId },
          { catalogItemId: { not: null } },
          { galleryAddedAt: { not: null } },
        ],
      },
    })
    if (!source || (!source.catalogItemId && source.expiresAt <= new Date()))
      throw new CatalogAiError(
        "BAD_REQUEST",
        "Wait for this photo's image check before refining it.",
      )
    const version = await tx.catalogAiImageVersion.findFirst({
      where: {
        assetId: source.id,
        tenantId: input.tenantId,
        removedAt: null,
      },
    })
    rootAssetId = version?.rootAssetId ?? source.id
    if (version && !input.catalogItemId) {
      const sourceJob = await tx.catalogAiImageJob.findFirst({
        where: {
          id: version.jobId,
          tenantId: input.tenantId,
          storeId: input.storeId,
          actorUserId: input.actorUserId,
          contextKey: input.contextKey,
        },
        select: { facts: true },
      })
      sourceChoice = catalogAiJobFactsSchema.safeParse(sourceJob?.facts).data
        ?.choice
    }
    // Keep both source and original beyond draft expiry when latest replaces it.
    await tx.catalogPhotoAsset.updateMany({
      where: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        id: { in: [source.id, rootAssetId] },
        state: "APPROVED",
      },
      data: {
        galleryAddedAt: new Date(),
        expiresAt: CATALOG_GALLERY_KEEP_UNTIL,
      },
    })
  }
  const jobs = await tx.catalogAiImageJob.createManyAndReturn({
    data: operations.map((clientOperationId, index) => ({
      tenantId: input.tenantId,
      storeId: input.storeId,
      actorUserId: input.actorUserId,
      clientOperationId,
      contextKey: input.contextKey,
      payloadHash: digest,
      catalogItemId: input.catalogItemId,
      sourceAssetId: input.sourceAssetId,
      rootAssetId,
      mode: input.sourceAssetId ? "refine" : "generate",
      facts: choices
        ? { ...facts, choice: choices[index] }
        : sourceChoice
          ? { ...facts, choice: sourceChoice }
          : facts,
      note: input.note,
      policySnapshot: policy,
      policyRevision: policy.revision,
      model: effective.model,
      reservedCostMicros: effective.maxRequestMicros,
    })),
  })
  return jobs
    .sort((left, right) =>
      left.clientOperationId.localeCompare(right.clientOperationId),
    )
    .map(catalogAiPublicJob)
}
export async function readCatalogAiImages(
  db: PrismaClient,
  input: CatalogPhotoActorScope & { contextKey: string },
) {
  return db.$transaction(
    async (tx) => {
      const tenant = await authorizeCatalogPhotoScope(tx, input)
      const { policy } = await loadCatalogAiPolicy(tx)
      const jobs = await tx.catalogAiImageJob.findMany({
        where: {
          tenantId: input.tenantId,
          storeId: input.storeId,
          actorUserId: input.actorUserId,
          contextKey: input.contextKey,
        },
        orderBy: { createdAt: "desc" },
        take: 32,
      })
      const assets = await tx.catalogPhotoAsset.findMany({
        where: {
          id: {
            in: jobs.flatMap((job) =>
              job.outputAssetId ? [job.outputAssetId] : [],
            ),
          },
          tenantId: input.tenantId,
          state: "APPROVED",
          bytesDeletedAt: null,
        },
        select: { id: true },
      })
      return {
        usage: await catalogAiUsage(tx, input.tenantId, policy),
        jobs: jobs.map((job) => ({
          ...catalogAiPublicJob(job),
          outputAssetId:
            job.state === "DELIVERED" &&
            assets.some((asset) => asset.id === job.outputAssetId)
              ? job.outputAssetId
              : null,
        })),
        canGenerate:
          hasCatalogAiPhotoStorage(tenant) &&
          (await roleAllowed(tx, input, policy)),
      }
    },
    { ...options },
  )
}

export async function cancelCatalogAiImages(
  db: PrismaClient,
  input: CatalogPhotoActorScope & { contextKey: string; jobIds: string[] },
) {
  return runInOwnTransaction(db, async (tx) => {
    await lockCatalogAiPolicy(tx)
    await authorizeCatalogPhotoScope(tx, input)
    const where = {
      id: { in: input.jobIds },
      tenantId: input.tenantId,
      storeId: input.storeId,
      actorUserId: input.actorUserId,
      contextKey: input.contextKey,
    }
    const stopped = await tx.catalogAiImageJob.updateMany({
      where: { ...where, state: { in: ["QUEUED", "PENDING_REVIEW"] } },
      data: { state: "CANCELLED", completedAt: new Date(), failureCode: null },
    })
    const requested = await tx.catalogAiImageJob.updateMany({
      where: { ...where, state: "DISPATCHING" },
      data: { failureCode: "CANCEL_REQUESTED" },
    })
    return { stopped: stopped.count, requested: requested.count }
  })
}

export async function claimCatalogAiImage(db: PrismaClient, id: string) {
  return runInOwnTransaction(db, async (tx) => {
    await lockCatalogAiPolicy(tx)
    const job = await tx.catalogAiImageJob.findUnique({ where: { id } })
    if (!job || job.state !== "QUEUED") return null
    const tenant = await activeCatalogAiScope(tx, job)
    const { policy } = await loadCatalogAiPolicy(tx)
    const effective = catalogAiEffectivePolicy(policy, job.tenantId)
    const usage = await catalogAiUsage(tx, job.tenantId, policy)
    if (
      !tenant ||
      !hasCatalogAiPhotoStorage(tenant) ||
      !effective.enabled ||
      !(await roleAllowed(tx, job, policy)) ||
      job.model !== effective.model ||
      usage.used + usage.reserved > effective.allowance.images
    ) {
      await tx.catalogAiImageJob.update({
        where: { id },
        data: {
          state: "FAILED",
          costMicros: 0,
          completedAt: new Date(),
          failureCode: "POLICY_CHANGED",
        },
      })
      return null
    }
    if (usage.reserved > effective.concurrency) {
      const active = await tx.catalogAiImageJob.count({
        where: {
          tenantId: job.tenantId,
          state: { in: ["DISPATCHING", "PENDING_REVIEW", "UNCERTAIN"] },
        },
      })
      if (active >= effective.concurrency) return null
    }
    await tx.catalogAiProviderCost.create({
      data: { id: job.id, reservedCostMicros: job.reservedCostMicros },
    })
    return tx.catalogAiImageJob.update({
      where: { id },
      data: {
        state: "DISPATCHING",
        dispatchToken: randomUUID(),
        dispatchedAt: new Date(),
      },
    })
  })
}
/** Final fence immediately before network dispatch. A pause may not cancel a call already admitted. */
export async function assertCatalogAiDispatch(
  db: PrismaClient,
  id: string,
  token: string,
) {
  return runInOwnTransaction(db, async (tx) => {
    await lockCatalogAiPolicy(tx)
    const job = await tx.catalogAiImageJob.findUnique({ where: { id } })
    if (
      !job ||
      job.dispatchToken !== token ||
      job.state !== "DISPATCHING" ||
      job.failureCode === "CANCEL_REQUESTED"
    )
      throw new CatalogAiError("CONFLICT", "Image request is no longer active.")
    await authorizeCatalogPhotoScope(tx, job)
    const { policy } = await loadCatalogAiPolicy(tx)
    requireEnabled(policy, job.tenantId)
    if (!(await roleAllowed(tx, job, policy)))
      throw new CatalogAiError("FORBIDDEN", "AI access changed.")
  })
}
export async function recordCatalogAiResponse(
  db: PrismaClient,
  input: {
    id: string
    token: string
    outputAssetId: string
    usage: CatalogAiTokenUsage | null
    requestId: string | null
  },
) {
  return runInOwnTransaction(db, async (tx) => {
    await lockCatalogAiPolicy(tx)
    const job = await tx.catalogAiImageJob.findUnique({
      where: { id: input.id },
    })
    if (
      !job ||
      job.dispatchToken !== input.token ||
      job.state !== "DISPATCHING"
    )
      throw new CatalogAiError("CONFLICT", "Image request changed.")
    const cost = input.usage
      ? catalogAiCostMicros(
          catalogAiPolicySchema.parse(job.policySnapshot),
          job.model,
          input.usage,
          job.createdAt,
        )
      : null
    if (job.failureCode === "CANCEL_REQUESTED") {
      await tx.catalogAiImageJob.update({
        where: { id: job.id },
        data: {
          state: "CANCELLED",
          completedAt: new Date(),
          failureCode: null,
        },
      })
      return null
    }
    return tx.catalogAiImageJob.update({
      where: { id: job.id },
      data: {
        state: "PENDING_REVIEW",
        outputAssetId: input.outputAssetId,
        costMicros: cost,
        usage: input.usage ?? Prisma.DbNull,
        providerRequestId: input.requestId,
      },
    })
  })
}
export async function failCatalogAiImage(
  db: PrismaClient,
  input: {
    id: string
    token: string
    uncertain: boolean
    beforeDispatch?: boolean
  },
) {
  return runInOwnTransaction(db, async (tx) => {
    await lockCatalogAiPolicy(tx)
    const job = await tx.catalogAiImageJob.findFirst({
      where: { id: input.id, dispatchToken: input.token, state: "DISPATCHING" },
      select: { failureCode: true },
    })
    if (!job) return
    const cancelled = job.failureCode === "CANCEL_REQUESTED" && !input.uncertain
    await tx.catalogAiImageJob.updateMany({
      where: { id: input.id, dispatchToken: input.token, state: "DISPATCHING" },
      data: {
        state: input.uncertain
          ? "UNCERTAIN"
          : cancelled
            ? "CANCELLED"
            : "FAILED",
        failureCode: input.uncertain
          ? "PROVIDER_OUTCOME_UNKNOWN"
          : cancelled
            ? null
            : "GENERATION_FAILED",
        completedAt: input.uncertain ? null : new Date(),
        ...(input.beforeDispatch ? { costMicros: 0 } : {}),
      },
    })
    if (input.beforeDispatch)
      await tx.catalogAiProviderCost.updateMany({
        where: { id: input.id },
        data: { costMicros: 0 },
      })
  })
}

export async function settleCatalogAiImage(db: PrismaClient, id: string) {
  return runInOwnTransaction(db, async (tx) => {
    await lockCatalogAiPolicy(tx)
    const job = await tx.catalogAiImageJob.findUnique({ where: { id } })
    if (!job || job.state !== "PENDING_REVIEW" || !job.outputAssetId) return
    if (!(await activeCatalogAiScope(tx, job))) {
      await tx.catalogAiImageJob.update({
        where: { id },
        data: {
          state: "FAILED",
          failureCode: "ACCESS_CHANGED",
          completedAt: new Date(),
        },
      })
      return
    }
    const asset = await tx.catalogPhotoAsset.findUnique({
      where: { id: job.outputAssetId },
    })
    if (!asset || ["REMOVED", "REJECTED"].includes(asset.state)) {
      await tx.catalogAiImageJob.update({
        where: { id },
        data: {
          state: "FAILED",
          failureCode: "IMAGE_CHECK_FAILED",
          completedAt: new Date(),
        },
      })
      return
    }
    if (asset.state !== "APPROVED") return
    const now = new Date()
    await tx.catalogPhotoAsset.update({
      where: { id: asset.id },
      data: { galleryAddedAt: now, expiresAt: CATALOG_GALLERY_KEEP_UNTIL },
    })
    await tx.catalogAiImageVersion.create({
      data: {
        assetId: asset.id,
        tenantId: job.tenantId,
        storeId: job.storeId,
        rootAssetId: job.rootAssetId ?? asset.id,
        sourceAssetId: job.sourceAssetId,
        jobId: job.id,
      },
    })
    await tx.catalogAiImageJob.update({
      where: { id },
      data: { state: "DELIVERED", deliveredAt: now, completedAt: now },
    })
  })
}
export async function catalogAiRecoveryCandidates(db: PrismaClient) {
  // Dispatch can have succeeded before a worker crash. Never resubmit it blindly.
  await db.catalogAiImageJob.updateMany({
    where: {
      state: "DISPATCHING",
      dispatchedAt: { lt: new Date(Date.now() - 10 * 60_000) },
    },
    data: { state: "UNCERTAIN", failureCode: "PROVIDER_OUTCOME_UNKNOWN" },
  })
  return db.catalogAiImageJob.findMany({
    where: { state: { in: ["QUEUED", "PENDING_REVIEW"] } },
    take: 8,
    orderBy: { createdAt: "asc" },
    select: { id: true, state: true },
  })
}

export async function assertCatalogAiAllowanceInTransaction(
  tx: Prisma.TransactionClient,
  tenantId: string,
  policy: CatalogAiPolicy,
  count = 1,
) {
  await lockCatalogAiPolicy(tx)
  const usage = await catalogAiUsage(tx, tenantId, policy)
  const effective = catalogAiEffectivePolicy(policy, tenantId)
  if (usage.remaining < count)
    throw new CatalogAiError(
      "LIMIT",
      count === 1
        ? "You have used your free generations."
        : "There are not enough generations left for these choices.",
    )
  if (usage.reserved >= effective.concurrency)
    throw new CatalogAiError(
      "LIMIT",
      "An image request is already in progress. Wait for it to finish.",
    )
  return usage
}
export async function recordCatalogAiProviderUsage(
  db: PrismaClient,
  input: {
    id: string
    token: string
    usage: CatalogAiTokenUsage | null
    requestId: string | null
  },
) {
  return runInOwnTransaction(db, async (tx) => {
    await lockCatalogAiPolicy(tx)
    const job = await tx.catalogAiImageJob.findFirst({
      where: { id: input.id, dispatchToken: input.token, state: "DISPATCHING" },
    })
    if (!job) throw new CatalogAiError("CONFLICT", "Image request changed.")
    const cost = input.usage
      ? catalogAiCostMicros(
          catalogAiPolicySchema.parse(job.policySnapshot),
          job.model,
          input.usage,
          job.createdAt,
        )
      : null
    await tx.catalogAiProviderCost.update({
      where: { id: job.id },
      data: { costMicros: cost, providerRequestId: input.requestId },
    })
    const cancelled = job.failureCode === "CANCEL_REQUESTED"
    await tx.catalogAiImageJob.update({
      where: { id: job.id },
      data: {
        costMicros: cost,
        usage: input.usage ?? Prisma.DbNull,
        providerRequestId: input.requestId,
        ...(cancelled
          ? { state: "CANCELLED", completedAt: new Date(), failureCode: null }
          : {}),
      },
    })
    return !cancelled
  })
}

export async function assertCatalogAiSpendInTransaction(
  tx: Prisma.TransactionClient,
  effective: { maxRequestMicros: number; dailyCapMicros: number },
  count = 1,
) {
  await lockCatalogAiPolicy(tx)
  // Unknown costs remain liabilities even across midnight and policy changes.
  const [spend] = await tx.$queryRaw<Array<{ micros: bigint }>>(Prisma.sql`
      SELECT COALESCE(SUM(CASE WHEN "costMicros" IS NULL THEN "reservedCostMicros" ELSE "costMicros" END),0)::bigint AS micros
      FROM (
        SELECT "costMicros","reservedCostMicros","createdAt" FROM "CatalogAiProviderCost"
        UNION ALL SELECT  NULL::int AS "costMicros","reservedCostMicros","createdAt" FROM "CatalogAiImageJob" WHERE "state"='QUEUED'
      ) liabilities WHERE "costMicros" IS NULL OR "createdAt">=date_trunc('day',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    `)
  if (
    (spend?.micros ?? 0n) + BigInt(effective.maxRequestMicros) * BigInt(count) >
    BigInt(effective.dailyCapMicros)
  )
    throw new CatalogAiError(
      "LIMIT",
      "AI generation is temporarily at its usage limit.",
    )
}
