export const INSURANCE_DOCUMENT_TITLES = [
  "Insurance",
  "General Liability Insurance",
  "Workers Compensation Insurance",
] as const

export type InsuranceRequirementState =
  | "valid"
  | "expiring_soon"
  | "pending"
  | "expired"
  | "rejected"
  | "missing"

export type InsuranceRequirement = {
  blocking: boolean
  expiresAt: string | null
  message: string
  state: InsuranceRequirementState
}

type InsuranceDocumentLike = {
  title?: string | null
  name?: string | null
  status?: string | null
  state?: string | null
  expiresAt?: string | Date | null
  expirationDate?: string | Date | null
  rejectedAt?: string | Date | null
  approvedAt?: string | Date | null
}

export function getInsuranceRequirement(
  documents: InsuranceDocumentLike[] = [],
): InsuranceRequirement {
  const insuranceDocument = documents.find(isInsuranceDocument)

  if (!insuranceDocument) {
    return {
      blocking: true,
      expiresAt: null,
      message: "Upload an insurance document before submitting work.",
      state: "missing",
    }
  }

  const status = String(
    insuranceDocument.status ?? insuranceDocument.state ?? "",
  ).toLowerCase()
  const expiresAt = normalizeDate(
    insuranceDocument.expiresAt ?? insuranceDocument.expirationDate,
  )

  if (status.includes("reject") || insuranceDocument.rejectedAt) {
    return {
      blocking: true,
      expiresAt,
      message: "Insurance document was rejected. Upload an updated document.",
      state: "rejected",
    }
  }

  if (
    status.includes("pending") ||
    (!status && !insuranceDocument.approvedAt)
  ) {
    return {
      blocking: true,
      expiresAt,
      message: "Insurance document is pending review.",
      state: "pending",
    }
  }

  if (expiresAt) {
    const expiryDate = new Date(expiresAt)
    const daysUntilExpiry =
      (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)

    if (daysUntilExpiry < 0) {
      return {
        blocking: true,
        expiresAt,
        message: "Insurance document has expired. Upload an updated document.",
        state: "expired",
      }
    }

    if (daysUntilExpiry <= 30) {
      return {
        blocking: false,
        expiresAt,
        message: "Insurance document is approved but expires soon.",
        state: "expiring_soon",
      }
    }
  }

  return {
    blocking: false,
    expiresAt,
    message: "Insurance document is approved.",
    state: "valid",
  }
}

function isInsuranceDocument(document: InsuranceDocumentLike) {
  const label = String(document.title ?? document.name ?? "").toLowerCase()
  return (
    label.includes("insurance") ||
    INSURANCE_DOCUMENT_TITLES.some((title) =>
      label.includes(title.toLowerCase()),
    )
  )
}

function normalizeDate(value?: string | Date | null) {
  if (!value) return null

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return date.toISOString()
}
