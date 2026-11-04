import { describe, expect, test } from "bun:test"
import { WhatsAppProviderSendError } from "./whatsapp"
import {
  createStaffInviteWhatsAppSender,
  readStaffInviteWhatsAppConfig,
} from "./whatsapp-staff-invite"

const otpEnv = {
  WHATSAPP_OTP_ENABLED: "true",
  WHATSAPP_OTP_ACCESS_TOKEN: "private-test-token",
  WHATSAPP_OTP_PHONE_NUMBER_ID: "123456789",
  WHATSAPP_OTP_TEMPLATE_NAME: "ewatrade_verification",
  WHATSAPP_OTP_TEMPLATE_LANGUAGE: "en_US",
}
const token = "a".repeat(43)

describe("staff invite WhatsApp delivery", () => {
  test("stays off until the template is set and WhatsApp sign-in is on", () => {
    expect(readStaffInviteWhatsAppConfig(otpEnv)).toBeNull()
    const template = {
      STAFF_INVITE_WHATSAPP_TEMPLATE_NAME: "ewatrade_staff_invite",
      STAFF_INVITE_WHATSAPP_TEMPLATE_LANGUAGE: "en",
    }
    expect(readStaffInviteWhatsAppConfig(template)).toBeNull()
    expect(readStaffInviteWhatsAppConfig({ ...otpEnv, ...template })).toEqual({
      accessToken: "private-test-token",
      phoneNumberId: "123456789",
      templateName: "ewatrade_staff_invite",
      language: "en",
    })
    expect(() =>
      readStaffInviteWhatsAppConfig({
        ...otpEnv,
        STAFF_INVITE_WHATSAPP_TEMPLATE_NAME: "Bad Name",
      }),
    ).toThrow("invalid")
  })

  test("fills the business, role and acceptance button from the platform number", async () => {
    const sent: unknown[] = []
    const send = createStaffInviteWhatsAppSender(
      {
        accessToken: "private-test-token",
        phoneNumberId: "123456789",
        templateName: "ewatrade_staff_invite",
        language: "en",
      },
      {
        async sendTemplate(input) {
          sent.push(input)
          return { messageId: "wamid.1" }
        },
      },
    )
    await expect(
      send({
        businessName: "Sweet Crumbs\nBakery",
        inviteToken: token,
        phone: "+2348035550142",
        roleLabel: "sales rep",
      }),
    ).resolves.toEqual({ messageId: "wamid.1" })
    expect(sent[0]).toMatchObject({
      to: "2348035550142",
      templateName: "ewatrade_staff_invite",
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: "Sweet Crumbs Bakery" },
            { type: "text", text: "sales rep" },
          ],
        },
        {
          type: "button",
          sub_type: "url",
          parameters: [{ type: "text", text: token }],
        },
      ],
    })
  })

  test("hides provider exceptions behind an unknown outcome", async () => {
    const send = createStaffInviteWhatsAppSender(
      {
        accessToken: "t",
        phoneNumberId: "1",
        templateName: "x",
        language: "en",
      },
      {
        async sendTemplate() {
          throw new Error("network failed with token t")
        },
      },
    )
    const failure = await send({
      businessName: "Shop",
      inviteToken: token,
      phone: "+2348035550142",
      roleLabel: "sales rep",
    }).catch((error) => error)
    expect(failure).toBeInstanceOf(WhatsAppProviderSendError)
    expect(failure.outcome).toBe("OUTCOME_UNKNOWN")
  })
})
