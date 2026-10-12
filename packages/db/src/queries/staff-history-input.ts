import { createHash } from "node:crypto"
import { z } from "zod"
import { StaffDirectoryError } from "./staff-directory"

const id = z.string().trim().min(1).max(160)
export const lifecycleTypes = [
  "INVITED",
  "INVITE_REFRESHED",
  "INVITE_REVOKED",
  "ONBOARDING_COMPLETED",
  "SUSPENDED",
  "REACTIVATED",
  "REMOVED",
  "ROLE_CHANGED",
] as const
export const accessTypes = [
  "STORE_ACCESS_CONFIRMED",
  "STORE_ACCESS_CHANGED",
  "OTHER_STORE_ACCESS_CHANGE",
] as const
const filters = z.object({
  membershipId: id.optional(),
  actorMembershipId: id.optional(),
  storeId: id.optional(),
  stream: z.enum(["LIFECYCLE", "STORE_ACCESS"]).optional(),
  eventType: z.enum([...lifecycleTypes, ...accessTypes]).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
})
const historyPageFields = filters
  .extend({
    cursor: z.string().min(1).max(2048).optional(),
  })
  .strict()
function refineHistoryFilters(
  value: z.infer<typeof filters>,
  ctx: z.RefinementCtx,
) {
  if (value.from && value.to && new Date(value.from) >= new Date(value.to))
    ctx.addIssue({
      code: "custom",
      path: ["to"],
      message: "End must follow start; the end date is exclusive.",
    })
  const lifecycle = lifecycleTypes.includes(
    value.eventType as (typeof lifecycleTypes)[number],
  )
  if (
    value.eventType &&
    value.stream &&
    (value.stream === "LIFECYCLE") !== lifecycle
  )
    ctx.addIssue({
      code: "custom",
      path: ["eventType"],
      message: "Choose an event type from the selected history stream.",
    })
  if (
    value.storeId &&
    (value.stream === "LIFECYCLE" || (value.eventType && lifecycle))
  )
    ctx.addIssue({
      code: "custom",
      path: ["storeId"],
      message: "Business membership events have no recorded Store attribution.",
    })
}
export const staffHistoryFiltersInput =
  historyPageFields.superRefine(refineHistoryFilters)
export const staffHistoryPageInput = historyPageFields
  .extend({
    limit: z.number().int().min(1).max(100).default(25),
  })
  .superRefine(refineHistoryFilters)
type Scope = { tenantId: string; actorUserId: string }
export type StaffHistoryPageInput = z.infer<typeof staffHistoryPageInput> &
  Scope
export type Stream = "LIFECYCLE" | "STORE_ACCESS"
export type Position = { at: Date; id: string; stream: Stream }
const positionSchema = z
  .object({
    at: z.iso.datetime(),
    id,
    stream: z.enum(["LIFECYCLE", "STORE_ACCESS"]),
    filterKey: z.string().length(64),
  })
  .strict()

export function keyFor(input: StaffHistoryPageInput) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        tenantId: input.tenantId,
        ...filters.parse({
          membershipId: input.membershipId,
          actorMembershipId: input.actorMembershipId,
          storeId: input.storeId,
          stream: input.stream,
          eventType: input.eventType,
          from: input.from,
          to: input.to,
        }),
      }),
    )
    .digest("hex")
}
export function cursorPosition(
  cursor: string | undefined,
  filterKey: string,
): Position | undefined {
  if (!cursor) return undefined
  try {
    const value = positionSchema.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
    )
    if (value.filterKey !== filterKey) throw Error("Changed filters")
    return { at: new Date(value.at), id: value.id, stream: value.stream }
  } catch {
    throw new StaffDirectoryError(
      "BAD_REQUEST",
      "Continue with the original staff history filters and cursor.",
    )
  }
}
export function afterPosition(
  stream: Stream,
  after: Position | undefined,
  timeField: "happenedAt" | "createdAt",
) {
  if (!after) return {}
  const time = { [timeField]: { lt: after.at } }
  if (stream > after.stream) return { [timeField]: { lte: after.at } }
  if (stream < after.stream) return time
  return { OR: [time, { [timeField]: after.at, id: { lt: after.id } }] }
}
export function compareEvents(a: Position, b: Position) {
  // Stable sorting preserves each stream's SQL id order at equal timestamps.
  return b.at.getTime() - a.at.getTime() || a.stream.localeCompare(b.stream)
}
