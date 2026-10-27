import { expect, test } from "bun:test"
import { WhatsAppProviderSendError } from "@ewatrade/communications"
import { renderManualPaymentReportAlert } from "@ewatrade/email"
import type { ManualPaymentAlertDispatchClaim } from "./manual-payment-alert-dispatch"
import { ManualPaymentAlertProviderRejected } from "./manual-payment-alert-dispatch"
import {
  createManualPaymentAlertProvider,
  manualPaymentAlertsEnabled,
} from "./manual-payment-alert-provider"

const claim: ManualPaymentAlertDispatchClaim = {
  tenantId: "tenant",
  intentId: "intent",
  claimId: "claim",
  channel: "whatsapp",
  destination: "+2348180000000",
  providerIdempotencyKey: "payment-alert-intent",
  content: {
    businessName: "QA shop",
    payerName: "Aisha",
    amountMinor: 500000,
    currencyCode: "NGN",
    orderNumber: "ORD-ABC",
    bankAccountName: "GTBank current",
    reportedAt: "27 Oct",
    reviewUrl: "https://dash.ewatrade.com/finance/payments?reportId=report",
  },
}
const env = {
  PAYMENT_REPORT_ALERTS_ENABLED: "true",
  PAYMENT_REPORT_WHATSAPP_ACCESS_TOKEN: "test-not-a-key",
  PAYMENT_REPORT_WHATSAPP_PHONE_NUMBER_ID: "123",
  PAYMENT_REPORT_WHATSAPP_TEMPLATE_NAME: "payment_report_review",
  PAYMENT_REPORT_WHATSAPP_TEMPLATE_LANGUAGE: "en",
}

test("unconfigured alerts cannot call a transport even when a plan enables the channel", async () => {
  let calls = 0
  const adapter = createManualPaymentAlertProvider({
    env: {},
    email: {
      send: async () => {
        calls++
        return { provider: "resend", providerMessageId: "mail" }
      },
    },
    assertProviderAllowed: async () => {
      calls++
    },
  })
  expect(manualPaymentAlertsEnabled({})).toBe(false)
  await expect(adapter.assertProviderAllowed(claim)).rejects.toThrow(
    "not enabled",
  )
  await expect(
    adapter.send({
      ...claim,
      ...renderManualPaymentReportAlert(claim.content),
    }),
  ).rejects.toThrow("not enabled")
  expect(calls).toBe(0)
})
test("WhatsApp uses configured notification template and private review target only", async () => {
  const sends: unknown[] = []
  const adapter = createManualPaymentAlertProvider({
    env,
    email: {
      send: async () => {
        throw Error("Email must not send")
      },
    },
    whatsapp: {
      sendTemplate: async (input) => {
        sends.push(input)
        return { messageId: "wamid.test" }
      },
    },
    assertProviderAllowed: async (input) => {
      expect(input.operation).toBe("whatsapp")
      expect(input.tenantId).toBe("tenant")
    },
  })
  await adapter.assertProviderAllowed(claim)
  expect(
    await adapter.send({
      ...claim,
      ...renderManualPaymentReportAlert(claim.content),
    }),
  ).toEqual({ providerMessageId: "wamid.test" })
  expect(sends).toEqual([
    expect.objectContaining({
      templateName: "payment_report_review",
      language: "en",
      to: claim.destination,
      components: [
        expect.objectContaining({
          type: "body",
          parameters: expect.arrayContaining([{ type: "text", text: "Aisha" }]),
        }),
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: "report" }],
        },
      ],
    }),
  ])
  expect(JSON.stringify(sends)).not.toContain("reportToken")
})
test("only definitive WhatsApp refusal is mapped to a safe rejection", async () => {
  for (const outcome of ["DEFINITE_FAILURE", "OUTCOME_UNKNOWN"] as const) {
    const adapter = createManualPaymentAlertProvider({
      env,
      email: { send: async () => undefined },
      whatsapp: {
        sendTemplate: async () => {
          throw new WhatsAppProviderSendError("PROVIDER_REJECTED", outcome)
        },
      },
      assertProviderAllowed: async () => undefined,
    })
    try {
      await adapter.send({
        ...claim,
        ...renderManualPaymentReportAlert(claim.content),
      })
      throw Error("Expected rejection")
    } catch (error) {
      expect(error instanceof ManualPaymentAlertProviderRejected).toBe(
        outcome === "DEFINITE_FAILURE",
      )
    }
  }
})
