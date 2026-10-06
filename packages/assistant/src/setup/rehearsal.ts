/**
 * Provider-free Setup Assistant script for QA tenants and tests. It understands
 * simple "name, price, stock" lines and "X owes me N" sentences; it is not AI.
 */

type PromptMessage = {
  role: string
  content: string | Array<{ type: string; text?: string }>
}

export type SetupRehearsalTurn =
  | { kind: "text"; text: string }
  | { kind: "tool"; toolName: string; input: unknown }

const amount = /(?:₦|ngn|n)?\s*([\d][\d,]*(?:\.\d{1,2})?)\s*(k)?/i

function toDigits(match: RegExpExecArray | null) {
  if (!match?.[1]) return undefined
  const value = Number(match[1].replace(/,/g, ""))
  return String(match[2] ? value * 1000 : value)
}

export function parseSetupRehearsalLines(text: string) {
  const items: Array<Record<string, unknown>> = []
  const customers: Array<Record<string, unknown>> = []
  for (const raw of text.split(/\n|;/)) {
    const line = raw.replace(/^\s*[-*•\d.)]+\s*/, "").trim()
    if (!line) continue
    const owes = /^(.+?)\s+owes(?:\s+me)?\s+(.+)$/i.exec(line)
    if (owes?.[1]) {
      customers.push({
        name: owes[1].trim(),
        owesBusiness: toDigits(amount.exec(owes[2] ?? "")),
        quote: line.slice(0, 240),
      })
      continue
    }
    const [name, ...rest] = line.split(",").map((part) => part.trim())
    if (!name || /^\d/.test(name) || rest.length === 0) continue
    const price = toDigits(amount.exec(rest[0] ?? ""))
    const stockMatch = rest[1] ? /([\d.]+)\s*([a-z]+)?/i.exec(rest[1]) : null
    items.push({
      kind: /service|repair|wash|cut|braid|deliver/i.test(name)
        ? "service"
        : "product",
      name,
      price,
      openingStock: stockMatch?.[1],
      unitName: stockMatch?.[2]
        ? stockMatch[2]
            .replace(/s$/i, "")
            .replace(/^\w/, (c) => c.toUpperCase())
        : undefined,
      quote: line.slice(0, 240),
    })
  }
  return { items, customers }
}

function lastText(message: PromptMessage | undefined) {
  if (!message) return ""
  if (typeof message.content === "string") return message.content
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n")
}

export function respondSetupRehearsal(
  prompt: readonly PromptMessage[],
): SetupRehearsalTurn {
  const last = prompt.at(-1)
  if (last?.role === "tool") {
    const calls = prompt.filter((message) => message.role === "tool").length
    const userIndex = prompt.findLastIndex((message) => message.role === "user")
    const parsed = parseSetupRehearsalLines(lastText(prompt[userIndex]))
    const toolsSinceUser = prompt
      .slice(userIndex)
      .filter((message) => message.role === "tool").length
    if (
      toolsSinceUser === 1 &&
      parsed.items.length > 0 &&
      parsed.customers.length > 0
    )
      return {
        kind: "tool",
        toolName: "setup_draft_upsert_customers",
        input: { customers: parsed.customers },
      }
    return {
      kind: "text",
      text:
        calls > 0
          ? "I've added that to your setup list. Check each one in your setup list, fill in anything missing, then confirm the ones that look right."
          : "Tell me what you sell, one per line.",
    }
  }
  const parsed = parseSetupRehearsalLines(lastText(last))
  if (parsed.items.length > 0)
    return {
      kind: "tool",
      toolName: "setup_draft_upsert_items",
      input: { items: parsed.items },
    }
  if (parsed.customers.length > 0)
    return {
      kind: "tool",
      toolName: "setup_draft_upsert_customers",
      input: { customers: parsed.customers },
    }
  return {
    kind: "text",
    text: "Tell me what you sell, one per line, like: Crate of eggs, 4500, 20 crates.",
  }
}
