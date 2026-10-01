import { expect, test } from "bun:test"

import {
  canLoadCustomerAttachmentCapability,
  canUseCustomerAttachmentCapability,
} from "./customer-conversation-attachment-gate"

const ready = {
  accountAccess: false,
  composerEnabled: true,
  conversationId: "conversation_qa",
  postingTermsAccepted: true,
  publicToken: "published-preview-token",
  targetSelected: true,
}

test("draft Terms prevent an attachment capability request even after the conversation opens", () => {
  expect(
    canLoadCustomerAttachmentCapability({
      ...ready,
      postingTermsAccepted: false,
    }),
  ).toBe(false)
  expect(
    canUseCustomerAttachmentCapability({
      available: true,
      postingTermsAccepted: false,
    }),
  ).toBe(false)
})

test("accepted Terms still require a guest conversation, target and enabled channel", () => {
  expect(canLoadCustomerAttachmentCapability(ready)).toBe(true)
  expect(
    canLoadCustomerAttachmentCapability({ ...ready, targetSelected: false }),
  ).toBe(false)
  expect(
    canLoadCustomerAttachmentCapability({ ...ready, accountAccess: true }),
  ).toBe(false)
  expect(
    canLoadCustomerAttachmentCapability({ ...ready, composerEnabled: false }),
  ).toBe(false)
  expect(
    canUseCustomerAttachmentCapability({
      available: true,
      postingTermsAccepted: true,
    }),
  ).toBe(true)
})
