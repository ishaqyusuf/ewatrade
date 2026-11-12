import { expect, test } from "bun:test"
import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import {
  TELEGRAM_MESSAGE_MAX,
  fitTelegramMessage,
  renderTelegramActionResult,
  renderTelegramChosenReply,
  renderTelegramFinalReply,
  telegramExactHtml,
  telegramInlineHtml,
  telegramModelLines,
} from "./telegram-render"

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
}
const asOf = "2026-10-20T08:42:00.000Z"
const answer = (extra: Partial<GeneralAnswer> = {}): GeneralAnswer => ({
  id: "answer",
  title: "Stock summary",
  value: "2 items",
  scope: "Mama Ada Provisions · Yaba Main",
  asOf,
  detail: "Recorded stock; availability may differ.",
  ...extra,
})
const parts = (...rows: GeneralAnswer[]) =>
  rows.map((data) => ({ type: "data-general-answer", data }))

/** Every opened tag closes in order and nothing nests inside code. */
function balanced(html: string) {
  const stack: string[] = []
  for (const match of html.matchAll(
    /<(\/?)(b|i|code|blockquote)(?: expandable)?>/g,
  )) {
    const [, close, tag] = match
    if (!tag) return false
    if (close) {
      if (stack.pop() !== tag) return false
    } else {
      if (stack.includes("code")) return false
      if (tag === "blockquote" && stack.includes("blockquote")) return false
      stack.push(tag)
    }
  }
  return stack.length === 0
}

test("escapes & < > in data and model text, and literal names show as written", () => {
  expect(telegramInlineHtml("Tom & Jerry <b>x</b> > 3")).toBe(
    "Tom &amp; Jerry &lt;b&gt;x&lt;/b&gt; &gt; 3",
  )
  const [reply] = renderTelegramFinalReply(
    parts(answer({ title: "A_B *Shop* <script>", value: "R&D" })),
  )
  expect(reply?.html).toBe(true)
  expect(reply?.text).toContain("<b>A_B *Shop* &lt;script&gt;</b>")
  expect(reply?.text).toContain("<b>R&amp;D</b>")
  expect(reply?.text).not.toContain("<script>")
  expect(balanced(reply?.text ?? "")).toBe(true)
})

test("model Markdown maps to b, i and code, and links stay removed", () => {
  expect(telegramInlineHtml("**Eggs** are _fresh_ and `SKU_1`")).toBe(
    "<b>Eggs</b> are <i>fresh</i> and <code>SKU_1</code>",
  )
  expect(telegramInlineHtml("Paid ₦90,071,992,547,409,931.23 today")).toBe(
    "Paid <code>₦90,071,992,547,409,931.23</code> today",
  )
  // Underscores inside words and a bold span that holds an amount stay safe.
  expect(telegramInlineHtml("INV_2026_10 **total ₦5**")).toBe(
    "INV_2026_10 <b>total ₦5</b>",
  )
  const lines = telegramModelLines(
    "## Low stock\n- Rice — 3 bags\n| Item | Qty |\n| --- | --- |\n| Milk | 12 |\nSee https://evil.example/x",
  )
  expect(lines).toEqual([
    "<b>Low stock</b>",
    "• Rice — 3 bags",
    "• Item · Qty",
    "• Milk · 12",
    "See [link omitted]",
  ])
  for (const line of lines) expect(balanced(line)).toBe(true)
})

test("exact amounts, phones, references and quantities go in code", () => {
  expect(telegramExactHtml("0800 000 0777")).toBe("<code>0800 000 0777</code>")
  expect(telegramExactHtml("90 eggs")).toBe("<code>90</code> eggs")
  expect(telegramExactHtml("₦150.00 per egg")).toBe(
    "<code>₦150.00</code> per egg",
  )
  expect(telegramExactHtml("INV_2026-10 & S-1038")).toBe(
    "<code>INV_2026-10</code> &amp; <code>S-1038</code>",
  )
  expect(telegramExactHtml("12 Oct, 20 bags")).toBe("12 Oct, 20 bags")
})

test("answers drop the scope footer but keep as of, title and exact value", () => {
  const [reply] = renderTelegramFinalReply(
    parts(answer({ value: "₦412,500", summary: "14 orders today" })),
    { timeZone: "Africa/Lagos" },
  )
  expect(reply?.text).toBe(
    "<b>Stock summary</b>\n<code>₦412,500</code>\n14 orders today\n<i>as of 20 Oct 9:42 AM</i>",
  )
  expect(reply?.text).not.toContain("Yaba Main")
  const [utc] = renderTelegramFinalReply(parts(answer()))
  expect(utc?.text).toContain("<i>as of 20 Oct 8:42 AM UTC</i>")
})

test("a long list goes in one expandable blockquote with View full response", () => {
  const list = Array.from(
    { length: 24 },
    (_, i) => `${i + 1}. Recorded item — 90 pcs · ₦123,456,789.00`,
  ).join("\n")
  const [reply] = renderTelegramFinalReply(
    [
      {
        type: "text",
        text: `**Recorded items · 24**\n${list}\n_Recorded facts only._`,
      },
    ],
    options,
  )
  expect(
    reply?.text.startsWith(
      "<b>Recorded items · 24</b>\n<blockquote expandable>1. ",
    ),
  ).toBe(true)
  expect(reply?.text).toContain(
    "24. Recorded item — 90 pcs · <code>₦123,456,789.00</code></blockquote>",
  )
  expect(reply?.text).toContain("</blockquote>\n<i>Recorded facts only.</i>")
  expect(balanced(reply?.text ?? "")).toBe(true)
  expect(reply?.buttons).toEqual([
    [
      {
        text: "View full response",
        url: "https://dash.example/open/assistant-response/saved_response_1",
      },
    ],
  ])
  // Five rows or fewer stay as plain lines.
  const [short] = renderTelegramFinalReply([
    { type: "text", text: "1. Rice\n2. Milk\n3. Oil" },
  ])
  expect(short?.text).toBe("1. Rice\n2. Milk\n3. Oil")
})

test("an over-long answer keeps the first rows within 4096 characters", () => {
  const list = Array.from(
    { length: 200 },
    (_, i) => `${i + 1}. Item with a fairly long recorded name number ${i + 1}`,
  ).join("\n")
  const [reply] = renderTelegramFinalReply(
    [{ type: "text", text: `Items\n${list}` }],
    options,
  )
  expect(reply?.text.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_MAX)
  expect(reply?.text).toMatch(/<i>Showing \d+ of 200\.<\/i><\/blockquote>$/)
  expect(balanced(reply?.text ?? "")).toBe(true)
  expect(reply?.buttons?.at(-1)?.[0]).toMatchObject({
    text: "View full response",
  })
  // Text with no list to shorten falls back to the saved chat.
  const [fallback] = renderTelegramFinalReply(
    [{ type: "text", text: "word ".repeat(1200) }],
    options,
  )
  expect(fallback?.text).toContain("saved in EwaTrade")
  expect(fallback?.buttons).toEqual([
    [
      {
        text: "Open saved chat",
        url: "https://dash.example/assistant/c/chat-one",
      },
    ],
  ])
  expect(fitTelegramMessage(["x".repeat(5000)])).toBeNull()
})

test("paged reads show the first three rows and the saved answer", () => {
  const rows: GeneralAnswer[] = [
    answer({
      id: "page",
      title: "Your products",
      value: "9 items",
      continuation: {
        version: 1,
        tool: "readCatalogPage",
        input: { kind: "product", status: "active" },
        nextCursor: "next",
      },
    }),
    ...["Rice 50kg bag", "Sugar 1kg", "Milk tin 400g", "Oil 5L"].map(
      (title, i) =>
        answer({
          id: `row-${i}`,
          title,
          value: "₦78,000 / bag",
          target: { kind: "catalog_item", catalogItemId: `item-${i}`, origin },
        }),
    ),
  ]
  const [reply] = renderTelegramFinalReply(parts(...rows), options)
  expect(reply?.text).toBe(
    "<b>Your products</b>\n1. Rice 50kg bag — <code>₦78,000</code> / bag\n2. Sugar 1kg — <code>₦78,000</code> / bag\n3. Milk tin 400g — <code>₦78,000</code> / bag\n\nFirst 3 shown. More available.\n<i>as of 20 Oct 8:42 AM UTC</i>",
  )
  expect(reply?.buttons).toEqual([
    [
      {
        text: "View full response",
        url: "https://dash.example/open/assistant-response/saved_response_1",
      },
    ],
  ])
  // Without a trusted HTTPS origin there is no button, so the full answer renders.
  const [local] = renderTelegramFinalReply(parts(...rows), {
    ...options,
    trustedAppOrigin: "http://localhost:3000",
  })
  expect(local?.text).toContain("Oil 5L")
  expect(local?.buttons).toBeUndefined()
})

test("saved choices become ch:N buttons, and a pick marks the question", () => {
  const ambiguous = answer({
    title: "Which Chinedu?",
    value: "",
    detail: "Two customers match.",
    chatChoices: [
      { title: "Chinedu Eze", text: "Chinedu Eze, phone ends 0193" },
      { title: "Chinedu Okoro", text: "Chinedu Okoro, phone ends 0874" },
    ],
  })
  const [reply] = renderTelegramFinalReply(parts(ambiguous), options)
  expect(reply?.buttons).toEqual([
    [{ text: "Chinedu Eze", data: "ch:1" }],
    [{ text: "Chinedu Okoro", data: "ch:2" }],
  ])
  const chosen = renderTelegramChosenReply(
    parts(ambiguous),
    "Chinedu Eze",
    options,
  )
  expect(chosen?.text.endsWith("\n\n<b>Chinedu Eze</b> ✓")).toBe(true)
  expect(chosen?.buttons).toBeUndefined()
})

test("draft references and invalid parts hand off to the saved chat", () => {
  const [draft] = renderTelegramFinalReply(
    [
      {
        type: "data-general-proposal-reference",
        data: { proposalId: "p1", revision: 1, payloadHash: "a".repeat(64) },
      },
    ],
    options,
  )
  expect(draft?.text).toContain("complete review in EwaTrade")
  const [invalid] = renderTelegramFinalReply([{ type: "tool-call" }], options)
  expect(invalid?.text).toContain("saved in EwaTrade")
})

test("receipts get a heading, coded exact values and URL buttons", () => {
  const [saved] = renderTelegramActionResult({
    status: "COMPLETED",
    receipt: {
      kind: "customer",
      recordId: "c1",
      title: "Customer added",
      detail: "Name: A_B *Shop*\nPhone: 0800 000 0777",
    } as { title: string; detail: string },
  })
  expect(saved?.text).toBe(
    "✅ <b>Saved in EwaTrade</b>\nCustomer added\nName: A_B *Shop*\nPhone: <code>0800 000 0777</code>",
  )
  const [order] = renderTelegramActionResult(
    {
      status: "COMPLETED",
      receipt: {
        kind: "order",
        recordId: "saved-order",
        orderId: "saved-order",
        title: "Order created",
        detail: "S-1 · total ₦20.00 · remaining ₦16.00",
      } as { title: string; detail: string },
    },
    { appOrigin: "https://dash.ewatrade.com" },
  )
  expect(order?.text).toContain("<code>S-1</code> · total <code>₦20.00</code>")
  expect(order?.text).not.toContain("https://")
  expect(order?.buttons).toEqual([
    [
      {
        text: "Open saved order",
        url: "https://dash.ewatrade.com/sales/orders/saved-order",
      },
    ],
  ])
  const [cancelled] = renderTelegramActionResult({
    status: "CANCELLED",
    receipt: null,
    payload: { action: "order_create" },
  })
  expect(cancelled?.text).toBe(
    "↩️ <b>Draft cancelled</b>\nNo order, stock change or payment was recorded.",
  )
})
