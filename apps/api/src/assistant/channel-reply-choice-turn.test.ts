import { expect, test } from "bun:test"
import type { WhatsAppInboxLease } from "@ewatrade/db/assistant-whatsapp"
import type { GeneralContext } from "./general-context"
import { processAssistantWhatsAppReplyChoiceTurn } from "./channel-reply-choice-turn"

const lease = {} as WhatsAppInboxLease
const inbox = {
  requestId: "request-test",
  userMessageId: "message-test",
  content: {
    type: "reply_choice",
    command: {
      kind: "reply_choice",
      sourceOutboxId: "outbox-test",
      index: 1,
      replyToMessageId: "provider-sent-test",
    },
  },
}
const unbranded = {
  session: {
    purpose: "GENERAL",
    principal: { senderId: "2348000000001", bindingId: "forged-binding" },
  },
  db: new Proxy(
    {},
    {
      get() {
        throw Error("No DB effect is permitted")
      },
    },
  ),
} as unknown as GeneralContext

test("a serialized linked identity cannot redeem a saved reply choice or touch persistence", async () => {
  await expect(
    processAssistantWhatsAppReplyChoiceTurn(unbranded, lease, inbox),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  await expect(
    processAssistantWhatsAppReplyChoiceTurn(unbranded, lease, {
      ...inbox,
      content: { type: "invalid_reply_choice" },
    }),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
})

test("ordinary business text remains outside the saved-choice adapter", async () => {
  expect(
    await processAssistantWhatsAppReplyChoiceTurn(unbranded, lease, {
      ...inbox,
      content: { type: "text", text: "150000" },
    }),
  ).toEqual({ kind: "none" })
})
