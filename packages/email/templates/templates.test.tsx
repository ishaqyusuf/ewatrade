// @ts-expect-error Bun test runtime types are outside the email package tsconfig.
import { describe, expect, test } from "bun:test"

import {
  accountDeletionVerification,
  accountPrivacyNoticeAlert,
  accountPrivacyOutcome,
  earlyAccessLead,
  orderReminder,
  playRefundReviewAlert,
  staffInvite,
  workspaceWelcome,
} from "../src/preview-fixtures"
import { renderAccountDeletionVerificationTemplate } from "./account-deletion-verification"
import { renderAccountPrivacyNoticeAlertTemplate } from "./account-privacy-notice-alert"
import { renderAccountPrivacyOutcomeTemplate } from "./account-privacy-outcome"
import { renderCommercialOrderFulfillmentReminderTemplate } from "./commercial-order-fulfillment-reminder"
import { renderEarlyAccessVerificationTemplate } from "./early-access-verification"
import { renderMarketingEarlyAccessAdminTemplate } from "./marketing-early-access-admin"
import { renderMarketingEarlyAccessConfirmationTemplate } from "./marketing-early-access-confirmation"
import { renderMarketingWaitlistAdminTemplate } from "./marketing-waitlist-admin"
import { renderMarketingWaitlistConfirmationTemplate } from "./marketing-waitlist-confirmation"
import { renderMobileOwnerOtpTemplate } from "./mobile-owner-otp"
import { renderPlayRefundReviewAlertTemplate } from "./play-refund-review-alert"
import { renderRetailOpsStaffInviteTemplate } from "./retail-ops-staff-invite"
import { renderStoreConversationNotificationTemplate } from "./store-conversation-notification"
import { renderStoreNotificationVerificationTemplate } from "./store-notification-verification"
import { renderWorkspaceWelcomeTemplate } from "./workspace-welcome"

const templates = [
  renderAccountDeletionVerificationTemplate(accountDeletionVerification),
  renderAccountPrivacyNoticeAlertTemplate(accountPrivacyNoticeAlert),
  renderAccountPrivacyOutcomeTemplate(accountPrivacyOutcome),
  renderPlayRefundReviewAlertTemplate(playRefundReviewAlert),
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
  renderEarlyAccessVerificationTemplate({
    email: "amina@example.com",
    expiresAt: "3 October 2026, 10:30 UTC",
    fullName: "Amina Bello",
    verificationUrl:
      "https://dashboard.ewatrade.com/api/early-access/verify?token=preview-only",
  }),
]

describe("EwaTrade email templates", () => {
  test("renders every preview state through the shared brand system", () => {
    expect(templates).toHaveLength(18)

    for (const template of templates) {
      expect(template.html).toStartWith("<!doctype html>")
      expect(template.html).toContain("EwaTrade")
      expect(template.html).toContain('data-email-system="warm-desk"')
      expect(template.html).toContain("warm-desk-container")
      expect(template.html).toContain("#fffefa")
      expect(template.html).toContain("#c8d89d")
      expect(template.html).toContain("height:4px")
      expect(template.html).toContain("border-radius:10px")
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

  test("pending early access confirms review without exposing private actions or expiry", () => {
    const template = renderMarketingEarlyAccessConfirmationTemplate({
      ...earlyAccessLead,
      accessUrl: null,
      approvalUrl:
        "https://www.ewatrade.com/api/early-access/approve?token=secret",
    })
    expect(template.html).toContain("Awaiting review")
    expect(template.text).toContain("Hi Amina.")
    expect(template.text).toContain("Business name: Amina Home & Trade")
    expect(template.text).toContain("Status: Awaiting review")
    for (const content of [template.html, template.text]) {
      expect(content).toContain("Your early access request is in.")
      expect(content).toContain("Our team will review your request.")
      expect(content).not.toContain("token=secret")
      expect(content).not.toContain("Create your workspace")
      expect(content).not.toContain("Link expires")
      expect(content).not.toContain(earlyAccessLead.accessExpiresAt)
    }
  })

  test("approved early access retains its workspace action and expiry", () => {
    const template =
      renderMarketingEarlyAccessConfirmationTemplate(earlyAccessLead)
    expect(template.html).toContain("Access approved")
    expect(template.text).toContain("Your workspace starts here.")
    expect(template.text).toContain(
      `Create your workspace: ${earlyAccessLead.accessUrl}`,
    )
    expect(template.text).toContain(
      `Link expires: ${earlyAccessLead.accessExpiresAt}`,
    )
    expect(template.html).not.toContain("Awaiting review")
  })

  test("outcome content is supplied verbatim as text and escaped in HTML", () => {
    const input = {
      subject: "Review <script>alert('x')</script>",
      text: "Operator wording <img src=x onerror=alert('x')>\n\nSecond paragraph.",
    }
    const result = renderAccountPrivacyOutcomeTemplate(input)
    expect(result.text).toBe(input.text)
    expect(result.html).not.toContain("<script>")
    expect(result.html).not.toContain("<img src=x")
    expect(result.html).toContain("&lt;img")
    expect(result.html).toContain("white-space:pre-wrap")
    expect(result.html).not.toContain("Your account has been deleted")
  })

  test("deletion verification retains the exact code, expiry and warning", () => {
    const result = renderAccountDeletionVerificationTemplate({
      code: "<482913>",
    })
    expect(result.html).toContain("&lt;482913&gt;")
    expect(result.text).toBe(
      "Your EwaTrade account deletion request code is <482913>. It expires in 10 minutes. If you did not request this, ignore this email. Never share the code.",
    )
  })
})
