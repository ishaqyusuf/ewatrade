import { useQueryStates } from "nuqs"
import { createLoader, parseAsString, parseAsStringEnum } from "nuqs/server"

export type PrescriptionSheetMode =
  | "attendant-review"
  | "details"
  | "intake"
  | "pharmacist-review"
  | "quote"

const PRESCRIPTION_SHEET_MODES: PrescriptionSheetMode[] = [
  "attendant-review",
  "details",
  "intake",
  "pharmacist-review",
  "quote",
]

const prescriptionParamsSchema = {
  prescriptionId: parseAsString,
  prescriptionSheet: parseAsStringEnum(PRESCRIPTION_SHEET_MODES),
}

export function usePrescriptionParams() {
  const [params, setParams] = useQueryStates(prescriptionParamsSchema)

  return {
    prescriptionId: params.prescriptionId,
    setParams,
    sheet: params.prescriptionSheet,
  }
}

export const loadPrescriptionParams = createLoader(prescriptionParamsSchema)
