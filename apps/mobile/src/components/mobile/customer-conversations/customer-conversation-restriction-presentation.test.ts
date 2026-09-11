import { describe, expect, test } from "bun:test"

import { projectCustomerConversationRestriction } from "./customer-conversation-restriction-presentation"

describe("projectCustomerConversationRestriction", () => {
  test("omits the restriction rail for an open conversation", () => {
    expect(
      projectCustomerConversationRestriction({
        customerMessage: null,
        recovery: null,
        state: "open",
      }),
    ).toBeNull()
  })

  test("keeps restricted recovery neutral and preserves history truth", () => {
    expect(
      projectCustomerConversationRestriction({
        customerMessage:
          "This Store has paused new messages in this conversation. Your existing history and requests are still available.",
        recovery: "wait_for_reinstatement",
        state: "restricted",
      }),
    ).toEqual({
      accessibilityLabel:
        "Messages paused. History and requests stay available. Waiting for Store review.",
      detail: "History and requests stay available.",
      recoveryAction: null,
      recoveryLabel: "Waiting for Store review",
      title: "Messages paused",
    })
  })

  test("projects the current return-to-entry recovery without internal detail", () => {
    expect(
      projectCustomerConversationRestriction({
        customerMessage: "Internal wording must not cross this boundary.",
        recovery: "return_to_store_entry",
        state: "restricted",
      }),
    ).toEqual({
      accessibilityLabel:
        "Messages paused. History and requests stay available. Return to the Store link.",
      detail: "History and requests stay available.",
      recoveryAction: "return_to_store_entry",
      recoveryLabel: "Return to the Store link",
      title: "Messages paused",
    })
  })
})
