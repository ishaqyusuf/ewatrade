import { z } from "zod"
import type { GeneralAction } from "./contracts"
import {
  type JsonNode,
  branches,
  schemaParents,
  visitDraftPath,
} from "./stated-money"

/**
 * Times the merchant states ("this morning", "due Friday") reach draftAction
 * as local business wall-clock time and the server applies the time zone.
 * Asked for UTC, DeepSeek wrote 17:50 in Lagos as 17:50Z, an hour ahead, and
 * finance refused the expense as future-dated (12 Oct 2026).
 */
type ActionName = GeneralAction["action"]

/** Every date-time draft field, by path (`[]` = each array item). */
export const statedTimeFields = {
  expense_record: ["incurredAt", "dueAt", "payment.effectiveAt"],
  bill_payment: ["effectiveAt"],
  expense_void: ["effectiveAt"],
  bill_payment_reverse: ["effectiveAt"],
  money_movement: ["effectiveAt"],
  held_credit_refund: ["effectiveAt"],
  cash_count_record: ["asOf"],
  stock_receive: ["effectiveAt"],
  stock_adjust: ["effectiveAt"],
  order_metadata_update: ["patch.deliveryDueAt"],
  service_intake: ["requestedAt", "dueCommitmentAt"],
  service_job_reschedule: ["promisedAt"],
  purchase_register: ["agreedAt"],
  purchase_record: ["incurredAt", "dueAt"],
  purchase_recognize: ["effectiveAt", "dueAt"],
  purchase_payment: ["effectiveAt"],
  purchase_recognition_reverse: ["effectiveAt"],
  purchase_payment_reverse: ["effectiveAt"],
  supplier_advance: ["effectiveAt"],
  supplier_advance_allocate: ["effectiveAt"],
  supplier_allocation_release: ["effectiveAt"],
  supplier_entry_reverse: ["effectiveAt"],
} as const satisfies Partial<Record<ActionName, readonly string[]>>

const localPattern =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?)?$/
const offsetPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?[+-]\d{2}:\d{2}$/
const bare = (pattern: RegExp) => pattern.source.slice(1, -1)
export const statedTimePattern = new RegExp(
  `^(?:${bare(localPattern)}|${bare(offsetPattern)})$`,
)
export const statedTimeDescription =
  'Local business date and time as the user means it, with no time zone: "2026-10-12T08:30" (a date alone is the start of that day). The server applies the business time zone. Never add Z.'

/** Minutes the zone is ahead of UTC at `instant`. */
function zoneOffsetMinutes(instant: number, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, Number(part.value)]),
  )
  const wall = Date.UTC(
    parts.year ?? 0,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  )
  return Math.round((wall - Math.floor(instant / 1000) * 1000) / 60_000)
}

/** "2026-10-12T17:50" in Africa/Lagos → "2026-10-12T16:50:00.000Z". */
export function statedTimeToUtc(value: string, timeZone: string) {
  const trimmed = value.trim()
  if (offsetPattern.test(trimmed)) return new Date(trimmed).toISOString()
  const match = localPattern.exec(trimmed)
  if (!match) throw Error(`Not a local date-time: ${value}`)
  const [, year, month, day, hour = "0", minute = "0", second = "0"] = match
  const wall = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  )
  // Twice, so a wall time next to a daylight-saving change uses its own offset.
  let instant = wall - zoneOffsetMinutes(wall, timeZone) * 60_000
  instant = wall - zoneOffsetMinutes(instant, timeZone) * 60_000
  return new Date(instant).toISOString()
}

const fieldsFor = (action: unknown) =>
  typeof action === "string" && action in statedTimeFields
    ? statedTimeFields[action as keyof typeof statedTimeFields].map((path) => {
        const segments = path.split(".")
        return { segments, key: segments.at(-1) ?? path }
      })
    : []

/**
 * Turns the model's local draft times into the canonical UTC instants.
 * Throws a ZodError for a `Z` time, whose meaning the model gets wrong.
 */
export function canonicalStatedTimeDraft(
  input: unknown,
  timeZone: string,
): unknown {
  if (!input || typeof input !== "object" || !("action" in input)) return input
  const fields = fieldsFor(input.action)
  if (!fields.length) return input
  const draft = structuredClone(input) as Record<string, unknown>
  for (const field of fields)
    visitDraftPath(draft, field.segments, [], (parent, path) => {
      const value = parent[field.key]
      if (typeof value !== "string") return
      if (!statedTimePattern.test(value.trim()))
        throw new z.ZodError([
          {
            code: "custom",
            path: [...path, field.key],
            input: value,
            message: `Write ${field.key} as local business time with no time zone, e.g. "2026-10-12T08:30"; never add Z.`,
          },
        ])
      parent[field.key] = statedTimeToUtc(value, timeZone)
    })
  return draft
}

/** Rehearsal drafts carry UTC instants; send them with an explicit offset. */
export function statedTimeFromCanonical(input: unknown): unknown {
  if (!input || typeof input !== "object" || !("action" in input)) return input
  const fields = fieldsFor(input.action)
  if (!fields.length) return input
  const draft = structuredClone(input) as Record<string, unknown>
  for (const field of fields)
    visitDraftPath(draft, field.segments, [], (parent) => {
      const value = parent[field.key]
      if (typeof value === "string" && value.endsWith("Z"))
        parent[field.key] = `${value.slice(0, -1)}+00:00`
    })
  return draft
}

/** Rewrites the draftAction JSON schema so stated times read as local. */
export function statedTimeJsonSchema<T extends object>(schema: T): T {
  const root = structuredClone(schema) as JsonNode
  for (const action of branches(root))
    for (const field of fieldsFor(action.properties?.action?.const))
      for (const node of schemaParents(action, field.segments)) {
        const property = node.properties?.[field.key]
        if (!property || !node.properties) continue
        node.properties[field.key] = {
          type: "string",
          pattern: statedTimePattern.source,
          description: statedTimeDescription,
          ...(property.type === "null" ||
          branches(property).some((branch) => branch.type === "null")
            ? { type: ["string", "null"] }
            : {}),
        }
      }
  return root as T
}
