import {
  type GeneralReceipt,
  generalMoney,
} from "@ewatrade/assistant/general/contracts"

// Receipts saved before 10 Oct 2026 (453837ec) wrote money as "NGN 300.00",
// with later amounts as bare "100.00". Saved receipts are never rewritten, so
// those details are read in the current ₦300.00 form instead.
const amount = "(-?\\d+\\.\\d{2})"
const legacyPayment = new RegExp(
  `^([A-Z]{3}) ${amount} · (.+) · remaining ${amount}$`,
)
const legacyOrder = new RegExp(
  `^(.+) · total ([A-Z]{3}) ${amount} · received ${amount} · remaining ${amount}$`,
)
const legacyPrice = new RegExp(`^(.+) · ([A-Z]{3}) ${amount}$`)

function groups(pattern: RegExp, detail: string) {
  const match = pattern.exec(detail)
  return match ? (match.slice(1) as string[]) : null
}

/** Legacy amounts were always (minor / 100).toFixed(2), so this is exact. */
const money = (major: string, currencyCode: string) =>
  generalMoney(major.replace(".", ""), currencyCode)

function currentDetail(receipt: GeneralReceipt & { detail: string }) {
  if (receipt.kind === "payment") {
    const m = groups(legacyPayment, receipt.detail)
    if (m) {
      const [code = "", paid = "", method = "", remaining = ""] = m
      return `${money(paid, code)} · ${method} · remaining ${money(remaining, code)}`
    }
  }
  if (receipt.kind === "order") {
    const m = groups(legacyOrder, receipt.detail)
    if (m) {
      const [order = "", code = "", total = "", received = "", remaining = ""] =
        m
      return `${order} · total ${money(total, code)} · received ${money(received, code)} · remaining ${money(remaining, code)}`
    }
  }
  if (receipt.kind === "product" && receipt.title === "Product price updated") {
    const m = groups(legacyPrice, receipt.detail)
    if (m) {
      const [item = "", code = "", price = ""] = m
      return `${item} · ${money(price, code)}`
    }
  }
  return receipt.detail
}

/** A saved receipt with pre-10 Oct money copy shown in the current form. */
export function currentGeneralReceipt(receipt: GeneralReceipt): GeneralReceipt {
  if (!("detail" in receipt) || typeof receipt.detail !== "string")
    return receipt
  const detail = currentDetail(receipt as GeneralReceipt & { detail: string })
  return detail === receipt.detail ? receipt : { ...receipt, detail }
}
