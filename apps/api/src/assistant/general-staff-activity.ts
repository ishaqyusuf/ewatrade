import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import {
  type StaffActivityTarget,
  staffActivityTargetSchema,
} from "@ewatrade/assistant/general/staff-activity-target"
import type { listStaffActivityPage } from "@ewatrade/db/queries"
import { retailOpsStaffActivityPageSchema } from "../schemas/retail-ops-staff-reads"

export const generalStaffActivityInput = retailOpsStaffActivityPageSchema

type Page = Awaited<ReturnType<typeof listStaffActivityPage>>
type Event = Page["data"][number]
type Period = { from: string; to: string }
/** The tool input that produced the page, used to reopen exactly it. */
type Request = Period & {
  membershipId?: string
  storeId?: string
  stream?: StaffActivityTarget["filters"]["stream"]
  relation?: StaffActivityTarget["filters"]["relation"]
  catalogItemId?: string
  stockOperationType?: string
  cursor?: string
}
const relationLabel = {
  PERFORMED: "did",
  APPROVED: "approved",
  ASSIGNED: "was assigned",
} as const
const notIncludedLabel = {
  finance_actions: "Finance actions",
  sign_in_and_device_activity: "sign-ins",
  attendance_and_payroll: "attendance and payroll",
} as const
const detailLimit = 1000
/** The most rows a tool call asks for before fitting them to the card. */
export const staffActivityPageLimit = 10

/** Local wall-clock time in the request's own offset, e.g. "14:05". */
function clock(iso: string, offsetFrom: string) {
  const match = /([+-])(\d{2}):(\d{2})$/.exec(offsetFrom)
  const minutes = match
    ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]))
    : 0
  return new Date(new Date(iso).getTime() + minutes * 60_000)
    .toISOString()
    .slice(11, 16)
}
const clip = (text: string, length: number) =>
  text.length <= length ? text : `${text.slice(0, Math.max(0, length - 1))}…`
const minimumOutcome = 12

/**
 * One line per record. Time, relation and the canonical record label are never
 * shortened, so every record stays identifiable; the outcome (then long names
 * and Store) shrinks instead. Returns the line and its shortest possible length.
 */
const who = (event: Event) =>
  event.actor.coverage === "unknown"
    ? "Unknown (not recorded)"
    : event.actor.coverage === "unavailable"
      ? "Unavailable person"
      : (event.actor.name ?? "Unknown (not recorded)")
function line(event: Event, from: string, extra = 0) {
  const name = clip(who(event), 24)
  const place = event.store?.name ? ` · ${clip(event.store.name, 18)}` : ""
  const fixed = `${clock(event.at, from)} · ${name} ${relationLabel[event.relation]}: `
  const label = ` · ${event.record.label}`
  const outcome = clip(event.outcome, minimumOutcome + extra)
  return {
    text: `${fixed}${outcome}${label}${place}`,
    minimum:
      fixed.length +
      Math.min(event.outcome.length, minimumOutcome) +
      label.length +
      place.length,
  }
}

function notes(page: Page, shown: number) {
  const missing = page.coverage.notIncluded.map(
    (value) => notIncludedLabel[value],
  )
  return [
    `${shown} of ${page.total} shown${page.nextCursor ? "; ask to continue for the rest" : ""}. The total counts every matching record, not this page.`,
    shown < page.data.length
      ? "Some records did not fit this card; ask again with a narrower filter."
      : null,
    page.coverage.excluded.some((entry) => entry.stream === "PRICE_CHANGE")
      ? "Price changes apply to every Store, so a Store view leaves them out."
      : null,
    page.coverage.excluded.some((entry) => entry.stream === "FINANCE_POSTING")
      ? "Business-wide finance postings have no Store, so a Store view leaves them out."
      : null,
    page.coverage.unknownActors
      ? "Older records without a recorded person show as Unknown and are not counted for anyone."
      : null,
    missing.length
      ? `${missing.join(", ").replace(/^./, (first) => first.toUpperCase())} are not included.`
      : null,
  ]
    .filter(Boolean)
    .join("\n")
}

/** How many leading records fit the card whole, with their labels intact. */
export function staffActivityFitCount(page: Page, period: Period) {
  let used = 0
  let count = 0
  for (const event of page.data) {
    const next = used + line(event, period.from).minimum + 1
    if (next + notes(page, count + 1).length > detailLimit) break
    used = next
    count += 1
  }
  return count
}

/**
 * Reads a page whose every record fits the card. When ten records with long
 * labels do not fit, it asks again for fewer, so the returned cursor continues
 * exactly after the last record shown and nothing is skipped.
 */
export async function readFittedStaffActivityPage(
  read: (limit: number) => Promise<Page>,
  period: Period,
) {
  let limit = staffActivityPageLimit
  let page = await read(limit)
  for (let attempt = 0; attempt < 3; attempt++) {
    const fit = Math.max(1, staffActivityFitCount(page, period))
    if (fit >= page.data.length) return page
    limit = fit
    page = await read(limit)
  }
  return page
}

export function generalStaffActivityAnswer(
  page: Page,
  period: Request,
): GeneralAnswer {
  const shown = Math.min(page.data.length, staffActivityFitCount(page, period))
  const rows = page.data.slice(0, shown)
  const footer = notes(page, shown)
  // Share the space left after whole records and notes between outcomes.
  const minimum = rows.reduce(
    (sum, event) => sum + line(event, period.from).minimum + 1,
    0,
  )
  const extra = shown
    ? Math.max(0, Math.floor((detailLimit - footer.length - minimum) / shown))
    : 0
  const lines = rows.map((event) => line(event, period.from, extra).text)
  return {
    id: `staff_activity_${crypto.randomUUID()}`,
    title: "Staff activity",
    value: `${page.total} recorded ${page.total === 1 ? "action" : "actions"}`,
    scope: `${page.scope === "business" ? "Business · every Store" : "Store view"} · ${period.from} to ${period.to} (end exclusive)`,
    asOf: page.asOf,
    detail: [...lines, footer].join("\n"),
    // Open shows exactly these records, each linking to its original.
    ...(shown
      ? {
          target: staffActivityTargetSchema.parse({
            kind: "staff_activity",
            filters: {
              membershipId: period.membershipId,
              storeId: period.storeId,
              stream: period.stream,
              relation: period.relation,
              catalogItemId: period.catalogItemId,
              stockOperationType: period.stockOperationType,
              from: period.from,
              to: period.to,
            },
            cursor: period.cursor ?? null,
            limit: shown,
            shown: rows.map((event) => ({
              stream: event.stream,
              id: event.id,
              at: event.at,
              summary: clip(
                `${who(event)} ${relationLabel[event.relation]}: ${event.outcome}`,
                200,
              ),
              record: { ...event.record, label: clip(event.record.label, 120) },
            })),
          }),
        }
      : {}),
  }
}
