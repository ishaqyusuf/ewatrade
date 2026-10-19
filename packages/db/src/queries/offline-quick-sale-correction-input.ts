import { catalogFreeLineDescriptionError } from "@ewatrade/utils/catalog-free-lines"
import { CatalogError } from "./catalog-errors"
import { isCustomOrderLineInput } from "./catalog-free-lines"
import type { OfflineCommandEnvelope } from "./offline-commands"

export type BlankQuickSaleCorrection = {
  replacementClientCommandId: string
  replacementClientPaymentId?: string
  descriptions: Array<{ lineIndex: number; description: string }>
}

function refuse() {
  return new CatalogError(
    "INVALID_ORDER",
    "Only missing Quick sale descriptions can be corrected. Keep the original sale and review its details.",
  )
}

function validIdentity(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 8 &&
    value.length <= 160 &&
    value.trim() === value
  )
}

/**
 * Derive a fresh envelope from the immutable original. Callers cannot supply a
 * replacement amount/account/customer/date/stock payload. Server admission and
 * non-application proof are separate from this pure description transformation.
 */
export function deriveBlankQuickSaleReplacement(
  original: OfflineCommandEnvelope,
  correction: BlankQuickSaleCorrection,
): OfflineCommandEnvelope {
  if (
    original.eventVersion !== 1 ||
    !validIdentity(correction.replacementClientCommandId) ||
    correction.replacementClientCommandId === original.clientCommandId ||
    original.dependencyClientIds.includes(original.clientCommandId) ||
    original.dependencyClientIds.includes(correction.replacementClientCommandId)
  )
    throw refuse()

  const payment = original.payload.initialPayment
  if (payment) {
    if (
      !validIdentity(correction.replacementClientPaymentId) ||
      correction.replacementClientPaymentId === payment.clientPaymentId
    )
      throw refuse()
  } else if (correction.replacementClientPaymentId !== undefined) throw refuse()

  const missing = original.payload.lines.flatMap((line, lineIndex) => {
    if (!isCustomOrderLineInput(line) || line.custom !== "quick_sale") return []
    if (line.description !== undefined && typeof line.description !== "string")
      throw refuse()
    return line.description?.trim() ? [] : [lineIndex]
  })
  if (!missing.length || correction.descriptions.length !== missing.length)
    throw refuse()
  const descriptions = new Map<number, string>()
  for (const entry of correction.descriptions) {
    if (
      !Number.isInteger(entry.lineIndex) ||
      !missing.includes(entry.lineIndex) ||
      descriptions.has(entry.lineIndex) ||
      typeof entry.description !== "string"
    )
      throw refuse()
    const description = entry.description.trim()
    if (catalogFreeLineDescriptionError({ kind: "quick_sale", description }))
      throw refuse()
    descriptions.set(entry.lineIndex, description)
  }

  const replacement = structuredClone(original)
  replacement.clientCommandId = correction.replacementClientCommandId
  replacement.payload.lines = replacement.payload.lines.map((line, index) => {
    const description = descriptions.get(index)
    return description === undefined ? line : { ...line, description }
  })
  if (replacement.payload.initialPayment) {
    const paymentId = correction.replacementClientPaymentId
    if (!validIdentity(paymentId)) throw refuse()
    replacement.payload.initialPayment.clientPaymentId = paymentId
  }
  return replacement
}
