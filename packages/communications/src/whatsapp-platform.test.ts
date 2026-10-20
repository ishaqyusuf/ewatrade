import { expect, test } from "bun:test"
import { assistantWhatsAppConfigurationValid } from "@ewatrade/assistant/channels/policy"
import { readWhatsAppOtpConfig } from "./whatsapp-otp"
import {
  isAssistantWhatsAppPilot,
  isPlatformWhatsAppNumber,
  readAssistantWhatsAppConfig,
} from "./whatsapp-platform"

const identity = {
  WHATSAPP_OTP_PHONE_NUMBER_ID: "123456789",
  WHATSAPP_OTP_ACCESS_TOKEN: "test-only-token",
  WHATSAPP_OTP_TEMPLATE_NAME: "ewatrade_login_otp",
  WHATSAPP_OTP_TEMPLATE_LANGUAGE: "en_US",
  ASSISTANT_WHATSAPP_DISPLAY_NUMBER: "+2348000000000",
}

test("OTP and assistant share a sender but have independent switches and contracts", () => {
  const otpOnly = { ...identity, WHATSAPP_OTP_ENABLED: "true" }
  expect(readWhatsAppOtpConfig(otpOnly)?.templateName).toBe(
    "ewatrade_login_otp",
  )
  expect(readAssistantWhatsAppConfig(otpOnly)).toBeNull()
  const assistantOnly = {
    ...identity,
    ASSISTANT_WHATSAPP_ENABLED: "true",
    WHATSAPP_OTP_ENABLED: "false",
  }
  expect(readAssistantWhatsAppConfig(assistantOnly)?.phoneNumberId).toBe(
    identity.WHATSAPP_OTP_PHONE_NUMBER_ID,
  )
  expect(readWhatsAppOtpConfig(assistantOnly)).toBeNull()
  expect(readAssistantWhatsAppConfig({})).toBeNull()
  expect(() =>
    readAssistantWhatsAppConfig({ ASSISTANT_WHATSAPP_ENABLED: "true" }),
  ).toThrow()
})

test("shared configuration validity preserves disabled, invalid and normalized communication contracts", () => {
  const valid = {
    ...identity,
    ASSISTANT_WHATSAPP_ENABLED: "true",
    WHATSAPP_OTP_ACCESS_TOKEN: " test-only-token ",
    WHATSAPP_OTP_PHONE_NUMBER_ID: " 123456789 ",
    ASSISTANT_WHATSAPP_DISPLAY_NUMBER: " +2348000000000 ",
  }
  expect(assistantWhatsAppConfigurationValid(valid)).toBe(true)
  expect(readAssistantWhatsAppConfig(valid)).toEqual({
    accessToken: "test-only-token",
    phoneNumberId: "123456789",
    displayNumber: "2348000000000",
  })
  for (const changed of [
    { WHATSAPP_OTP_ACCESS_TOKEN: undefined },
    { WHATSAPP_OTP_ACCESS_TOKEN: " " },
    { WHATSAPP_OTP_PHONE_NUMBER_ID: "not-an-endpoint" },
    { ASSISTANT_WHATSAPP_DISPLAY_NUMBER: undefined },
    { ASSISTANT_WHATSAPP_DISPLAY_NUMBER: "012345678" },
    { ASSISTANT_WHATSAPP_DISPLAY_NUMBER: "+123" },
  ]) {
    const invalid = { ...valid, ...changed }
    expect(assistantWhatsAppConfigurationValid(invalid)).toBe(false)
    expect(() => readAssistantWhatsAppConfig(invalid)).toThrow(
      "Assistant WhatsApp configuration is incomplete or invalid.",
    )
    expect(
      readAssistantWhatsAppConfig({
        ...invalid,
        ASSISTANT_WHATSAPP_ENABLED: "false",
      }),
    ).toBeNull()
  }
})

test("disabled platform traffic is still isolated from merchant routing", () => {
  expect(isPlatformWhatsAppNumber("123456789", identity)).toBe(true)
  expect(isPlatformWhatsAppNumber("987654321", identity)).toBe(false)
  expect(isPlatformWhatsAppNumber("", {})).toBe(false)
  expect(isAssistantWhatsAppPilot("user", {})).toBe(false)
  expect(
    isAssistantWhatsAppPilot("user", {
      ASSISTANT_WHATSAPP_PILOT_USER_IDS: " other, user ",
    }),
  ).toBe(true)
  expect(
    isAssistantWhatsAppPilot("user", {
      ASSISTANT_WHATSAPP_PILOT_USER_IDS: "superuser",
    }),
  ).toBe(false)
})

test("normalized assistant source preserves reply correlation, list choices and original media captions", async () => {
  const { parseMetaWhatsAppEvents } = await import("./whatsapp")
  const events = parseMetaWhatsAppEvents({
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: "123456789" },
              messages: [
                {
                  id: "list-1",
                  from: "2348000000000",
                  type: "interactive",
                  context: { id: "review-1" },
                  interactive: { list_reply: { id: "opaque-action" } },
                },
                {
                  id: "image-1",
                  from: "2348000000000",
                  type: "image",
                  image: {
                    id: "media-1",
                    mime_type: "image/jpeg",
                    caption: "Original receipt caption",
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  })
  expect(events[0]).toMatchObject({
    kind: "message",
    type: "interactive",
    quickActionId: "opaque-action",
    replyToMessageId: "review-1",
  })
  expect(events[1]).toMatchObject({
    kind: "message",
    type: "media",
    text: "Original receipt caption",
    media: { id: "media-1", mediaType: "image/jpeg" },
  })
})

test("public enrollment still requires valid enabled platform configuration", () => {
  const env = { ASSISTANT_WHATSAPP_ROLLOUT_MODE: "public" }
  expect(isAssistantWhatsAppPilot("registered", env)).toBe(true)
  expect(isAssistantWhatsAppPilot("", env)).toBe(false)
  expect(readAssistantWhatsAppConfig(env)).toBeNull()
  expect(() =>
    readAssistantWhatsAppConfig({ ...env, ASSISTANT_WHATSAPP_ENABLED: "true" }),
  ).toThrow()
})
