import { describe, expect, test } from "bun:test"
import {
  DirectMetaWhatsAppProvider,
  WhatsAppProviderSendError,
} from "./whatsapp"
import {
  createWhatsAppOtpSender,
  normalizeWhatsAppOtpRecipient,
  readWhatsAppOtpConfig,
} from "./whatsapp-otp"

const config = {
  accessToken: "private-test-token",
  phoneNumberId: "123456789",
  templateName: "ewatrade_verification",
  language: "en_US",
}
const env = {
  WHATSAPP_OTP_ENABLED: "true",
  WHATSAPP_OTP_ACCESS_TOKEN: config.accessToken,
  WHATSAPP_OTP_PHONE_NUMBER_ID: config.phoneNumberId,
  WHATSAPP_OTP_TEMPLATE_NAME: config.templateName,
  WHATSAPP_OTP_TEMPLATE_LANGUAGE: config.language,
}

describe("platform WhatsApp OTP delivery", () => {
  test("stays disabled unless explicitly enabled and refuses incomplete configuration", () => {
    expect(readWhatsAppOtpConfig({})).toBeNull()
    expect(
      readWhatsAppOtpConfig({ ...env, WHATSAPP_OTP_ENABLED: "false" }),
    ).toBeNull()
    expect(readWhatsAppOtpConfig(env)).toEqual(config)
    for (const key of [
      "WHATSAPP_OTP_ACCESS_TOKEN",
      "WHATSAPP_OTP_PHONE_NUMBER_ID",
      "WHATSAPP_OTP_TEMPLATE_NAME",
      "WHATSAPP_OTP_TEMPLATE_LANGUAGE",
    ]) {
      expect(() => readWhatsAppOtpConfig({ ...env, [key]: "" })).toThrow(
        "configuration is incomplete or invalid",
      )
    }
    expect(() =>
      readWhatsAppOtpConfig({
        ...env,
        WHATSAPP_OTP_PHONE_NUMBER_ID: "../messages",
      }),
    ).toThrow()
  })

  test("sends the same code in the authentication body and copy-code button", async () => {
    let calls = 0
    const mockedFetch: typeof fetch = Object.assign(
      async (url: string | URL | Request, init?: RequestInit) => {
        calls += 1
        expect(String(url)).toBe(
          "https://graph.facebook.com/v21.0/123456789/messages",
        )
        expect(init?.method).toBe("POST")
        expect(new Headers(init?.headers).get("Authorization")).toBe(
          "Bearer private-test-token",
        )
        expect(JSON.parse(String(init?.body))).toEqual({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          type: "template",
          to: "2348000000000",
          template: {
            name: "ewatrade_verification",
            language: { code: "en_US" },
            components: [
              { type: "body", parameters: [{ type: "text", text: "012345" }] },
              {
                type: "button",
                sub_type: "url",
                index: "0",
                parameters: [{ type: "text", text: "012345" }],
              },
            ],
          },
        })
        return Response.json({ messages: [{ id: "wamid.otp" }] })
      },
      { preconnect: () => undefined },
    )
    const sender = createWhatsAppOtpSender(
      config,
      new DirectMetaWhatsAppProvider({ fetch: mockedFetch }),
    )
    expect(await sender({ code: "012345", phone: "+2348000000000" })).toEqual({
      messageId: "wamid.otp",
    })
    expect(calls).toBe(1)
  })

  test("rejects invalid codes and ambiguous recipients before provider contact", async () => {
    let calls = 0
    const sender = createWhatsAppOtpSender(config, {
      async sendTemplate() {
        calls += 1
        return { messageId: "unexpected" }
      },
    })
    for (const phone of [
      "08000000000",
      "2348000000000",
      "+0000000000",
      "+2348000000000,+2348000000001",
    ]) {
      await expect(sender({ code: "012345", phone })).rejects.toThrow(
        "international phone number",
      )
    }
    for (const code of ["12345", "1234567", "abcdef", "123 45"]) {
      await expect(sender({ code, phone: "+2348000000000" })).rejects.toThrow(
        "six-digit",
      )
    }
    expect(normalizeWhatsAppOtpRecipient(" +2348000000000 ")).toBe(
      "2348000000000",
    )
    expect(calls).toBe(0)
  })

  test("redacts network errors and never retries an uncertain send", async () => {
    let calls = 0
    const sender = createWhatsAppOtpSender(config, {
      async sendTemplate() {
        calls += 1
        throw new Error("private-test-token 012345 +2348000000000")
      },
    })
    const error = await sender({
      code: "012345",
      phone: "+2348000000000",
    }).catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(WhatsAppProviderSendError)
    expect(error).toMatchObject({ outcome: "OUTCOME_UNKNOWN" })
    expect(String(error)).not.toContain("012345")
    expect(String(error)).not.toContain("private-test-token")
    expect(calls).toBe(1)
  })
})
