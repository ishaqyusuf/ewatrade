import { expect, test } from "bun:test"
import {
  manualPaymentReportReviewUrl,
  renderManualPaymentReportAlert,
} from "./manual-payment-report"

const content = {
  businessName: "QA shop",
  payerName: "<img src=x onerror=alert(1)>\nBcc:spam",
  amountMinor: 500000,
  currencyCode: "NGN",
  orderNumber: "ORD-ABC",
  bankAccountName: "GTBank current",
  reportedAt: "27 Oct 2026, 16:00 WAT",
  reviewUrl: manualPaymentReportReviewUrl(
    "https://dash.ewatrade.com",
    "report_1",
  ),
}
test("alert includes private web review, clear unverified claim, and no receipt or bank number", () => {
  const result = renderManualPaymentReportAlert(content)
  expect(result.subject).toBe("Payment reported · ORD-ABC · QA shop")
  expect(result.text).toContain("₦5,000.00")
  expect(result.text).toContain("unverified customer report")
  expect(result.text).toContain(
    "https://dash.ewatrade.com/finance/payments?reportId=report_1",
  )
  expect(result.html).toContain("&lt;img")
  expect(result.html).not.toContain("<img")
  expect(result.text).not.toContain("\nBcc:")
  expect(result.html).not.toContain("receipt")
})
test("review URL rejects credentials, proofs, foreign paths and extra parameters", () => {
  for (const origin of [
    "https://u:p@dash.ewatrade.com",
    "https://dash.ewatrade.com/pay/foo",
    "http://example.com",
    "https://dash.ewatrade.com?token=secret",
  ])
    expect(() => manualPaymentReportReviewUrl(origin, "report")).toThrow()
  expect(() =>
    manualPaymentReportReviewUrl(
      "https://dash.ewatrade.com",
      "report&token=secret",
    ),
  ).toThrow()
  for (const reviewUrl of [
    "https://dash.ewatrade.com/pay/proof",
    `${content.reviewUrl}&reportToken=secret`,
    `${content.reviewUrl}#proof`,
    "https://user:pass@dash.ewatrade.com/finance/payments?reportId=a",
  ])
    expect(() =>
      renderManualPaymentReportAlert({ ...content, reviewUrl }),
    ).toThrow()
  expect(() =>
    renderManualPaymentReportAlert({ ...content, amountMinor: 1.5 }),
  ).toThrow()
})
