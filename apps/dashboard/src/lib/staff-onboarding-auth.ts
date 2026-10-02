import { initStaffOnboardingAuth } from "@ewatrade/auth"
import {
  createEmailMessage,
  createTestRoutedEmailMessages,
  dispatchEmailMessages,
  renderMobileOwnerOtpTemplate,
} from "@ewatrade/email"

// This server instance adds email verification only for web staff onboarding.
export const staffOnboardingAuth = initStaffOnboardingAuth(
  async ({ email, otp }) => {
    const template = renderMobileOwnerOtpTemplate({
      code: otp,
      mode: "login",
      expiresAtLabel: "in 5 minutes",
    })
    const messages = createTestRoutedEmailMessages(
      createEmailMessage({
        from: process.env.EMAIL_FROM ?? "EwaTrade <noreply@ewatrade.com>",
        to: email,
        subject: "Your EwaTrade staff verification code",
        ...template,
      }),
    )
    const results = await dispatchEmailMessages(messages)
    if (results.some((result) => result.status === "failed"))
      throw new Error("Verification email could not be sent. Try again.")
  },
)
