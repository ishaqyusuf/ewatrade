import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import type { RefundDetail } from "./refund-request-model"

/**
 * Editable customer message for a saved, completed refund, or null when the
 * server hasn't recorded the return. Only the saved result is used: amount,
 * currency, customer name and the outgoing bank reference. No destination,
 * internal IDs or balances. `completedAt` is when the return was recorded,
 * not when the transfer left the bank, so the message gives no time.
 */
export function refundCustomerNotice(
  detail: Pick<
    RefundDetail,
    | "status"
    | "amountMinor"
    | "currencyCode"
    | "customerName"
    | "completedAt"
    | "refundEntryId"
    | "outgoingReference"
  >,
) {
  const reference = detail.outgoingReference?.trim()
  if (
    detail.status !== "COMPLETED" ||
    !detail.completedAt ||
    !detail.refundEntryId ||
    !reference ||
    !/^[1-9]\d*$/.test(detail.amountMinor)
  )
    return null
  const amount = formatFinanceMoney(
    detail.amountMinor,
    detail.currencyCode,
  ).replace(/\.00$/, "")
  const name = detail.customerName.trim()
  return `${name ? `Hi ${name}, your` : "Your"} ${amount} refund has been returned to your bank account. Bank reference: ${reference}.`
}

/**
 * Editable draft asking the customer for the details named in the saved
 * review note, or null unless the server shows a current details request on a
 * still-requested refund. Saving the note sent nothing to the customer.
 */
export function refundDetailsDraft(
  detail: Pick<
    RefundDetail,
    | "status"
    | "reviewState"
    | "reviewNote"
    | "amountMinor"
    | "currencyCode"
    | "customerName"
  >,
) {
  const note = detail.reviewNote?.trim()
  if (
    detail.status !== "REQUESTED" ||
    detail.reviewState !== "NEEDS_DETAILS" ||
    !note ||
    !/^[1-9]\d*$/.test(detail.amountMinor)
  )
    return null
  const amount = formatFinanceMoney(
    detail.amountMinor,
    detail.currencyCode,
  ).replace(/\.00$/, "")
  const name = detail.customerName.trim()
  return `${name ? `Hi ${name}, before` : "Before"} we can return your ${amount} refund, we need a few more details: ${note}`
}
