// @ts-expect-error Bun test runtime types are outside the email package tsconfig.
import { describe, expect, test } from "bun:test"

import {
  earlyAccessLead,
  orderReminder,
  staffInvite,
  workspaceWelcome,
} from "../src/preview-fixtures"
import { renderCommercialOrderFulfillmentReminderTemplate } from "./commercial-order-fulfillment-reminder"
import { renderMarketingEarlyAccessAdminTemplate } from "./marketing-early-access-admin"
import { renderMarketingEarlyAccessConfirmationTemplate } from "./marketing-early-access-confirmation"
import { renderMarketingWaitlistAdminTemplate } from "./marketing-waitlist-admin"
import { renderMarketingWaitlistConfirmationTemplate } from "./marketing-waitlist-confirmation"
import { renderMobileOwnerOtpTemplate } from "./mobile-owner-otp"
import { renderRetailOpsStaffInviteTemplate } from "./retail-ops-staff-invite"
import { renderStoreConversationNotificationTemplate } from "./store-conversation-notification"
import { renderStoreNotificationVerificationTemplate } from "./store-notification-verification"
import { renderWorkspaceWelcomeTemplate } from "./workspace-welcome"

const templates = [
  renderMarketingEarlyAccessAdminTemplate(earlyAccessLead),
  renderMarketingEarlyAccessConfirmationTemplate(earlyAccessLead),
  renderMarketingEarlyAccessConfirmationTemplate({
    ...earlyAccessLead,
    accessExpiresAt: null,
    accessUrl: null,
  }),
  renderMarketingWaitlistAdminTemplate(earlyAccessLead),
  renderMarketingWaitlistConfirmationTemplate(earlyAccessLead),
  renderRetailOpsStaffInviteTemplate(staffInvite),
  renderCommercialOrderFulfillmentReminderTemplate(orderReminder),
  renderCommercialOrderFulfillmentReminderTemplate({
    ...orderReminder,
    timing: "same_day",
  }),
  renderWorkspaceWelcomeTemplate(workspaceWelcome),
  renderMobileOwnerOtpTemplate({
    code: "482913",
    expiresAtLabel: "4:20 PM WAT",
    mode: "login",
  }),
  renderMobileOwnerOtpTemplate({
    code: "716204",
    expiresAtLabel: "4:20 PM WAT",
    mode: "sign_up",
  }),
  renderStoreNotificationVerificationTemplate({ code: "357821" }),
  renderStoreConversationNotificationTemplate({
    body: "Amina Home & Trade replied to your Store conversation.",
    subject: "Amina Home & Trade replied",
  }),
]

describe("EwaTrade email templates", () => {
  test("renders every preview state through the shared brand system", () => {
    expect(templates).toHaveLength(13)

    for (const template of templates) {
      expect(template.html).toStartWith("<!doctype html>")
      expect(template.html).toContain("EwaTrade")
      expect(template.html).toContain('data-email-system="field-ledger"')
      expect(template.html).toContain("field-ledger-container")
      expect(template.html).toContain("#ff6f3d")
      expect(template.html).toContain("#9da9a1")
      expect(template.html).toContain("height:7px")
      expect(template.html).toContain("border-radius:0")
      expect(template.html).toContain("Keep commerce in order")
      expect(template.html).not.toContain("[object Object]")
      expect(template.text.length).toBeGreaterThan(40)
    }
  })

  test("escapes dynamic HTML without losing readable plain text", () => {
    const template = renderMarketingEarlyAccessAdminTemplate({
      ...earlyAccessLead,
      fullName: "Amina <script>alert('x')</script>",
    })

    expect(template.html).not.toContain("<script>alert")
    expect(template.html).toContain("&lt;script&gt;")
    expect(template.text).toContain("Amina <script>alert('x')</script>")
  })
})
