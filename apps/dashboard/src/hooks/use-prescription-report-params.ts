import { useQueryStates } from "nuqs"
import { createLoader, parseAsString, parseAsStringEnum } from "nuqs/server"

export const PRESCRIPTION_REPORT_TABS = [
  "lifecycle",
  "quotes",
  "costs",
  "stores",
] as const

export type PrescriptionReportTab = (typeof PRESCRIPTION_REPORT_TABS)[number]

export function isPrescriptionReportTab(
  value: unknown,
): value is PrescriptionReportTab {
  return PRESCRIPTION_REPORT_TABS.some((tab) => tab === value)
}

const prescriptionReportParamsSchema = {
  prescriptionReportStore: parseAsString,
  prescriptionReportTab: parseAsStringEnum([...PRESCRIPTION_REPORT_TABS]),
}

export function usePrescriptionReportParams() {
  const [params, setParams] = useQueryStates(prescriptionReportParamsSchema)
  return {
    setStoreId: (storeId: string | null) =>
      setParams({ prescriptionReportStore: storeId }),
    /** Tabs are user navigation, so they create a history entry. */
    setTab: (tab: PrescriptionReportTab) =>
      setParams(
        { prescriptionReportTab: tab === "lifecycle" ? null : tab },
        { history: "push" },
      ),
    storeId: params.prescriptionReportStore,
    tab: params.prescriptionReportTab ?? "lifecycle",
  }
}

const loadPrescriptionReportState = createLoader(prescriptionReportParamsSchema)

export async function loadPrescriptionReportParams(
  searchParams: Parameters<typeof loadPrescriptionReportState>[0],
) {
  const params = await loadPrescriptionReportState(searchParams)
  return {
    storeId: params.prescriptionReportStore,
    tab: params.prescriptionReportTab ?? "lifecycle",
  }
}
