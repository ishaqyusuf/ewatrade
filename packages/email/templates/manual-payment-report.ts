export type ManualPaymentReportAlertContent = {
  businessName: string
  payerName: string
  amountMinor: number
  currencyCode: string
  orderNumber: string
  bankAccountName: string
  reportedAt: string
  reviewUrl: string
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ] ?? char,
  )
}
function line(value: string) {
  return Array.from(value, (char) =>
    char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? " " : char,
  )
    .join("")
    .trim()
    .slice(0, 180)
}

/** Authenticated merchant page, never the public payment link or report proof. */
export function manualPaymentReportReviewUrl(origin: string, reportId: string) {
  const base = new URL(origin)
  if (
    (base.protocol !== "https:" &&
      !(base.protocol === "http:" && base.hostname.endsWith(".localhost"))) ||
    base.username ||
    base.password ||
    base.pathname !== "/" ||
    base.search ||
    base.hash ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(reportId)
  )
    throw new Error("The authenticated payment review address is unavailable.")
  const url = new URL("/finance/payments", base)
  url.searchParams.set("reportId", reportId)
  return url.toString()
}

export function renderManualPaymentReportAlert(
  input: ManualPaymentReportAlertContent,
) {
  if (
    !Number.isSafeInteger(input.amountMinor) ||
    input.amountMinor <= 0 ||
    !/^[A-Z]{3}$/.test(input.currencyCode)
  )
    throw new Error("Payment alert amount is invalid.")
  const url = new URL(input.reviewUrl)
  if (
    url.pathname !== "/finance/payments" ||
    url.searchParams.size !== 1 ||
    !url.searchParams.has("reportId") ||
    url.hash ||
    url.username ||
    url.password ||
    !["https:", "http:"].includes(url.protocol) ||
    (url.protocol === "http:" && !url.hostname.endsWith(".localhost"))
  )
    throw new Error("Payment alert review link is invalid.")
  const business = line(input.businessName)
  const payer = line(input.payerName)
  const order = line(input.orderNumber)
  const bank = line(input.bankAccountName)
  const amount = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: input.currencyCode,
  }).format(input.amountMinor / 100)
  const subject = `Payment reported · ${order} · ${business}`
  const text = `Payment notification from ${payer}. ${amount} for order ${order}.\n\nBusiness: ${business}\nReceiving account: ${bank}\nReported: ${line(input.reportedAt)}\n\nThis is an unverified customer report. Check your bank before recording any payment.\nOpen payment review: ${url.toString()}`
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#17221e"><h2 style="color:#124d3e">Payment to check</h2><p>${escapeHtml(payer)} reported <strong>${escapeHtml(amount)}</strong> for order <strong>${escapeHtml(order)}</strong>.</p><p>${escapeHtml(business)}<br>Receiving account: ${escapeHtml(bank)}<br>Reported: ${escapeHtml(line(input.reportedAt))}</p><p>This is an unverified customer report. Check your bank before recording any payment.</p><p><a href="${escapeHtml(url.toString())}" style="display:inline-block;background:#124d3e;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px">Open payment review</a></p></div>`
  return { subject, text, html }
}
