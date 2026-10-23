export const conversationIds = ["setup", "sales", "product", "money"] as const
export type ConversationId = (typeof conversationIds)[number]
export const conversationLabels: Record<ConversationId, string> = {
  setup: "Set up business",
  sales: "Today’s sales",
  product: "Add a product",
  money: "Money received",
}
export type DemoMessage = {
  id: number
  from: "me" | "it" | "sys"
  text: string
}
export type DemoDraft = { title: string; rows: [string, string][] }
export type DemoConversation = {
  messages: DemoMessage[]
  stage: "question" | "draft" | "saved" | "answered"
  draft?: DemoDraft
}
export const SAMPLE_BUSINESS = "Al-Jawdah Agro-Biz"
export const sampleMoney = (n: number) => `₦${n.toLocaleString("en-NG")}`
export function startConversation(id: ConversationId): DemoConversation {
  const prompts: Record<ConversationId, [string, string]> = {
    setup: [
      "Set up my business. Al-Jawdah Agro-Biz, poultry in Ilorin. I sell crates of eggs at ₦5,500 and live broilers at ₦8,000 each.",
      "Happy to set it up. I have your business name, type, city and 2 items with prices. How many of each do you have right now? You can also count later.",
    ],
    sales: [
      "How are sales today? Anything running low?",
      "Here’s Al-Jawdah Agro-Biz so far today.",
    ],
    product: [
      "Add smoked catfish to my catalog",
      "Happy to draft it. What’s the selling price, and do you sell it by the piece or by the pack?",
    ],
    money: [
      "Received ₦7,500 by transfer from Mr Okon for 6 bags of poultry manure",
      "I’ll draft a simple sale: money received, with your description. It does not change stock. Review it before it is saved.",
    ],
  }
  const [question, answer] = prompts[id]
  return {
    messages: [
      { id: 0, from: "me", text: question },
      { id: 1, from: "it", text: answer },
    ],
    stage: id === "money" ? "draft" : id === "sales" ? "answered" : "question",
    draft:
      id === "money"
        ? {
            title: "Simple sale",
            rows: [
              ["Amount", "₦7,500"],
              ["Paid by", "Transfer"],
              ["From", "Mr Okon"],
              ["Description", "6 bags of poultry manure"],
              ["Stock", "No change"],
            ],
          }
        : undefined,
  }
}
export function answerConversation(
  id: ConversationId,
  current: DemoConversation,
  text: string,
  salesTotal = 184500,
): DemoConversation {
  const messages: DemoMessage[] = [
    ...current.messages,
    { id: current.messages.length, from: "me", text: text.slice(0, 160) },
  ]
  let draft: DemoDraft | undefined
  if (id === "setup" && current.stage === "question") {
    const numbers = (text.match(/-?\d[\d,]*/g) || []).map((n) =>
      Number(n.replaceAll(",", "")),
    )
    if (
      (numbers.length >= 2 &&
        numbers.every((n) => Number.isInteger(n) && n >= 0 && n <= 100000)) ||
      /later|skip|not yet|don.?t know/i.test(text)
    ) {
      draft = {
        title: SAMPLE_BUSINESS,
        rows: [
          ["Type", "Poultry & feed"],
          ["City", "Ilorin"],
          [
            "Crate of eggs",
            `₦5,500 a crate · ${
              numbers.length >= 2 ? `${numbers[0]} crates` : "Not counted yet"
            }`,
          ],
          [
            "Live broiler",
            `₦8,000 a bird · ${numbers.length >= 2 ? `${numbers[1]} birds` : "Not counted yet"}`,
          ],
          ["Catalog", "2 items"],
        ],
      }
    }
  }
  if (id === "product" && current.stage === "question") {
    const price = Number(
      (text.match(/-?\d[\d,]*(?:\.\d+)?/)?.[0] ?? "").replaceAll(",", ""),
    )
    if (price >= 50 && price <= 5000000)
      draft = {
        title: "Smoked catfish",
        rows: [
          ["Type", "Product"],
          ["Price", sampleMoney(price)],
          ["Unit", /pack/i.test(text) ? "pack of 3" : "piece"],
        ],
      }
  }
  if (draft)
    return {
      messages: [
        ...messages,
        {
          id: messages.length,
          from: "it",
          text: "Here’s your draft. Nothing is saved yet.",
        },
      ],
      draft,
      stage: "draft",
    }
  const answer = /owe|owing|debt|balance/i.test(text)
    ? "Musa Bello owes ₦21,000, Amina Yusuf ₦12,000 and Mr Okon ₦9,000. Total owed: ₦42,000."
    : /sale|today|revenue/i.test(text)
      ? `Today: ${sampleMoney(current.stage === "saved" && id === "money" ? 192000 : salesTotal)} from 23 orders. Layer feed is low at 6 bags.`
      : /stock|left|low/i.test(text)
        ? "Sample stock: 120 crates of eggs, 40 live broilers and 6 bags of layer feed. Layer feed is running low."
        : id === "setup" && current.stage === "question"
          ? "Tell me the number of egg crates and live birds, or choose ‘I’ll count later’."
          : id === "product" && current.stage === "question"
            ? "Tell me a price and whether you sell by the piece or pack."
            : "This is a sample conversation. Use the example choices, or start on WhatsApp to speak with your own assistant."
  return {
    ...current,
    messages: [...messages, { id: messages.length, from: "it", text: answer }],
  }
}
export function confirmConversation(
  current: DemoConversation,
): DemoConversation {
  if (current.stage !== "draft" || !current.draft) return current
  return {
    ...current,
    stage: "saved",
    messages: [
      ...current.messages,
      {
        id: current.messages.length,
        from: "sys",
        text: "You confirmed the sample change in ẸwáTrade",
      },
      {
        id: current.messages.length + 1,
        from: "it",
        text:
          current.draft.title === "Simple sale"
            ? "Sample saved. ₦7,500 is recorded; sales today are ₦192,000. Stock is unchanged."
            : "Sample saved. Your assistant will confirm the result in WhatsApp.",
      },
    ],
  }
}
