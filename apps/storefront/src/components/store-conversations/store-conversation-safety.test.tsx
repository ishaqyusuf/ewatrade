import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"

import { StoreConversationSafety } from "./store-conversation-safety"

const common = {
  conversationId: "conversation-1",
  onBlockedChange: () => undefined,
  onReportMessageHandled: () => undefined,
  publicToken: "a".repeat(40),
  reportMessageId: null,
} as const

describe("Store Conversation safety controls", () => {
  test.each(["guest", "account"] as const)(
    "%s has separate report and block actions",
    (access) => {
      const markup = renderToStaticMarkup(
        <StoreConversationSafety {...common} access={access} blocked={false} />,
      )

      expect(markup).toContain("Conversation safety options")
      expect(markup).toContain("Report the Store")
      expect(markup).toContain("Submit report")
      expect(markup).toContain("Block Store")
      expect(markup).toContain("Details (optional)")
      expect(markup).toContain("Hateful content")
    },
  )

  test("blocked conversations retain reporting and an explicit unblock path", () => {
    const markup = renderToStaticMarkup(
      <StoreConversationSafety {...common} access="guest" blocked />,
    )

    expect(markup).toContain("Submit report")
    expect(markup).toContain("Store blocked")
    expect(markup).toContain("Unblock Store")
    expect(markup).toContain("Your conversation history stays available")
  })
})
