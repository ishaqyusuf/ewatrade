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
    text: "This is the Development rehearsal. Try ‘search rice’ or ‘add customer Amina’. No live AI provider is called.",
  }
}
