import { useQueryStates } from "nuqs"
import { createLoader, parseAsString, parseAsStringEnum } from "nuqs/server"

export type PrescriptionSheetMode =
  | "attendant-review"
  | "details"
  | "intake"
  | "media-review"
  | "pharmacist-review"
  | "quote"
  | "success"

const PRESCRIPTION_SHEET_MODES: PrescriptionSheetMode[] = [
  "attendant-review",
  "details",
  "intake",
  "media-review",
  "pharmacist-review",
  "quote",
  "success",
]

export function prescriptionSheetModeForStatus(
  status: string,
): PrescriptionSheetMode {
  if (["received", "media_review", "needs_clearer_media"].includes(status)) {
    return "media-review"
  }
  if (status === "attendant_verification") return "attendant-review"
  if (status === "pharmacist_review") return "pharmacist-review"
  if (status === "ready_to_quote") return "quote"
  return "details"
}

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
