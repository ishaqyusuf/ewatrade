import { Prisma } from "../../generated/prisma/client"
import type { DbClient } from "./types"

const offlineOperationsPolicySelect = {
  metadata: true,
  updatedAt: true,
} as const

function record(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {}
}

function serializeOfflineOperationsPolicy(policy: {
  metadata: Prisma.JsonValue | null
  updatedAt: Date
}) {
  const metadata = record(policy.metadata)
  return {
    enabled: metadata.offlineOperationsEnabled !== false,
    updatedAt: policy.updatedAt,
  }
}

export async function getOfflineOperationsPolicy(
  db: DbClient,
  input: { tenantId: string },
) {
  const policy = await db.tenant.findUnique({
    select: offlineOperationsPolicySelect,
    where: { id: input.tenantId },
  })

  return policy ? serializeOfflineOperationsPolicy(policy) : null
}

export async function updateOfflineOperationsPolicy(
  db: DbClient,
  input: { enabled: boolean; tenantId: string },
) {
  await db.$executeRaw(Prisma.sql`
    UPDATE "Tenant"
    SET
      "metadata" = jsonb_set(
        COALESCE("metadata", '{}'::jsonb),
        '{offlineOperationsEnabled}',
        to_jsonb(${input.enabled}::boolean),
        true
      ),
      "updatedAt" = NOW()
    WHERE "id" = ${input.tenantId}
  `)

  const policy = await getOfflineOperationsPolicy(db, {
    tenantId: input.tenantId,
  })
  if (!policy) {
    throw new Error("Tenant not found while updating offline access.")
  }
  return policy
}
