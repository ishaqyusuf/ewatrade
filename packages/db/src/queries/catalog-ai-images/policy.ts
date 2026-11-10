import { createHash } from "node:crypto"
import {
  type CatalogAiPolicyWrite,
  catalogAiPolicySchema,
  catalogAiPolicyWriteSchema,
  emptyCatalogAiPolicy,
} from "@ewatrade/utils/catalog-ai-images"
import type { PrismaClient } from "../../../generated/prisma/client"
import { runInOwnTransaction } from "../own-transaction"
import type { DbClient } from "../types"

export class CatalogAiError extends Error {
  constructor(
    readonly code:
      | "BAD_REQUEST"
      | "FORBIDDEN"
      | "CONFLICT"
      | "UNAVAILABLE"
      | "LIMIT"
      | "NOT_FOUND",
    message: string,
  ) {
    super(message)
  }
}
export const catalogAiPolicyKey = "catalog-ai-images:v1"
// All admissions and policy writes serialize against the same bounded lock.
export async function lockCatalogAiPolicy(tx: DbClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(28410303)`
}
export async function loadCatalogAiPolicy(db: DbClient) {
  const row = await db.systemConfiguration.findUnique({
    where: { key: catalogAiPolicyKey },
  })
  if (!row) return { policy: emptyCatalogAiPolicy(), configured: false }
  const parsed = catalogAiPolicySchema.safeParse(row.value)
  if (!parsed.success || parsed.data.revision !== row.revision)
    throw new CatalogAiError("UNAVAILABLE", "AI settings are unavailable.")
  return { policy: parsed.data, configured: true }
}
export async function readCatalogAiPolicy(db: DbClient) {
  const state = await loadCatalogAiPolicy(db)
  const audit = await db.catalogAiPolicyCommand.findMany({
    take: 20,
    orderBy: { revision: "desc" },
    select: {
      id: true,
      actorId: true,
      reason: true,
      revision: true,
      createdAt: true,
    },
  })
  return { ...state, audit }
}
export async function saveCatalogAiPolicy(
  db: PrismaClient,
  input: CatalogAiPolicyWrite & { actorId: string },
) {
  const { actorId, ...body } = input
  if (!actorId.trim() || actorId.length > 128)
    throw new CatalogAiError("BAD_REQUEST", "Invalid actor.")
  const write = catalogAiPolicyWriteSchema.parse(body)
  const digest = createHash("sha256")
    .update(JSON.stringify({ actorId, ...write }))
    .digest("hex")
  return runInOwnTransaction(db, async (tx) => {
    await lockCatalogAiPolicy(tx)
    const replay = await tx.catalogAiPolicyCommand.findUnique({
      where: { id: write.commandId },
    })
    if (replay) {
      if (replay.digest !== digest || replay.actorId !== actorId)
        throw new CatalogAiError(
          "CONFLICT",
          "This command already has different settings.",
        )
      return {
        policy: catalogAiPolicySchema.parse(replay.result),
        configured: true,
        audit: await tx.catalogAiPolicyCommand.findMany({
          take: 20,
          orderBy: { revision: "desc" },
          select: {
            id: true,
            actorId: true,
            reason: true,
            revision: true,
            createdAt: true,
          },
        }),
      }
    }
    const prior = await loadCatalogAiPolicy(tx)
    if (
      prior.policy.revision !== write.expectedRevision ||
      write.policy.revision !== write.expectedRevision
    )
      throw new CatalogAiError(
        "CONFLICT",
        "Settings changed. Review the latest settings before saving.",
      )
    // A price/rate identity cannot be rewritten or removed after publication.
    for (const key of ["providerTokenRates", "customerPriceCatalog"] as const) {
      const next = write.policy[key]
      const old = prior.policy[key]
      for (const entry of old.entries) {
        const kept = next.entries.find((candidate) => candidate.id === entry.id)
        if (JSON.stringify(kept) !== JSON.stringify(entry))
          throw new CatalogAiError(
            "CONFLICT",
            "Published prices are immutable. Add a new version instead.",
          )
      }
      if (
        next.revision < old.revision ||
        (JSON.stringify(next.entries) !== JSON.stringify(old.entries) &&
          next.revision <= old.revision)
      )
        throw new CatalogAiError(
          "CONFLICT",
          "Increment the price catalog revision for new prices.",
        )
    }
    const policy = catalogAiPolicySchema.parse({
      ...write.policy,
      revision: write.expectedRevision + 1,
    })
    await tx.systemConfiguration.upsert({
      where: { key: catalogAiPolicyKey },
      create: {
        key: catalogAiPolicyKey,
        value: policy,
        revision: policy.revision,
      },
      update: { value: policy, revision: policy.revision },
    })
    await tx.catalogAiPolicyCommand.create({
      data: {
        id: write.commandId,
        actorId,
        digest,
        reason: write.reason,
        revision: policy.revision,
        result: policy,
      },
    })
    return readCatalogAiPolicy(tx)
  })
}
