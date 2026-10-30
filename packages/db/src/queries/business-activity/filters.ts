import { createHash } from "node:crypto"
import {
  type BusinessActivityFilterOptions,
  type BusinessEventType,
  businessActivityFiltersInput,
  businessEventCatalog,
  hasBusinessEventHandler,
  implementedBusinessEventHandlers,
} from "@ewatrade/notifications/business-events"
import { z } from "zod"
import { Prisma, type PrismaClient } from "../../../generated/prisma/client"
import { tracePhase } from "../../performance-tracing"
import { BusinessActivityError } from "./errors"
import {
  BUSINESS_ACTIVITY_READ_VERSION,
  businessActivitySources,
} from "./legacy"
import {
  type BusinessActivityViewer,
  businessActivityScope,
  businessActivityScopeSql,
} from "./scope"

const actorPosition = z
  .object({ id: z.string().min(1).max(160), filterKey: z.string().length(64) })
  .strict()

export async function getBusinessActivityFiltersInTransaction(
  tx: Prisma.TransactionClient,
  viewer: BusinessActivityViewer,
  raw: z.input<typeof businessActivityFiltersInput>,
): Promise<BusinessActivityFilterOptions> {
  const input = businessActivityFiltersInput.parse(raw)
  const scope = await businessActivityScope(tx, viewer)
  const filterKey = createHash("sha256")
    .update(
      JSON.stringify([
        BUSINESS_ACTIVITY_READ_VERSION,
        scope.signature,
        input.actorQuery ?? null,
      ]),
    )
    .digest("hex")
  let after: string | null = null
  if (input.actorCursor) {
    try {
      const parsed = actorPosition.parse(
        JSON.parse(
          Buffer.from(input.actorCursor, "base64url").toString("utf8"),
        ),
      )
      if (parsed.filterKey !== filterKey) throw Error("Changed actor choices")
      after = parsed.id
    } catch {
      throw new BusinessActivityError(
        "BAD_REQUEST",
        "Restart person search after changing Activity access.",
      )
    }
  }
  const pattern = input.actorQuery
    ? `%${input.actorQuery.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
    : null
  const knownTypes = Object.keys(implementedBusinessEventHandlers)
  // Keep both outputs bounded, and retain each branch's scope pushdown instead
  // of materializing every payload in the Business's history.
  const projection = await tracePhase(
    "activityFilterSql",
    () => tx.$queryRaw<
      Array<{
        actors: BusinessActivityFilterOptions["actors"]
        types: Array<{ type: string; recordingOrigin: string }>
      }>
    >`${businessActivitySources(scope, undefined, true)} SELECT
    COALESCE((SELECT jsonb_agg(actor ORDER BY actor."membershipId") FROM (
      SELECT DISTINCT m.id AS "membershipId", LEFT(COALESCE(NULLIF(u."displayName",''),u.name),240) AS name,
      m.role::text AS role, (m.status <> 'ACTIVE') AS "isFormer"
    FROM "activitySources" e JOIN "Membership" m ON m.id=e."actorMembershipId" AND m."tenantId"=e."tenantId"
    JOIN "User" u ON u.id=m."userId"
    WHERE ${businessActivityScopeSql(scope)} AND COALESCE(NULLIF(u."displayName",''),u.name) IS NOT NULL
      ${after ? Prisma.sql`AND m.id > ${after}` : Prisma.empty}
      ${pattern ? Prisma.sql`AND (u.name ILIKE ${pattern} OR u."displayName" ILIKE ${pattern})` : Prisma.empty}
      ORDER BY m.id ASC LIMIT 26
    ) actor),'[]'::jsonb) AS actors,
    COALESCE((SELECT jsonb_agg(choice ORDER BY choice.type,choice."recordingOrigin") FROM (
      SELECT DISTINCT e.type, CASE WHEN e."recordingOrigin"='legacy_fact' THEN 'legacy_fact' ELSE 'snapshot' END AS "recordingOrigin"
      FROM "activitySources" e WHERE ${businessActivityScopeSql(scope)} AND e.type IN (${Prisma.join(knownTypes)})
    ) choice),'[]'::jsonb) AS types`,
  )
  const rows = projection[0]?.actors ?? []
  const typeRows = projection[0]?.types ?? []
  const availability: Partial<
    Record<BusinessEventType, "recorded" | "legacy">
  > = {}
  for (const row of typeRows) {
    const type = row.type as BusinessEventType
    if (hasBusinessEventHandler(type)) {
      const legacy = row.recordingOrigin === "legacy_fact"
      if (!legacy || !availability[type])
        availability[type] = legacy ? "legacy" : "recorded"
    }
  }
  const types = businessEventCatalog(availability).filter((type) =>
    scope.manages
      ? scope.finance || type.category !== "finance"
      : type.category === "orders" || type.category === "payments",
  )
  const actors = rows.slice(0, 25)
  const last = actors.at(-1)
  return {
    types,
    stores: scope.stores.map(({ id, name }) => ({ id, name })),
    actors,
    actorNextCursor:
      rows.length > 25 && last
        ? Buffer.from(
            JSON.stringify({ id: last.membershipId, filterKey }),
          ).toString("base64url")
        : null,
    timeZone: scope.timeZone,
    scope: scope.manages
      ? "business"
      : scope.role === "CASHIER" || scope.role === "OPERATOR"
        ? "own"
        : "stores",
    canManageNotifications: scope.manages,
  }
}

export function getBusinessActivityFilters(
  db: PrismaClient,
  viewer: BusinessActivityViewer,
  input: z.input<typeof businessActivityFiltersInput>,
) {
  return tracePhase("activityFilters", () =>
    db.$transaction(
      (tx) => getBusinessActivityFiltersInTransaction(tx, viewer, input),
      { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 },
    ),
  )
}
