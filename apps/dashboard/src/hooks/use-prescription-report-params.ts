import { useQueryStates } from "nuqs"
import { createLoader, parseAsString } from "nuqs/server"

const prescriptionReportParamsSchema = {
  prescriptionReportStore: parseAsString,
}

export function usePrescriptionReportParams() {
  const [params, setParams] = useQueryStates(prescriptionReportParamsSchema)
  return {
    setStoreId: (storeId: string | null) =>
      setParams({ prescriptionReportStore: storeId }),
    storeId: params.prescriptionReportStore,
  }
}

const loadPrescriptionReportState = createLoader(prescriptionReportParamsSchema)

export async function loadPrescriptionReportParams(
  searchParams: Parameters<typeof loadPrescriptionReportState>[0],
) {
  const params = await loadPrescriptionReportState(searchParams)
  return { storeId: params.prescriptionReportStore }
}
