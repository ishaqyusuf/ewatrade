import { z } from "zod"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import { ServiceJobLineStatus } from "../../generated/prisma/enums"
import {
  assertStaffStoreAccessAuthority,
  StaffStoreAccessError,
} from "./staff-store-access"

const id = z.string().trim().min(1).max(160)
export const staffAssignedServiceWorkInput = z
  .object({
    membershipId: id,
    storeId: id.optional(),
    limit: z.number().int().min(1).max(50).default(10),
  })
  .strict()
type Input = z.input<typeof staffAssignedServiceWorkInput> & {
  tenantId: string
  actorUserId: string
}
type Row = {
  totalCount: bigint
  asOf: Date
  jobId: string | null
  revision: number | null
  createdAt: Date | null
  priority: string | null
  storeId: string | null
  storeName: string | null
  storeStatus: string | null
}

/** Current assignee workload, not performed work or handover. Caller owns the transaction. */
export async function getStaffAssignedServiceWorkInTransaction(
  tx: Prisma.TransactionClient,
  input: Input,
) {
  const parsed = staffAssignedServiceWorkInput.parse({
    membershipId: input.membershipId,
    storeId: input.storeId,
    limit: input.limit,
  })
  const [tenant] = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Tenant" WHERE "id"=${input.tenantId} AND "isActive"=true FOR SHARE
  `
  if (!tenant)
    throw new StaffStoreAccessError(
      "FORBIDDEN",
      "This business is unavailable.",
    )
  await assertStaffStoreAccessAuthority(tx, input)
  const [member] = await tx.$queryRaw<Array<{ id: string; userId: string }>>`
    SELECT "id", "userId" FROM "Membership" WHERE "tenantId"=${input.tenantId}
      AND "id"=${parsed.membershipId} FOR SHARE
  `
  if (!member)
    throw new StaffStoreAccessError(
      "FORBIDDEN",
      "Staff membership is unavailable in this business.",
    )
  if (parsed.storeId) {
    const [store] = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Store" WHERE "tenantId"=${input.tenantId}
        AND "id"=${parsed.storeId} FOR SHARE
    `
    if (!store)
      throw new StaffStoreAccessError(
        "FORBIDDEN",
        "Store is unavailable in this business.",
      )
  }
  const selectedStore = parsed.storeId
    ? Prisma.sql`AND j."storeId"=${parsed.storeId}`
    : Prisma.empty
  // Same line predicate as listServiceWorkQueuePage; no clinical/customer graph.
  // One statement supplies count, bounded details and time, even at ReadCommitted.
  const records = await tx.$queryRaw<Row[]>(Prisma.sql`
    WITH matching AS MATERIALIZED (
      SELECT j."id" AS "jobId", j."revision", j."createdAt", j."priority",
        s."id" AS "storeId", s."name" AS "storeName", s."status" AS "storeStatus"
      FROM "ServiceJob" j JOIN "Store" s ON s."id"=j."storeId" AND s."tenantId"=${input.tenantId}
      WHERE j."tenantId"=${input.tenantId} AND j."currentAssigneeUserId"=${member.userId}
        ${selectedStore}
        AND EXISTS (
          SELECT 1 FROM "ServiceJobLine" l WHERE l."serviceJobId"=j."id"
            AND l."status" NOT IN (
              ${ServiceJobLineStatus.COMPLETED}::"ServiceJobLineStatus",
              ${ServiceJobLineStatus.CANCELLED}::"ServiceJobLineStatus"
            )
        )
    ), details AS (
      SELECT * FROM matching ORDER BY "priority" DESC, "createdAt" ASC, "jobId" ASC
      LIMIT ${parsed.limit + 1}
    )
    SELECT totals."totalCount", statement_timestamp() AS "asOf", details.*
    FROM (SELECT COUNT(*) AS "totalCount" FROM matching) totals
    LEFT JOIN details ON true
    ORDER BY details."priority" DESC, details."createdAt" ASC, details."jobId" ASC
  `)
  const snapshot = records[0]
  if (!snapshot)
    throw new Error("Assigned service-work snapshot is unavailable.")
  const count = Number(snapshot.totalCount)
  if (!Number.isSafeInteger(count) || count < 0)
    throw new Error(
      "Assigned service-work count cannot be represented exactly.",
    )
  const details = records.filter((row) => row.jobId !== null)
  const jobs = details.slice(0, parsed.limit).map((row) => {
    if (
      row.jobId === null ||
      row.revision === null ||
      row.createdAt === null ||
      row.priority === null ||
      row.storeId === null ||
      row.storeName === null ||
      row.storeStatus === null
    )
      throw new Error("Assigned service-work identity is incomplete.")
    return {
      jobId: row.jobId,
      revision: row.revision,
      createdAt: row.createdAt.toISOString(),
      priority: row.priority,
      storeId: row.storeId,
      storeName: row.storeName,
      storeStatus: row.storeStatus,
    }
  })
  return {
    membershipId: member.id,
    storeId: parsed.storeId ?? null,
    scope: parsed.storeId
      ? ("selected_store_current_assignee" as const)
      : ("all_business_stores_current_assignee" as const),
    count,
    jobs,
    shown: jobs.length,
    limit: parsed.limit,
    hasMore: details.length > parsed.limit,
    coverage: "available" as const,
    countCoverage: "complete" as const,
    detailsCoverage:
      count > jobs.length ? ("limited" as const) : ("complete" as const),
    attribution: "current_assignee" as const,
    definition:
      "Canonical paginated service queue: currentAssigneeUserId is this same-business member and at least one line is neither COMPLETED nor CANCELLED. QUEUED, IN_PROGRESS, BLOCKED and READY_FOR_HANDOFF qualify; archived same-business Stores remain visible. No due, priority or text filter is applied.",
    ambiguity:
      "The older unpaginated queue filters a derived whole-job summary. This read follows the paginated line predicate; job-level completed/cancelled timestamps do not replace line state.",
    asOf: snapshot.asOf.toISOString(),
    detail: `${count} outstanding job(s) currently assigned; showing ${jobs.length}. Current assignment does not prove performed work, historical sales attribution or a handover. Reassignment requires a separately reviewed service command.`,
    handover: "not_performed" as const,
    performedWork: "not_measured" as const,
    historicalSales: "excluded" as const,
  }
}

export function getStaffAssignedServiceWork(db: PrismaClient, input: Input) {
  return db.$transaction(
    (tx) => getStaffAssignedServiceWorkInTransaction(tx, input),
    {
      maxWait: 10_000,
      timeout: 30_000,
      isolationLevel: "RepeatableRead",
    },
  )
}
export type StaffAssignedServiceWork = Awaited<
  ReturnType<typeof getStaffAssignedServiceWorkInTransaction>
>
