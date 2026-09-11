import { describe, expect, test } from "bun:test"

import { projectCustomerAccountInvitation } from "./customer-account-invitation-presentation"

const OFFERED_INVITATION = {
  actions: ["sign_up", "sign_in", "dismiss"] as const,
  body: "Sign in or create an ẸwáTrade account when you are ready. You can keep using this conversation without an account.",
  id: "invitation-1",
  milestone: "first_released_quote" as const,
  state: "offered" as const,
  title: "Keep this conversation across devices",
}

describe("projectCustomerAccountInvitation", () => {
  test("keeps the offered account path explicitly optional for a guest", () => {
    expect(
      projectCustomerAccountInvitation({
        accountSession: false,
        invitation: OFFERED_INVITATION,
      }),
    ).toEqual({
      assurance: "Nothing is linked until you review and confirm.",
      dismissLabel: "Continue as guest",
      optionalLabel: "Optional",
      primaryLabel: "Create account",
      secondaryLabel: "Sign in",
    })
  })

  test("offers review instead of another sign-in action for an account session", () => {
    expect(
      projectCustomerAccountInvitation({
        accountSession: true,
        invitation: OFFERED_INVITATION,
      }),
    ).toEqual({
      assurance: "Nothing is linked until you review and confirm.",
      dismissLabel: "Continue as guest",
      optionalLabel: "Optional",
      primaryLabel: "Review conversations",
      secondaryLabel: null,
    })
  })
})
