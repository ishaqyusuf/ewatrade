import type { RehearsalTurn } from "@ewatrade/ai/rehearsal-model"
type PromptMessage = {
  role: string
  content: string | Array<{ type: string; text?: string }>
}
/** Provider-free development rehearsal; explicit small commands only. */
export function respondGeneralRehearsal(
  prompt: readonly PromptMessage[],
): RehearsalTurn {
  const last = prompt.at(-1)
  if (last?.role === "tool")
    return {
      kind: "text",
      text: "Check the saved records or proposal below. A proposal changes nothing until you press Confirm.",
    }
  const text =
    typeof last?.content === "string"
      ? last.content
      : (last?.content
          .filter((p) => p.type === "text")
          .map((p) => p.text ?? "")
          .join("\n") ?? "")
  const command = text.trim()
  const minor = (value: string) => Math.round(Number(value) * 100)
  const product =
    /^add product (.{1,160}) at (\d+(?:\.\d{1,2})?) per (.{1,80})$/i.exec(
      command,
    )
  if (product?.[1] && product[2] && product[3])
    return {
      kind: "tool",
      toolName: "draftAction",
      input: {
        action: "product_create",
        name: product[1].trim(),
        canonicalUnitName: product[3].trim(),
        priceMinor: minor(product[2]),
      },
    }
  const sale =
    /^sell (\d+(?:\.\d{1,6})?) of (\S{1,128}) at (\d+(?:\.\d{1,2})?)$/i.exec(
      command,
    )
  if (sale?.[1] && sale[2] && sale[3])
    return {
      kind: "tool",
      toolName: "draftAction",
      input: {
        action: "order_create",
        lines: [
          {
            offeringId: sale[2],
            quantity: sale[1],
            expectedFixedPriceMinor: minor(sale[3]),
          },
        ],
      },
    }
  const payment =
    /^pay (\S{1,128}) (\d+(?:\.\d{1,2})?) (cash|card|pos|bank_transfer|other)$/i.exec(
      command,
    )
  if (payment?.[1] && payment[2] && payment[3])
    return {
      kind: "tool",
      toolName: "draftAction",
      input: {
        action: "payment_record",
        orderId: payment[1],
        amountMinor: minor(payment[2]),
        method: payment[3].toLowerCase(),
      },
    }
  const item = /^read item (\S{1,128})$/i.exec(command)
  if (item?.[1])
    return {
      kind: "tool",
      toolName: "readCatalogItem",
      input: { itemId: item[1] },
    }
  const order = /^read order (\S{1,128})$/i.exec(command)
  if (order?.[1])
    return { kind: "tool", toolName: "readOrder", input: { orderId: order[1] } }
  if (/^sales today$/i.test(command)) {
    const start = new Date()
    start.setUTCHours(0, 0, 0, 0)
    return {
      kind: "tool",
      toolName: "readSalesSummary",
      input: {
        createdAfter: start.toISOString(),
        createdBefore: new Date(start.getTime() + 86_400_000).toISOString(),
      },
    }
  }
  const customer = /^add customer ([^\n]{1,160})$/i.exec(text.trim())
  if (customer?.[1])
    return {
      kind: "tool",
      toolName: "draftAction",
      input: { action: "customer_create", name: customer[1].trim() },
    }
  const search = /^search (.{2,160})$/i.exec(text.trim())
  if (search?.[1])
    return {
      kind: "tool",
      toolName: "searchRecords",
      input: { query: search[1] },
    }
  return {
    kind: "text",
    text: "This is the Development rehearsal; no live AI provider is called. Try ‘search rice’, ‘add customer Amina’, ‘add product Eggs at 200 per Piece’, ‘read item <itemId>’, ‘sell 2 of <offeringId> at 200’, ‘read order <orderId>’, ‘pay <orderId> 300 cash’ or ‘sales today’.",
  }
}
