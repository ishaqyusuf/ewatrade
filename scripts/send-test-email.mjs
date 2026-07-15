#!/usr/bin/env node

import {
  createEmailMessage,
  dispatchEmailMessages,
  getConfiguredTestEmailRecipients,
} from "../packages/email/src/index.ts"

const from = process.env.EMAIL_FROM?.trim()
const replyTo = process.env.EMAIL_REPLY_TO?.trim()
const testEmail = getConfiguredTestEmailRecipients()[0]
const apiKey = process.env.RESEND_API_KEY?.trim()

if (!apiKey || !from || !testEmail) {
  console.error(
    "Missing RESEND_API_KEY, EMAIL_FROM, or TEST_EMAILS/TEST_EMAIL in env.",
  )
  process.exit(1)
}

const [result] = await dispatchEmailMessages([
  createEmailMessage({
    from,
    html: "<p>Your EwaTrade email path is connected.</p><p>TEST_EMAILS/TEST_EMAIL is active for smoke testing.</p>",
    replyTo,
    subject: "EwaTrade test email",
    text: "Your EwaTrade email path is connected.\n\nTEST_EMAILS/TEST_EMAIL is active for smoke testing.",
    to: testEmail,
  }),
])

if (result?.status !== "sent") {
  console.error("Failed to send test email:", result?.error ?? "Unknown error.")
  process.exit(1)
}

console.log(`Sent test email to TEST_EMAILS/TEST_EMAIL (${testEmail}).`)
if (result.providerMessageId) {
  console.log(`Provider id: ${result.providerMessageId}`)
}
