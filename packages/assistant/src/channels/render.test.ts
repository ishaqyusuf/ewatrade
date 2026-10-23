import { expect, test } from "bun:test"
import { generalSearchRecordsAnswer } from "../general/search-answer"
import {
  chunkWhatsAppReply,
  renderWhatsAppFinalReply,
  whatsAppPlainText,
} from "./render"

const asOf = "2026-10-15T09:00:00.000Z"
test("only trusted static record links survive rendering and scope mismatches omit them", () => {
  const origin = { tenantId: "business-one", storeId: "store-one" }
  const answer = {
    ...generalSearchRecordsAnswer([], "Original Store", asOf),
    detail:
      "Filtered first page; retain query and ask which same-name record. https://record.example/secret",
    target: {
      kind: "catalog_item" as const,
      catalogItemId: "eggs/one",
      origin,
    },
  }
  const parts = [{ type: "data-general-answer", data: answer }]
  const options = {
    trustedAppOrigin: "https://dash.example.test",
    currentScope: origin,
  }
  const text = renderWhatsAppFinalReply(parts, options).chunks.join("")
  expect(text).toContain("Filtered first page; retain query")
  expect(text).toContain(
    "https://dash.example.test/sales?catalogDetail=eggs%2Fone",
  )
  expect(text).not.toContain("https://record.example")
  expect(text).toContain("original business and Store")
  expect(
    renderWhatsAppFinalReply(parts, {
      ...options,
      currentScope: { ...origin, storeId: "other" },
    }).chunks.join(""),
  ).not.toContain("https://")
  expect(renderWhatsAppFinalReply(parts).chunks.join("")).not.toContain(
    "https://",
  )
})

test("search facts retain filter context and exact customer navigation, including directory distinction", () => {
  const origin = { tenantId: "business-one", storeId: "store-one" }
  const answer = generalSearchRecordsAnswer(
    [
      {
        type: "customer",
        title: "Amina",
        target: { kind: "customer", customerId: "saved-customer", origin },
      },
    ],
    "Original Store",
    asOf,
  )
  answer.detail =
    "Name filter Amina; two matching names need clarification. This page is incomplete."
  const text = renderWhatsAppFinalReply(
    [{ type: "data-general-answer", data: answer }],
    { trustedAppOrigin: "https://dash.example.test", currentScope: origin },
  ).chunks.join("")
  expect(text).toContain("two matching names need clarification")
  expect(text).toContain("/customers?customerDetail=saved-customer")
  expect(text).toContain("1. Open saved customer in EwaTrade:")
  expect(text).not.toContain("customerQuery=")
})
test("saved authoritative facts supersede model narration and preserve exact recorded money", () => {
  const answer = {
    id: "balances",
    title: "Account balances",
    value: "1 account shown",
    detail:
      "Recorded in your books; not checked against a bank balance or cash count.",
    scope: "Main Store · NGN",
    asOf,
    accounts: {
      currencyCode: "NGN",
      rows: [
        {
          name: "Shop bank",
          kind: "bank",
          balanceMinor: "9007199254740993123",
          methods: ["bank_transfer"],
          defaultMethods: true,
          paused: false,
        },
      ],
      more: true,
    },
  }
  const parts = [
    { type: "text", text: "I paid the supplier and saved the transfer." },
    { type: "data-general-answer", data: answer },
  ]
  const rendered = renderWhatsAppFinalReply(parts)
  expect(rendered.kind).toBe("reply")
  expect(rendered.chunks.join("")).toContain("₦90,071,992,547,409,931.23")
  expect(rendered.chunks.join("")).toContain("not checked against a bank")
  expect(rendered.chunks.join("")).toContain("not a complete list")
  expect(rendered.chunks.join("")).not.toContain("I paid")
  expect(renderWhatsAppFinalReply(parts)).toEqual(rendered)
})
test("search renders only authorized display rows with page, scope and time boundaries", () => {
  const answer = generalSearchRecordsAnswer(
    [
      { type: "customer", title: "Amina", subtitle: "Saved customer" },
      { type: "catalog_item", title: "Eggs", subtitle: "Product · active" },
    ],
    "Main Store",
    asOf,
  )
  const rendered = renderWhatsAppFinalReply([
    { type: "data-general-answer", data: answer },
  ])
  expect(rendered.kind).toBe("reply")
  expect(rendered.chunks.join("")).toContain("1. Amina (customer)")
  expect(rendered.chunks.join("")).toContain("2. Eggs (catalog item)")
  expect(rendered.chunks.join("")).toContain("Limited page, not a total")
  expect(rendered.chunks.join("")).toContain(asOf)
  expect(rendered.chunks.join("")).not.toContain(answer.id)
  expect(
    renderWhatsAppFinalReply([{ type: "data-general-answer", data: answer }], {
      scopeLabel: "Amina business · Main Store",
    }).chunks[0],
  ).toStartWith("*Amina business · Main Store*")
})
test("plain rendering strips dashboard-only links, unverified URLs, tables and display controls", () => {
  const text = whatsAppPlainText(
    "# Results\n[Eggs](#inv:private-id) **₦2,000**\n| Item | Quantity |\n| --- | --- |\n| Eggs | 90 pieces |\nhttps://invented.example/secret www.invented.example\n\u202Eabc\u0000",
  )
  expect(text).toContain("Eggs ₦2,000")
  expect(text).toContain("Eggs · 90 pieces")
  expect(text).not.toContain("private-id")
  expect(text).not.toContain("https:")
  expect(text).not.toContain("www.")
  expect(text).not.toContain("\u202E")
  expect(text).not.toContain("\u0000")
})
test("chunking preserves graphemes and money tokens rather than splitting an amount across messages", () => {
  const text = "e\u0301 👨‍👩‍👧‍👦 ₦123,456,789.00 rice and beans. ".repeat(30)
  const chunks = chunkWhatsAppReply(text, 64)
  expect(chunks.join("")).toBe(text)
  expect(chunks.every((chunk) => chunk.length <= 64)).toBe(true)
  expect(
    chunks
      .filter((chunk) => chunk.includes("₦"))
      .every((chunk) => chunk.includes("₦123,456,789.00")),
  ).toBe(true)
  expect(
    chunks
      .filter((chunk) => chunk.includes("👨"))
      .every((chunk) => chunk.includes("👨‍👩‍👧‍👦")),
  ).toBe(true)
  const amount = "USD\u00a0123,456,789.00"
  expect(
    chunkWhatsAppReply(`${amount} rice `.repeat(20), 64)
      .filter((chunk) => chunk.includes("USD"))
      .every((chunk) => chunk.includes(amount)),
  ).toBe(true)
})
test("long final text is bounded and numbered; unrenderable or oversized replies request app review", () => {
  const rendered = renderWhatsAppFinalReply([
    {
      type: "text",
      text: "A complete sentence about the saved records. ".repeat(200),
    },
  ])
  expect(rendered.kind).toBe("reply")
  expect(rendered.chunks.length).toBeGreaterThan(1)
  expect(rendered.chunks.every((chunk) => chunk.length <= 3000)).toBe(true)
  expect(rendered.chunks[0]).toStartWith("(1/")
  const scoped = renderWhatsAppFinalReply(
    [
      {
        type: "text",
        text: "A complete sentence about the saved records. ".repeat(200),
      },
    ],
    { scopeLabel: "Business A · Main Store" },
  )
  expect(
    scoped.chunks.every(
      (chunk) =>
        chunk.includes("Business A · Main Store") && chunk.length <= 3000,
    ),
  ).toBe(true)
  expect(
    renderWhatsAppFinalReply([{ type: "text", text: "1".repeat(9000) }]).kind,
  ).toBe("app_review")
  expect(
    renderWhatsAppFinalReply(
      Array.from({ length: 5 }, () => ({
        type: "text",
        text: "a ".repeat(7500),
      })),
    ).kind,
  ).toBe("app_review")
})
test("scope-prefixed chunk overflow retains only the exact authorized saved chat handoff", () => {
  const origin = { tenantId: "business-one", storeId: "store-one" }
  const parts = Array.from({ length: 3 }, () => ({
    type: "text",
    text: "record ".repeat(2142),
  }))
  const options = {
    scopeLabel: "S".repeat(500),
    trustedAppOrigin: "https://dash.example.test",
    currentScope: origin,
    conversation: {
      conversationId: "saved-chat",
      purpose: "GENERAL" as const,
      origin,
    },
  } satisfies NonNullable<Parameters<typeof renderWhatsAppFinalReply>[1]>
  const reply = renderWhatsAppFinalReply(parts, options)
  expect(reply.kind).toBe("app_review")
  expect(reply.chunks).toHaveLength(1)
  expect(reply.chunks[0]).toContain(
    "https://dash.example.test/assistant/c/saved-chat",
  )
  expect(
    renderWhatsAppFinalReply(parts, {
      ...options,
      currentScope: { ...origin, storeId: "other" },
    }).chunks.join(""),
  ).not.toContain("https://")
})
test("SDK tool envelopes and approval-bearing unknown parts never become queued reply text", () => {
  for (const parts of [
    [
      {
        type: "tool-draftAction",
        approvalToken: "never-publish",
        input: { amount: "900" },
      },
    ],
    [
      {
        type: "data-general-proposal",
        data: { approvalToken: "never-publish" },
      },
    ],
    null,
  ]) {
    const rendered = renderWhatsAppFinalReply(parts, {
      scopeLabel: "Business A · Main Store",
    })
    expect(rendered.chunks[0]).toStartWith("Business A · Main Store")
    expect(rendered.kind).toBe("app_review")
    expect(rendered.chunks.join("")).not.toContain("never-publish")
  }
})
