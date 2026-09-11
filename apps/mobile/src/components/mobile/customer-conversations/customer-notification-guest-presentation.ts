export type CustomerNotificationGuestChannel = "email" | "whatsapp"

export function projectCustomerNotificationGuestSetup(input: {
  channel: CustomerNotificationGuestChannel
  code: string
  consented: boolean
  destination: string
  verificationId: string | null
}) {
  const verifying = Boolean(input.verificationId)
  const phone = input.channel === "whatsapp"
  const destination = input.destination.trim()
  const destinationValid = phone
    ? /^\+[1-9]\d{7,14}$/.test(destination)
    : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination)

  return {
    actionEnabled: verifying
      ? input.code.trim().length === 6
      : input.consented && destinationValid,
    actionLabel: verifying
      ? phone
        ? "Verify phone"
        : "Verify email"
      : "Send verification code",
    body: "We’ll only say that the Store replied. Chat details stay private.",
    consentLabel: phone
      ? "Use this phone for response and reopening alerts. Not marketing."
      : "Use this email for response and reopening alerts. Not marketing.",
    destinationAccessibilityLabel: phone
      ? "Notification phone"
      : "Notification email",
    destinationPlaceholder: phone ? "+234 801 234 5678" : "Email address",
    optionalLabel: "Optional",
    scopeLabel: "Only for this Store conversation",
    title: "Get a neutral response alert",
  }
}
