import { describe, expect, test } from "bun:test"
import {
  SETUP_ATTACHMENT_EXPIRED,
  SETUP_ATTACHMENT_PART,
} from "@ewatrade/assistant/setup/attachments"
import { ASSISTANT_ATTACHMENT_RETENTION_EXPIRED } from "@ewatrade/db/assistant-operations"
import {
  type ChatAttachmentRow,
  withAttachmentText,
  withExpiredAttachments,
} from "./chat-attachments"

const row: ChatAttachmentRow = {
  id: "att_1",
  conversationId: "conv_1",
  messageId: "msg_1",
  kind: "TEXT",
  status: "READY",
  fileName: "price-list.txt",
  durationMs: null,
  transcript: null,
  extraction: {
    type: "text",
    lines: ["Eggs, 4500 per crate"],
    truncated: false,
  },
}

const sent = [
  {
    id: "msg_1",
    role: "user",
    parts: [
      { type: "text", text: "Here is my list" },
      {
        type: SETUP_ATTACHMENT_PART,
        data: {
          attachmentId: "att_1",
          kind: "TEXT",
          fileName: "price-list.txt",
          summary: "1 line",
        },
      },
    ],
  },
]

describe("expired attachments", () => {
  test("use the code the retention job writes", () => {
    expect(SETUP_ATTACHMENT_EXPIRED).toBe(
      ASSISTANT_ATTACHMENT_RETENTION_EXPIRED,
    )
  })

  test("tell the model the content is gone instead of replaying it", () => {
    const [message] = withAttachmentText(sent, [
      {
        ...row,
        extraction: null,
        errorCode: SETUP_ATTACHMENT_EXPIRED,
      },
    ])
    expect(message?.parts[1]).toEqual({
      type: "text",
      text: "(attachment price-list.txt has expired: its content was deleted and is no longer available)",
    })
  })

  test("flag the stored part for display; others stay as they were", () => {
    const [message] = withExpiredAttachments(sent, new Set(["att_1"]))
    expect(message?.parts[0]).toBe(sent[0]?.parts[0])
    expect(message?.parts[1]).toMatchObject({ data: { expired: true } })
    expect(withExpiredAttachments(sent, new Set())).toBe(sent)
  })
})
