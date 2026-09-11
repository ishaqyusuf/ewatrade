import { describe, expect, test } from "bun:test"

import { projectCustomerNotificationGuestSetup } from "./customer-notification-guest-presentation"

describe("projectCustomerNotificationGuestSetup", () => {
  test("keeps notification-only consent optional and the first action disabled", () => {
    expect(
      projectCustomerNotificationGuestSetup({
        channel: "email",
        code: "",
        consented: false,
        destination: "",
        verificationId: null,
      }),
    ).toEqual({
      actionEnabled: false,
      actionLabel: "Send verification code",
      body: "We’ll only say that the Store replied. Chat details stay private.",
      consentLabel:
        "Use this email for response and reopening alerts. Not marketing.",
      destinationAccessibilityLabel: "Notification email",
      destinationPlaceholder: "Email address",
      optionalLabel: "Optional",
      scopeLabel: "Only for this Store conversation",
      title: "Get a neutral response alert",
    })
  })

  test("enables only the action for the current verified input stage", () => {
    expect(
      projectCustomerNotificationGuestSetup({
        channel: "email",
        code: "",
        consented: true,
        destination: "customer@example.com",
        verificationId: null,
      }).actionEnabled,
    ).toBe(true)
    expect(
      projectCustomerNotificationGuestSetup({
        channel: "email",
        code: "123456",
        consented: true,
        destination: "customer@example.com",
        verificationId: "verification-1",
      }),
    ).toMatchObject({ actionEnabled: true, actionLabel: "Verify email" })
  })

  test("projects phone verification without weakening notification consent", () => {
    expect(
      projectCustomerNotificationGuestSetup({
        channel: "whatsapp",
        code: "",
        consented: true,
        destination: "08012345678",
        verificationId: null,
      }).actionEnabled,
    ).toBe(false)
    expect(
      projectCustomerNotificationGuestSetup({
        channel: "whatsapp",
        code: "123456",
        consented: true,
        destination: "+2348012345678",
        verificationId: "verification-2",
      }),
    ).toMatchObject({
      actionEnabled: true,
      actionLabel: "Verify phone",
      consentLabel:
        "Use this phone for response and reopening alerts. Not marketing.",
      destinationAccessibilityLabel: "Notification phone",
      destinationPlaceholder: "+234 801 234 5678",
    })
  })
})
