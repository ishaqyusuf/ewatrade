import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import type { listStaffHistoryPage } from "@ewatrade/db/queries"
import { retailOpsStaffHistoryFiltersSchema } from "../schemas/retail-ops-staff-reads"

export const generalStaffHistoryInput = retailOpsStaffHistoryFiltersSchema

export function generalStaffHistoryAnswer(
  page: Awaited<ReturnType<typeof listStaffHistoryPage>>,
  filters: Parameters<typeof generalStaffHistoryInput.parse>[0] = {},
): GeneralAnswer {
  return {
    target: {
      kind: "staff_history",
      filters: generalStaffHistoryInput.parse(filters),
    },
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
    detail: `${page.data.length} recorded events on this page. ${page.nextCursor ? "More recorded events; continue with the original filters/cursor." : "End of available recorded results."} ${page.total === null ? "A requested history stream is unavailable; the full matching total is unknown." : "Total counts recorded events, not people or reconstructed employment history."} ${page.coverage.detail} Open history for original before/after, actor, timestamp and source.`,
  }
}
