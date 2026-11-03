import {
  DirectMetaWhatsAppProvider,
  type WhatsAppProvider,
  WhatsAppProviderSendError,
} from "@ewatrade/communications"
import { manualPaymentAlertsEnabled } from "./manual-payment-alert-provider"

type Environment = Record<string, string | undefined>

/**
 * Merchant-only WhatsApp result of a manual payment review (design 18.6,
 * bk-claim-outcome). It is sent from the existing payment-alert number with an
 * approved template because it is business-initiated. Default OFF: it needs the
 * existing alert switch, alert number credentials and its own template.
 *
 * Template contract (`PAYMENT_REPORT_OUTCOME_WHATSAPP_TEMPLATE`, utility):
 *   Body:   Payment review for {{1}}
 *           {{2}} · {{3}}
 *           {{4}}
 *           {{5}}
 *
 *           Nothing was sent to {{6}}. Share the customer message from the report in EwaTrade.
 *   Button: URL "Open report", same dashboard review route as the alert, suffix {{1}} = report id.
 * Values: business, headline, order number, amount line, balance/reason line,
 * payer first name. No payer phone, receipt, bank number or reference.
 */
export function paymentReportOutcomesEnabled(env: Environment = process.env) {
  return (
    manualPaymentAlertsEnabled(env) &&
    !!env.PAYMENT_REPORT_WHATSAPP_ACCESS_TOKEN?.trim() &&
    /^\d+$/.test(env.PAYMENT_REPORT_WHATSAPP_PHONE_NUMBER_ID ?? "") &&
    /^[a-z0-9_]{1,100}$/.test(
      env.PAYMENT_REPORT_OUTCOME_WHATSAPP_TEMPLATE ?? "",
    ) &&
    /^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(
      env.PAYMENT_REPORT_OUTCOME_WHATSAPP_TEMPLATE_LANGUAGE ?? "",
    )
  )
}

export type PaymentReportOutcomeContent = {
  reportId: string
  businessName: string
  orderNumber: string
  outcome: "CONFIRMED" | "NOT_RECEIVED"
  payerName: string
  currencyCode: string
  claimedAmountMinor: number
  receivedAmountMinor: number | null
  balanceMinor: number
  receivedAccountName: string | null
  reason: string | null
}

/** Meta rejects parameters with newlines, tabs or 4+ spaces; user text cannot add formatting. */
function plain(value: string, max: number) {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[*_~`]/g, "")
    .replace(/ {2,}/g, " ")
    .trim()
    .slice(0, max)
}
function param(value: string, max = 180) {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {4,}/g, " ")
    .trim()
    .slice(0, max)
}

export function formatOutcomeMoney(minor: number, currencyCode: string) {
  const whole = minor % 100 === 0
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(minor / 100)
}

export function paymentReportOutcomeTemplateValues(
  content: PaymentReportOutcomeContent,
) {
  const money = (minor: number) =>
    formatOutcomeMoney(minor, content.currencyCode)
  const order = plain(content.orderNumber, 40)
  const payer = plain(content.payerName, 60).split(" ")[0] || "the customer"
  const balance =
    content.balanceMinor > 0
      ? `*${money(content.balanceMinor)}* still to pay.`
      : `${order} is now *paid in full*.`
  if (content.outcome === "CONFIRMED") {
    const received = content.receivedAmountMinor ?? 0
    const account = content.receivedAccountName
      ? ` into ${plain(content.receivedAccountName, 60)}`
      : ""
    const claimed =
      received !== content.claimedAmountMinor
        ? ` (${payer} said ${money(content.claimedAmountMinor)})`
        : ""
    return [
      plain(content.businessName, 80),
      "✅ *Recorded in EwaTrade*",
      order,
      param(`*${money(received)}* received${account}${claimed}.`),
      param(balance),
      payer,
    ]
  }
  const reason = content.reason ? plain(content.reason, 160) : ""
  return [
    plain(content.businessName, 80),
    "❌ *Marked not received*",
    order,
    "Nothing was recorded.",
    param(
      `${content.balanceMinor > 0 ? balance : `Nothing is left to pay on ${order}.`}${reason ? ` Reason for ${payer}: _${reason}_` : ""}`,
      240,
    ),
    payer,
  ]
}

export type PaymentReportOutcomeIdentifier = {
  tenantId: string
  notificationId: string
}
export type PaymentReportOutcomeClaim = PaymentReportOutcomeIdentifier & {
  claimId: string
  destination: string
  content: PaymentReportOutcomeContent
}
export type PaymentReportOutcomeDependencies = {
  claim(
    input: PaymentReportOutcomeIdentifier,
  ): Promise<PaymentReportOutcomeClaim | null>
  assertProviderAllowed(claim: PaymentReportOutcomeClaim): Promise<void>
  start(claim: PaymentReportOutcomeClaim): Promise<boolean>
  finish(
    input: PaymentReportOutcomeClaim & {
      outcome: "accepted" | "rejected" | "cancelled" | "unknown"
      providerMessageId?: string
    },
  ): Promise<unknown>
  send(
    input: PaymentReportOutcomeClaim & { values: string[] },
  ): Promise<{ providerMessageId: string }>
}

/** Only a provider adapter with proof of nonacceptance may use this error. */
export class PaymentReportOutcomeProviderRejected extends Error {}

/** One fenced attempt; an uncertain provider result is never retried. */
export async function runPaymentReportOutcomeDispatch(
  input: PaymentReportOutcomeIdentifier,
  dependencies: PaymentReportOutcomeDependencies,
) {
  if (
    Object.keys(input).length !== 2 ||
    !input.tenantId ||
    !input.notificationId ||
    input.tenantId.length > 128 ||
    input.notificationId.length > 128
  )
    throw new Error("Invalid payment outcome identity.")
  const claim = await dependencies.claim(input)
  if (!claim) return { status: "skipped" as const }
  let values: string[]
  try {
    if (
      claim.tenantId !== input.tenantId ||
      claim.notificationId !== input.notificationId ||
      !claim.claimId
    )
      throw new Error("Payment outcome claim changed.")
    values = paymentReportOutcomeTemplateValues(claim.content)
    await dependencies.assertProviderAllowed(claim)
  } catch {
    await dependencies.finish({ ...claim, outcome: "cancelled" })
    return { status: "cancelled" as const }
  }
  if (!(await dependencies.start(claim))) return { status: "skipped" as const }
  let receipt: { providerMessageId: string }
  try {
    receipt = await dependencies.send({ ...claim, values })
    if (
      !receipt.providerMessageId?.trim() ||
      receipt.providerMessageId.length > 512
    )
      throw new Error("Provider acceptance is unconfirmed.")
  } catch (error) {
    const outcome =
      error instanceof PaymentReportOutcomeProviderRejected
        ? "rejected"
        : "unknown"
    await dependencies.finish({ ...claim, outcome })
    return { status: outcome }
  }
  await dependencies.finish({
    ...claim,
    outcome: "accepted",
    providerMessageId: receipt.providerMessageId,
  })
  return { status: "accepted" as const }
}

/** Existing alert number and credentials; only the template differs. */
export function createPaymentReportOutcomeProvider(input: {
  env: Environment
  whatsapp?: Pick<WhatsAppProvider, "sendTemplate">
  assertProviderAllowed(input: {
    tenantId: string
    operation: "whatsapp"
  }): Promise<unknown>
}): Pick<PaymentReportOutcomeDependencies, "assertProviderAllowed" | "send"> {
  const assertConfigured = () => {
    if (!paymentReportOutcomesEnabled(input.env))
      throw new Error("Payment outcome messages are not enabled.")
  }
  return {
    async assertProviderAllowed(claim) {
      assertConfigured()
      await input.assertProviderAllowed({
        tenantId: claim.tenantId,
        operation: "whatsapp",
      })
    },
    async send(claim) {
      assertConfigured()
      if (claim.values.length !== 6 || claim.values.some((value) => !value))
        throw new PaymentReportOutcomeProviderRejected()
      try {
        const result = await (
          input.whatsapp ?? new DirectMetaWhatsAppProvider()
        ).sendTemplate({
          accessToken: input.env.PAYMENT_REPORT_WHATSAPP_ACCESS_TOKEN ?? "",
          phoneNumberId:
            input.env.PAYMENT_REPORT_WHATSAPP_PHONE_NUMBER_ID ?? "",
          templateName:
            input.env.PAYMENT_REPORT_OUTCOME_WHATSAPP_TEMPLATE ?? "",
          language:
            input.env.PAYMENT_REPORT_OUTCOME_WHATSAPP_TEMPLATE_LANGUAGE ?? "",
          to: claim.destination,
          components: [
            {
              type: "body",
              parameters: claim.values.map((text) => ({ type: "text", text })),
            },
            {
              type: "button",
              sub_type: "url",
              index: "0",
              parameters: [{ type: "text", text: claim.content.reportId }],
            },
          ],
        })
        return { providerMessageId: result.messageId }
      } catch (error) {
        if (
          error instanceof WhatsAppProviderSendError &&
          error.outcome === "DEFINITE_FAILURE"
        )
          throw new PaymentReportOutcomeProviderRejected()
        throw error
      }
    },
  }
}
