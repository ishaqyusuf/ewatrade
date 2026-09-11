import { describe, expect, test } from "bun:test"

import { renderToStaticMarkup } from "react-dom/server"

import { WhatsAppConversationAction } from "./store-conversation-web"

describe("Store Conversation WhatsApp action", () => {
  test("renders a secondary Both-mode action without implying arrival", () => {
    const markup = renderToStaticMarkup(
      <WhatsAppConversationAction
        action="reach_store_faster_on_whatsapp"
        onOpen={() => undefined}
        opening={false}
      />,
    )

    expect(markup).toContain("Reach the Store faster on WhatsApp")
    expect(markup).toContain("border-border")
    expect(markup).not.toMatch(/opened|linked|delivered|read/i)
  })

  test("disables the action and presents truthful preparation while issuing", () => {
    const markup = renderToStaticMarkup(
      <WhatsAppConversationAction
        action="continue_on_whatsapp"
        onOpen={() => undefined}
        opening
      />,
    )

    expect(markup).toContain("Preparing WhatsApp…")
    expect(markup).toContain("disabled")
    expect(markup).toContain("bg-primary")
  })
})
