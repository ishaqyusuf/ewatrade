import { expect, test } from "bun:test"
import type { GeneralAnswer } from "../general/contracts"
import {
  assistantResponseAppLink,
  assistantResponseConversationPath,
} from "./conversation-links"
import { renderWhatsAppFinalReply } from "./render"

const origin = { tenantId: "tenant", storeId: "store" }
const options = {
  messageId: "saved_response_1",
  currentScope: origin,
  trustedAppOrigin: "https://dash.example",
  conversation: {
    conversationId: "chat-one",
    purpose: "GENERAL" as const,
    origin,
  },
  scopeLabel: "Shop · Main Store",
}
function answers(
  count = 5,
  nextCursor: string | null = "next",
): GeneralAnswer[] {
  return [
    {
      id: "page",
      title: "Catalog",
      value: `${count} items`,
      scope: "Current business · catalog",
      asOf: "2026-11-10T12:00:00Z",
      detail:
        "Kind: product; status: active; sorted by name. Page length is not a catalog total.",
      continuation: {
        version: 1,
        tool: "readCatalogPage",
        input: { kind: "product", status: "active" },
        nextCursor,
      },
    },
    ...Array.from({ length: count }, (_, i) => ({
      id: `row-${i}`,
      title: `Item ${i + 1}`,
      value: "product · ACTIVE",
      scope: "Catalog",
      asOf: "2026-11-10T12:00:01Z",
      detail: "Read the saved item for variant and price.",
      target: {
        kind: "catalog_item" as const,
        catalogItemId: `item-${i}`,
        origin,
      },
    })),
  ]
}
const parts = (rows: GeneralAnswer[]) =>
  rows.map((data) => ({ type: "data-general-answer", data }))
test("first three canonical rows share one exact saved-response link, with scope, filters and no invented total", () => {
  const rendered = renderWhatsAppFinalReply(
    [
      { type: "text", text: "Made up price ₦90 and total 100." },
      ...parts(answers()),
    ],
    options,
  )
  expect(rendered.chunks).toHaveLength(1)
  const text = rendered.chunks[0] ?? ""
  for (const name of [
    "Item 1",
    "Item 2",
    "Item 3",
    "Shop",
    "Main Store",
    "status: active",
    "not a total",
    "More available",
    "As of 2026-11-10",
  ])
    expect(text).toContain(name)
  for (const name of ["Item 4", "Item 5", "₦90", "total 100"])
    expect(text).not.toContain(name)
  expect(text).toContain(
    "View full response:\nhttps://dash.example/open/assistant-response/saved_response_1",
  )
})
test("bounded end pages do not claim more results, and empty/short answers keep existing replies", () => {
  expect(
    renderWhatsAppFinalReply(parts(answers(2, null)), options).chunks.join(),
  ).toContain("All matches shown")
  const empty = renderWhatsAppFinalReply(
    parts(answers(0, null)),
    options,
  ).chunks.join()
  expect(empty).not.toContain("First 0")
  expect(empty).not.toContain("More available")
  const short = renderWhatsAppFinalReply(
    [{ type: "text", text: "Hello there." }],
    options,
  ).chunks.join()
  expect(short).toContain("Hello there.")
  expect(short).not.toContain("View full response")
})
test("no trusted exact identity or mixed answer family means no lossy preview", () => {
  const all = parts(answers())
  for (const altered of [
    { ...options, messageId: undefined },
    { ...options, trustedAppOrigin: "https://foreign.example/untrusted" },
    { ...options, currentScope: { ...origin, storeId: "other" } },
  ]) {
    const text = renderWhatsAppFinalReply(all, altered).chunks.join()
    expect(text).toContain("Item 5")
    expect(text).not.toContain("View full response")
  }
  const rows = answers()
  if (rows[1]) rows[1].target = undefined
  expect(
    renderWhatsAppFinalReply(parts(rows), options).chunks.join(),
  ).toContain("Item 5")
})
test("literal product names and precise authoritative financial values are preserved", () => {
  const rows = answers()
  if (!rows[1]) throw Error("Test row required")
  rows[1].title = "A_B *Feed*"
  rows[1].value = "₦90,071,992,547,409,931.23 / 25 kg"
  const text = renderWhatsAppFinalReply(parts(rows), options).chunks.join()
  expect(text).toContain("`A_B *Feed*`")
  expect(text).toContain("₦90,071,992,547,409,931.23 / 25 kg")
})
test("proposal references never become ordinary compact replies or approval links", () => {
  const text = renderWhatsAppFinalReply(
    [
      ...parts(answers()),
      {
        type: "data-general-proposal-reference",
        data: {
          proposalId: "proposal",
          revision: 1,
          payloadHash: "a".repeat(64),
        },
      },
    ],
    options,
  )
  expect(text.kind).toBe("app_review")
  expect(text.chunks.join()).not.toContain("View full response")
})
test("navigation URLs contain strict non-credential identities and preserve exact chat focus", () => {
  expect(
    assistantResponseConversationPath({
      conversationId: "chat/one",
      messageId: "message_1",
    }),
  ).toBe("/assistant/c/chat%2Fone?messageId=message_1")
  for (const message of ["../wrong", "a?token=secret", "", "a".repeat(129)])
    expect(assistantResponseAppLink(message, options)).toBeUndefined()
})
