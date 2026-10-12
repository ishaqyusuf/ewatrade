import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import type { listStaffHistoryPage } from "@ewatrade/db/queries"
import { retailOpsStaffHistoryFiltersSchema } from "../schemas/retail-ops-staff-reads"

export const generalStaffHistoryInput = retailOpsStaffHistoryFiltersSchema

export function generalStaffHistoryAnswer(
  page: Awaited<ReturnType<typeof listStaffHistoryPage>>,
): GeneralAnswer {
  return {
    id: `staff_history_${crypto.randomUUID()}`,
    title: "Staff history",
    value:
      page.total === null
        ? `${page.knownMatchingEvents} known recorded events`
        : `${page.total} matching recorded events`,
    scope:
      page.scope === "recorded_store_access"
        ? "Business · recorded Store access changes"
        : "Business · staff lifecycle and access history",
    asOf: page.asOf,
    detail: `${page.data.map((event) => `${event.at} · ${event.subject.name ?? "Subject unavailable"} · ${event.eventType} · ${event.actor.name ? `by ${event.actor.name}` : "actor unavailable"} · ${event.source}`).join("; ") || "No matching events in the available recorded streams."} ${page.data.length} on this page. ${page.nextCursor ? "More recorded events; continue with the original filters/cursor." : "End of available recorded results."} ${page.total === null ? "A requested history stream is unavailable; the full matching total is unknown." : "Total counts recorded events, not people or reconstructed employment history."} ${page.coverage.detail}`,
  }
}
