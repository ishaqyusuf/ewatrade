import { describe, expect, test } from "bun:test"

import {
  storeConversationAccountInvitationProjectionSchema,
  storeConversationAccountLinkInputSchema,
} from "./schemas/store-conversation-accounts"
import {
  canSelectStoreConversationAccountCandidate,
  projectStoreConversationAccountInvitation,
} from "./store-conversation-accounts"

describe("Store Conversation account adoption contracts", () => {
  test("keeps the invitation optional while offered", () => {
    const invitation = projectStoreConversationAccountInvitation({
      id: "invitation-1",
      state: "offered",
    })

    expect(invitation.actions).toEqual(["sign_up", "sign_in", "dismiss"])
    expect(
      storeConversationAccountInvitationProjectionSchema.parse(invitation),
    ).toEqual(invitation)
    expect(JSON.stringify(invitation)).not.toContain("email")
    expect(JSON.stringify(invitation)).not.toContain("phone")
  })

  test("renders dismissal and linking as non-blocking history", () => {
    expect(
      projectStoreConversationAccountInvitation({
        id: "invitation-1",
        state: "dismissed",
      }),
    ).toMatchObject({ actions: [], state: "dismissed" })
    expect(
      projectStoreConversationAccountInvitation({
        id: "invitation-1",
        state: "linked",
      }),
    ).toMatchObject({ actions: [], state: "linked" })
  })

  test("requires explicit confirmation and canonicalizes exact conversations", () => {
    expect(
      storeConversationAccountLinkInputSchema.parse({
        clientOperationId: "operation-link-1",
        confirmed: true,
        conversationIds: ["conversation-2", "conversation-1", "conversation-2"],
      }).conversationIds,
    ).toEqual(["conversation-1", "conversation-2"])
    expect(
      storeConversationAccountLinkInputSchema.safeParse({
        clientOperationId: "operation-link-1",
        confirmed: false,
        conversationIds: ["conversation-1"],
      }).success,
    ).toBe(false)
  })

  test("allows selection only for an active conversation not already linked", () => {
    expect(
      canSelectStoreConversationAccountCandidate({
        linked: false,
        state: "active",
      }),
    ).toBe(true)
    expect(
      canSelectStoreConversationAccountCandidate({
        linked: true,
        state: "active",
      }),
    ).toBe(false)
    expect(
      canSelectStoreConversationAccountCandidate({
        linked: false,
        state: "restricted",
      }),
    ).toBe(false)
  })
})
