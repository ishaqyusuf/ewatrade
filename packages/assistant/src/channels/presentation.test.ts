import { expect, test } from "bun:test"
import { whatsAppAssistantInstructions } from "./instructions"
import {
  chunkWhatsAppFormattedReply,
  presentWhatsAppMessage,
  whatsAppBold,
  whatsAppModelText,
} from "./presentation"
import {
  renderWhatsAppFinalReply,
  supportedWhatsAppReplyRenderer,
} from "./render"

test("model syntax becomes native WhatsApp formatting without accepting invented navigation", () => {
  const text = whatsAppModelText(
    "# Stock summary\n\n**Eggs:** 90 pieces\n_Note_ ~old~ `REF-1`\n> A quotation\n- First\n1. Choose\n[Amina](#customer:private) https://invented.test/private\n\u202e\u0000",
  )
  expect(text).toContain("*Stock summary*")
  expect(text).toContain("*Eggs:* 90 pieces")
  expect(text).toContain("_Note_ ~old~ `REF-1`")
  expect(text).toContain("> A quotation\n- First\n1. Choose")
  expect(text).toContain("Amina [link omitted]")
  expect(text).not.toMatch(/private|\*\*/)
  expect(text).not.toContain(String.fromCodePoint(0x202e))
  expect(text).not.toContain(String.fromCodePoint(0))
})

test("server review keeps complete facts, literal punctuation, trusted URLs and typed approval tokens", () => {
  const code = "x".repeat(43)
  const body = `Record sale\n\nBusiness: A_B *Shop*\nStore: Main Store\nTotal: ₦90,071,992,547,409,931.23\n\nConfirm ${code}\nhttps://dash.example/r/abc_def?x=1&y=2`
  const rendered = presentWhatsAppMessage(body, { family: "review" })
  expect(rendered).toStartWith("📝 *Review draft*\n\n")
  expect(rendered).toContain("*Business:* `A_B *Shop*`")
  expect(rendered).toContain("*Total:* ₦90,071,992,547,409,931.23")
  expect(rendered).toContain(`Confirm ${code}`)
  expect(rendered).toContain("https://dash.example/r/abc_def?x=1&y=2")
  expect(presentWhatsAppMessage(rendered, { family: "review" })).toBe(rendered)
  expect(whatsAppBold("SKU_A*B")).toBe("`SKU_A*B`")
  expect(whatsAppBold("A**B")).toBe("`A**B`")
})

test("draft, saved, refused and cancelled messages keep distinct status meaning", () => {
  expect(
    presentWhatsAppMessage("Draft ready. Not saved yet.", { family: "review" }),
  ).not.toContain("✅")
  expect(
    presentWhatsAppMessage("No selected records were added.", {
      family: "result",
    }),
  ).not.toContain("✅")
  expect(
    presentWhatsAppMessage("Saved in EwaTrade.\n\nCustomer added.", {
      family: "result",
    }),
  ).toBe("✅ *Saved in EwaTrade*\n\nCustomer added.")
  expect(
    presentWhatsAppMessage("Draft cancelled.", { family: "result" }),
  ).toStartWith("↩️ *Draft cancelled*")
  expect(presentWhatsAppMessage("How many eggs are in one crate?")).toBe(
    "How many eggs are in one crate?",
  )
})

test("transport bounds preserve all review facts when decoration cannot fit", () => {
  const exact = `Review: ${"a".repeat(1016)}`
  expect(exact.length).toBe(1024)
  expect(
    presentWhatsAppMessage(exact, { family: "review", maxUnits: 1024 }),
  ).toBe(exact)
  const rendered = presentWhatsAppMessage("Store: Main\n\nChoose one option.", {
    family: "menu",
    maxUnits: 1024,
  })
  expect(rendered.length).toBeLessThanOrEqual(1024)
  expect(rendered).toContain("🧭 *EwaTrade menu*")
})

test("long formatted replies keep whole paragraphs and indivisible styles, money, URLs and emoji", () => {
  const paragraph =
    "📋 *Stock summary*\n\n*Family:* 👨‍👩‍👧‍👦\n*Total:* ₦123,456,789.00\n\n"
  const chunks = chunkWhatsAppFormattedReply(paragraph.repeat(8), 120)
  expect(chunks.length).toBeGreaterThan(1)
  for (const chunk of chunks) {
    expect(chunk.length).toBeLessThanOrEqual(120)
    expect((chunk.match(/\*/g)?.length ?? 0) % 2).toBe(0)
    if (chunk.includes("₦")) expect(chunk).toContain("₦123,456,789.00")
    if (chunk.includes("👨")) expect(chunk).toContain("👨‍👩‍👧‍👦")
  }
  expect(() =>
    chunkWhatsAppFormattedReply(`*${"a ".repeat(80)}*`, 64),
  ).toThrow()
})

test("actual General renderer styles authoritative facts and suppresses conflicting model narration", () => {
  const answer = {
    id: "synthetic",
    title: "Egg stock",
    value: "90 pieces",
    detail: "Recorded stock; not a promise of availability.",
    scope: "Main Store",
    asOf: "2026-10-22T12:00:00.000Z",
  }
  const rendered = renderWhatsAppFinalReply([
    { type: "text", text: "I sold 100 pieces." },
    { type: "data-general-answer", data: answer },
  ])
  expect(rendered.version).toBe("whatsapp-reply-v3")
  const text = rendered.chunks.join("\n")
  expect(text).toContain("📋 *Egg stock*\n\n*90 pieces*")
  expect(text).toContain("*Scope:* Main Store")
  expect(text).toContain("not a promise of availability")
  expect(text).not.toContain("sold 100")
  expect(whatsAppAssistantInstructions()).toContain("one asterisk each side")
})

test("new chunking preserves nonbreaking currency spaces and every fact across pages", () => {
  const amount = "USD\u00a0123,456,789.00"
  const chunks = chunkWhatsAppFormattedReply(`${amount} rice `.repeat(20), 64)
  for (const chunk of chunks) {
    if (chunk.includes("USD")) expect(chunk).toContain(amount)
  }
  expect(chunks.join(" ").match(/USD/g)).toHaveLength(20)
})

test("legacy reply versions remain supported without admitting unknown renderers", () => {
  for (const version of [
    "whatsapp-reply-v1",
    "whatsapp-reply-v2",
    "whatsapp-reply-v3",
  ])
    expect(supportedWhatsAppReplyRenderer(version)).toBe(true)
  expect(supportedWhatsAppReplyRenderer("whatsapp-reply-v99")).toBe(false)
})

test("a record's quantities and qualification stay together when its section fits", () => {
  const sections = Array.from(
    { length: 4 },
    (_, index) =>
      `*${index + 1}. Recorded item*\nQuantity: 90 pieces\nAmount: ₦150.00\n\n_Recorded facts for this item._\n\n`,
  )
  const chunks = chunkWhatsAppFormattedReply(sections.join(""), 128)
  for (const chunk of chunks) {
    expect(chunk).toContain("Quantity: 90 pieces")
    expect(chunk).toContain("_Recorded facts for this item._")
  }
})

test("only identical adjacent scope/time context is grouped, and literal names retain punctuation", () => {
  const answer = {
    id: "a",
    title: "A**B",
    value: "90 pieces",
    detail: "Recorded stock.",
    scope: "Main Store",
    asOf: "2026-10-22T12:00:00.000Z",
  }
  const parts = [
    answer,
    { ...answer, id: "b", title: "Rice" },
    { ...answer, id: "c", title: "Beans", scope: "Other Store" },
  ].map((data) => ({ type: "data-general-answer", data }))
  const text = renderWhatsAppFinalReply(parts).chunks.join("\n")
  expect(text).toContain("`A**B`")
  expect(text.match(/\*Scope:\* Main Store/g)).toHaveLength(1)
  expect(text.match(/\*Scope:\* Other Store/g)).toHaveLength(1)
  expect(
    presentWhatsAppMessage("Saved in EwaTrade.", { family: "reply" }),
  ).not.toContain("✅")
})
