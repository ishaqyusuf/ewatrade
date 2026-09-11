import type { StoreConversationAccountInvitationProjection } from "@ewatrade/service-commerce"

export function projectCustomerAccountInvitation(input: {
  accountSession: boolean
  invitation: StoreConversationAccountInvitationProjection
}) {
  return {
    assurance:
      input.invitation.state === "offered"
        ? "Nothing is linked until you review and confirm."
        : null,
    dismissLabel:
      input.invitation.state === "offered" ? "Continue as guest" : null,
    optionalLabel: input.invitation.state === "offered" ? "Optional" : null,
    primaryLabel:
      input.invitation.state === "offered"
        ? input.accountSession
          ? "Review conversations"
          : "Create account"
        : null,
    secondaryLabel:
      input.invitation.state === "offered" && !input.accountSession
        ? "Sign in"
        : null,
  }
}
