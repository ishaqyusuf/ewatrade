import type { PrescriptionRequestStatus } from "@ewatrade/prescriptions/schemas"
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
  status: PrescriptionRequestStatus | Uppercase<PrescriptionRequestStatus>,
): PrescriptionSheetMode {
  const normalizedStatus = status.toLowerCase() as PrescriptionRequestStatus
  return PRESCRIPTION_SHEET_MODE_BY_STATUS[normalizedStatus]
}

const PRESCRIPTION_SHEET_MODE_BY_STATUS = {
  attendant_verification: "attendant-review",
  converted: "details",
  declined: "details",
  expired: "details",
  media_review: "media-review",
  needs_clarification: "details",
  needs_clearer_media: "media-review",
  pharmacist_review: "pharmacist-review",
  quoted: "details",
  ready_to_quote: "quote",
  received: "media-review",
  transcribing: "details",
  withdrawn: "details",
} satisfies Record<PrescriptionRequestStatus, PrescriptionSheetMode>

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
