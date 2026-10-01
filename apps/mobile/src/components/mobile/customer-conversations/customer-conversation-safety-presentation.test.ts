import { describe, expect, test } from "bun:test"
import {
  CUSTOMER_CONVERSATION_REPORT_REASONS,
  customerConversationBlockDescription,
} from "./customer-conversation-safety-presentation"

describe("customer conversation safety presentation", () => {
  test("gives distinct and understandable report reasons", () => {
    expect(
      CUSTOMER_CONVERSATION_REPORT_REASONS.map((reason) => reason.value),
    ).toEqual([
      "spam",
      "harassment",
      "hateful_content",
      "sexual_content",
      "violence",
      "other",
    ])
    expect(
      new Set(
        CUSTOMER_CONVERSATION_REPORT_REASONS.map((reason) => reason.label),
      ).size,
    ).toBe(6)
  })

  test("explains block and unblock without promising deletion", () => {
    expect(customerConversationBlockDescription(false)).toContain(
      "notifications",
    )
    expect(customerConversationBlockDescription(true)).toContain("still read")
    expect(customerConversationBlockDescription(true)).toContain("report")
  })
})
