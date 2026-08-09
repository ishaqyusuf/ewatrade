import { useQueryStates } from "nuqs"
import {
  createLoader,
  parseAsArrayOf,
  parseAsString,
  parseAsStringEnum,
} from "nuqs/server"

export const PRESCRIPTION_STATUSES = [
  "received",
  "media_review",
  "needs_clearer_media",
  "transcribing",
  "attendant_verification",
  "pharmacist_review",
  "needs_clarification",
  "ready_to_quote",
  "quoted",
  "converted",
  "declined",
  "withdrawn",
  "expired",
] as const

export const PRESCRIPTION_SOURCES = [
  "web",
  "whatsapp",
  "staff_walk_in",
  "staff_phone",
] as const

export const PRESCRIPTION_SORT_FIELDS = [
  "created_at",
  "reference",
  "source",
  "status",
  "updated_at",
] as const

export type PrescriptionFilters = {
  assignees: string[] | null
  from: string | null
  q: string | null
  sort: [(typeof PRESCRIPTION_SORT_FIELDS)[number], "asc" | "desc"] | null
  sources: (typeof PRESCRIPTION_SOURCES)[number][] | null
  statuses: (typeof PRESCRIPTION_STATUSES)[number][] | null
  to: string | null
}

const prescriptionFilterParamsSchema = {
  prescriptionAssignees: parseAsArrayOf(parseAsString),
  prescriptionDirection: parseAsStringEnum(["asc", "desc"] as const),
  prescriptionFrom: parseAsString,
  prescriptionQuery: parseAsString,
  prescriptionSort: parseAsStringEnum<
    (typeof PRESCRIPTION_SORT_FIELDS)[number]
  >([...PRESCRIPTION_SORT_FIELDS]),
  prescriptionSources: parseAsArrayOf(
    parseAsStringEnum<(typeof PRESCRIPTION_SOURCES)[number]>([
      ...PRESCRIPTION_SOURCES,
    ]),
  ),
  prescriptionStatuses: parseAsArrayOf(
    parseAsStringEnum<(typeof PRESCRIPTION_STATUSES)[number]>([
      ...PRESCRIPTION_STATUSES,
    ]),
  ),
  prescriptionTo: parseAsString,
}

export function usePrescriptionFilterParams() {
  const [params, setParams] = useQueryStates(prescriptionFilterParamsSchema)
  const filter: PrescriptionFilters = {
    assignees: params.prescriptionAssignees,
    from: params.prescriptionFrom,
    q: params.prescriptionQuery,
    sort: params.prescriptionSort
      ? [params.prescriptionSort, params.prescriptionDirection ?? "desc"]
      : null,
    sources: params.prescriptionSources,
    statuses: params.prescriptionStatuses,
    to: params.prescriptionTo,
  }

  const setFilter = (values: Partial<PrescriptionFilters> | null) =>
    setParams(
      values === null
        ? {
            prescriptionAssignees: null,
            prescriptionDirection: null,
            prescriptionFrom: null,
            prescriptionQuery: null,
            prescriptionSort: null,
            prescriptionSources: null,
            prescriptionStatuses: null,
            prescriptionTo: null,
          }
        : {
            prescriptionAssignees: values.assignees,
            prescriptionDirection: values.sort?.[1],
            prescriptionFrom: values.from,
            prescriptionQuery: values.q,
            prescriptionSort: values.sort?.[0],
            prescriptionSources: values.sources,
            prescriptionStatuses: values.statuses,
            prescriptionTo: values.to,
          },
    )

  return {
    filter,
    hasFilters: Boolean(
      filter.assignees?.length ||
        filter.from ||
        filter.q ||
        filter.sort ||
        filter.sources?.length ||
        filter.statuses?.length ||
        filter.to,
    ),
    setFilter,
  }
}

const loadPrescriptionFilterState = createLoader(prescriptionFilterParamsSchema)

export async function loadPrescriptionFilterParams(
  searchParams: Parameters<typeof loadPrescriptionFilterState>[0],
): Promise<PrescriptionFilters> {
  const params = await loadPrescriptionFilterState(searchParams)
  return {
    assignees: params.prescriptionAssignees,
    from: params.prescriptionFrom,
    q: params.prescriptionQuery,
    sort: params.prescriptionSort
      ? [params.prescriptionSort, params.prescriptionDirection ?? "desc"]
      : null,
    sources: params.prescriptionSources,
    statuses: params.prescriptionStatuses,
    to: params.prescriptionTo,
  }
}
