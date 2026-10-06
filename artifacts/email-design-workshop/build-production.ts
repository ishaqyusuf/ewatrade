import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import {
  renderAccountDeletionVerificationTemplate,
  renderAccountPrivacyOutcomeTemplate,
  renderAccountPrivacyNoticeAlertTemplate,
  renderPlayRefundReviewAlertTemplate,
  renderCommercialOrderFulfillmentReminderTemplate,
  renderEarlyAccessVerificationTemplate,
  renderMarketingEarlyAccessAdminTemplate,
  renderMarketingEarlyAccessConfirmationTemplate,
  renderMarketingWaitlistAdminTemplate,
  renderMarketingWaitlistConfirmationTemplate,
  renderMobileOwnerOtpTemplate,
  renderRetailOpsStaffInviteTemplate,
  renderStoreConversationNotificationTemplate,
  renderStoreNotificationVerificationTemplate,
  renderWorkspaceWelcomeTemplate,
} from "../../packages/email/src"
import {
  accountDeletionVerification,
  accountPrivacyOutcome,
  accountPrivacyNoticeAlert,
  playRefundReviewAlert,
  earlyAccessLead,
  orderReminder,
  staffInvite,
  workspaceWelcome,
} from "../../packages/email/src/preview-fixtures"

const waitlist = {
  id: "demo-waitlist-1042",
  fullName: "Amina Bello",
  email: "amina@example.test",
}
const entries = [
  { id: "01-early-access-admin", name: "Early access · internal request", ...renderMarketingEarlyAccessAdminTemplate({ ...earlyAccessLead, approvalUrl: "https://ewatrade.com/api/early-access/approve?token=preview-only" }) },
  { id: "02-early-access-approved", name: "Early access · approved", ...renderMarketingEarlyAccessConfirmationTemplate(earlyAccessLead) },
  { id: "03-early-access-pending", name: "Early access · pending", ...renderMarketingEarlyAccessConfirmationTemplate({ ...earlyAccessLead, accessUrl: null, accessExpiresAt: null }) },
  { id: "04-waitlist-admin", name: "Waitlist · internal alert", ...renderMarketingWaitlistAdminTemplate(waitlist) },
  { id: "05-waitlist-confirmation", name: "Waitlist · customer confirmation", ...renderMarketingWaitlistConfirmationTemplate(waitlist) },
  { id: "06-staff-invite", name: "Staff invitation", ...renderRetailOpsStaffInviteTemplate(staffInvite) },
  { id: "07-order-tomorrow", name: "Delivery · tomorrow", ...renderCommercialOrderFulfillmentReminderTemplate(orderReminder) },
  { id: "08-order-today", name: "Delivery · today", ...renderCommercialOrderFulfillmentReminderTemplate({ ...orderReminder, timing: "same_day" }) },
  { id: "09-workspace-welcome", name: "Workspace welcome", ...renderWorkspaceWelcomeTemplate(workspaceWelcome) },
  { id: "10-login-code", name: "Owner · sign-in code", ...renderMobileOwnerOtpTemplate({ code: "482913", expiresAtLabel: "4:20 PM WAT", mode: "login" }) },
  { id: "11-signup-code", name: "Owner · signup code", ...renderMobileOwnerOtpTemplate({ code: "716204", expiresAtLabel: "4:20 PM WAT", mode: "sign_up" }) },
  { id: "12-store-code", name: "Store · verification code", ...renderStoreNotificationVerificationTemplate({ code: "357821" }) },
  { id: "13-store-reply", name: "Store · neutral activity", ...renderStoreConversationNotificationTemplate({ body: "There is new activity in your Store conversation. Open EwaTrade to read it.", subject: "New Store conversation activity" }) },
  { id: "14-setup-verification", name: "Setup · email verification", ...renderEarlyAccessVerificationTemplate({ fullName: "Amina Bello", email: "amina@example.test", verificationUrl: "https://ewatrade.com/api/early-access/verify?token=preview-only", expiresAt: "3 October 2026, 10:30 UTC" }) },
  { id: "15-account-deletion-verification", name: "Account deletion · request code", ...renderAccountDeletionVerificationTemplate(accountDeletionVerification) },
  { id: "16-account-privacy-outcome", name: "Account deletion · operator outcome", ...renderAccountPrivacyOutcomeTemplate(accountPrivacyOutcome) },
  { id: "17-account-privacy-notice-alert", name: "Account deletion · delivery alert", ...renderAccountPrivacyNoticeAlertTemplate(accountPrivacyNoticeAlert) },
  { id: "18-play-refund-review-alert", name: "Google Play · refund review alert", ...renderPlayRefundReviewAlertTemplate(playRefundReviewAlert) },
]
const phase = process.argv.includes("--before") ? "before" : "current"
const root = new URL(`./implementation/${phase}/`, import.meta.url)
await mkdir(root, { recursive: true })
const hash = (s: string) => createHash("sha256").update(s).digest("hex")
const manifest = entries.map(({ id, name, html, text }) => ({ id, name, htmlHash: hash(html), textHash: hash(text), links: [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]), text }))
for (const entry of entries) await writeFile(new URL(`${entry.id}.html`, root), entry.html)
await writeFile(new URL("manifest.json", root), JSON.stringify(manifest, null, 2))
if (phase === "current") {
  const before: typeof manifest = JSON.parse(await readFile(new URL("./implementation/before/manifest.json", import.meta.url), "utf8"))
  for (const entry of manifest) {
    const old = before.find(e => e.id === entry.id)
    if (!old && Number(entry.id.slice(0, 2)) > 14) continue
    if (!old) throw new Error(`Missing baseline: ${entry.id}`)
    const expectedText = entry.id === "04-waitlist-admin" ? old.text.replace("One more business is watching.", "A new business joined the waitlist.") : old.text
    if (entry.text !== expectedText || JSON.stringify(entry.links) !== JSON.stringify(old.links)) throw new Error(`Workflow content/link changed unexpectedly: ${entry.id}`)
  }
  await writeFile(new URL("./implementation/contracts.json", import.meta.url), JSON.stringify({ states: manifest.length, matchedPlainText: 13, intendedWaitlistHeadlineChange: true, matchedLinks: before.length, newlyCoveredStates: manifest.length - before.length, sends: 0 }, null, 2))
}
await writeFile(new URL("./implementation/outcome-long.html", import.meta.url), renderAccountPrivacyOutcomeTemplate({ subject: "LongSubject".repeat(16), text: "LongUnbrokenOperatorText".repeat(100) + "\n\nPreview content only." }).html)
console.log(`Rendered ${entries.length} actual shared email states (${phase}), no dispatch.`)
process.exit(0)
