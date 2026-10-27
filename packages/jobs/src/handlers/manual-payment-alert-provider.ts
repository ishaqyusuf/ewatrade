import {
  DirectMetaWhatsAppProvider,
  type WhatsAppProvider,
  WhatsAppProviderSendError,
} from "@ewatrade/communications"
import {
  type EmailTransport,
  createManagedQaEmailMessages,
  getTestEmailRouting,
  isValidEmailSender,
} from "@ewatrade/email"
import { getQaPolicyEnvironment } from "@ewatrade/utils/qa-policy-server"
import {
  type ManualPaymentAlertDispatchDependencies,
  ManualPaymentAlertProviderRejected,
} from "./manual-payment-alert-dispatch"

type Environment = Record<string, string | undefined>
export function manualPaymentAlertsEnabled(env: Environment = process.env) {
  return env.PAYMENT_REPORT_ALERTS_ENABLED === "true"
}
function assertConfigured(env: Environment, channel: "email" | "whatsapp") {
  if (!manualPaymentAlertsEnabled(env))
    throw new Error("Payment alerts are not enabled.")
  if (channel === "email") {
    if (
      env.EMAIL_DELIVERY_MODE !== "live" ||
      !env.RESEND_API_KEY?.trim() ||
      env.EMAIL_CAPTURE_FILE?.trim() ||
      !isValidEmailSender(env.EMAIL_FROM)
    )
      throw new Error("Payment alert live email is unavailable.")
  } else if (
    !env.PAYMENT_REPORT_WHATSAPP_ACCESS_TOKEN?.trim() ||
    !/^\d+$/.test(env.PAYMENT_REPORT_WHATSAPP_PHONE_NUMBER_ID ?? "") ||
    !/^[a-z0-9_]{1,100}$/.test(
      env.PAYMENT_REPORT_WHATSAPP_TEMPLATE_NAME ?? "",
    ) ||
    !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(
      env.PAYMENT_REPORT_WHATSAPP_TEMPLATE_LANGUAGE ?? "",
    )
  )
    throw new Error("Payment alert WhatsApp template is unavailable.")
}

/** Separate notification configuration; never enables OTP, assistant or campaigns. */
export function createManualPaymentAlertProvider(input: {
  env: Environment
  email: EmailTransport
  whatsapp?: Pick<WhatsAppProvider, "sendTemplate">
  assertProviderAllowed(input: {
    tenantId: string
    operation: "email" | "whatsapp"
    qaEmailRouted?: boolean
  }): Promise<unknown>
}): Pick<
  ManualPaymentAlertDispatchDependencies,
  "assertProviderAllowed" | "send"
> {
  return {
    async assertProviderAllowed(claim) {
      assertConfigured(input.env, claim.channel)
      const routing =
        claim.channel === "email"
          ? getTestEmailRouting({
              to: claim.destination,
              env: await getQaPolicyEnvironment(input.env),
            })
          : null
      if (routing && routing.recipients.length !== 1)
        throw new Error("Payment alert requires one destination per intent.")
      await input.assertProviderAllowed({
        tenantId: claim.tenantId,
        operation: claim.channel,
        ...(routing ? { qaEmailRouted: routing.routed } : {}),
      })
    },
    async send(claim) {
      assertConfigured(input.env, claim.channel)
      if (claim.channel === "email") {
        const messages = await createManagedQaEmailMessages(
          {
            from: input.env.EMAIL_FROM ?? "",
            to: claim.destination,
            subject: claim.subject,
            text: claim.text,
            html: claim.html,
            idempotencyKey: claim.providerIdempotencyKey,
            tags: [{ name: "category", value: "manual_payment_report" }],
          },
          { env: input.env },
        )
        if (messages.length !== 1)
          throw new Error("Payment alert requires one destination per intent.")
        const message = messages[0]
        if (!message) throw new Error("Payment alert destination is missing.")
        const receipt = await input.email.send(message)
        if (receipt?.provider !== "resend" || !receipt.providerMessageId)
          throw new Error("Payment email acceptance is unconfirmed.")
        return { providerMessageId: receipt.providerMessageId }
      }
      const reportId = new URL(claim.content.reviewUrl).searchParams.get(
        "reportId",
      )
      if (!reportId) throw new Error("Payment alert review target is missing.")
      // Template contract: business, payer, amount, order, receiving label, time;
      // approved URL button points to the authenticated dashboard review route.
      const values = [
        claim.content.businessName,
        claim.content.payerName,
        new Intl.NumberFormat("en-NG", {
          style: "currency",
          currency: claim.content.currencyCode,
        }).format(claim.content.amountMinor / 100),
        claim.content.orderNumber,
        claim.content.bankAccountName,
        claim.content.reportedAt,
      ]
      try {
        const result = await (
          input.whatsapp ?? new DirectMetaWhatsAppProvider()
        ).sendTemplate({
          accessToken: input.env.PAYMENT_REPORT_WHATSAPP_ACCESS_TOKEN ?? "",
          phoneNumberId:
            input.env.PAYMENT_REPORT_WHATSAPP_PHONE_NUMBER_ID ?? "",
          templateName: input.env.PAYMENT_REPORT_WHATSAPP_TEMPLATE_NAME ?? "",
          language: input.env.PAYMENT_REPORT_WHATSAPP_TEMPLATE_LANGUAGE ?? "",
          to: claim.destination,
          components: [
            {
              type: "body",
              parameters: values.map((text) => ({
                type: "text",
                text: text.replace(/[\r\n]/g, " ").slice(0, 180),
              })),
            },
            {
              type: "button",
              sub_type: "url",
              index: "0",
              parameters: [{ type: "text", text: reportId }],
            },
          ],
        })
        return { providerMessageId: result.messageId }
      } catch (error) {
        if (
          error instanceof WhatsAppProviderSendError &&
          error.outcome === "DEFINITE_FAILURE"
        )
          throw new ManualPaymentAlertProviderRejected()
        throw error
      }
    },
  }
}
