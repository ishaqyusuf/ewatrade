import type {
  ModelMessage,
  ToolLoopAgent,
  ToolSet,
  UIMessage,
  UIMessageStreamWriter,
} from "ai"

/**
 * A reply that only promises work and called no tool. DeepSeek sometimes ends
 * a turn on its preamble: "Use 90 pieces… Draft it." got "I'll draft the stock
 * receipt now." in one step with no tool call (12 Oct 2026), so nothing was
 * drafted. The route gives such a reply one more pass.
 */
export function announcedWithoutAction(
  steps: ReadonlyArray<{ toolCalls: readonly unknown[]; text: string }>,
) {
  if (!steps.length || steps.some((step) => step.toolCalls.length)) return false
  const text = steps
    .map((step) => step.text)
    .join(" ")
    .trim()
  if (!text || text.length > 240 || text.includes("?")) return false
  return (
    /\b(?:I['’]ll|I will|I am going to|I['’]m going to|let me)\b[^.!]*\b(?:draft|create|record|prepare|stage|add|read|check|look|find|search|get)\b/i.test(
      text,
    ) ||
    /^(?:ok(?:ay)?[,.]?\s+)?(?:drafting|creating|preparing|recording)\b/i.test(
      text,
    )
  )
}

export const ANNOUNCED_ACTION_NUDGE =
  "[App note, not from the user] Your last reply announced an action but called no tool, so nothing happened. Do it now in this reply: call the tools (read the records again first if you need their identifiers), or say plainly what is missing. Do not announce it again."

/**
 * Streams one GENERAL reply into `writer`, giving an announce-only reply one
 * more pass that continues the same message (one start, one finish).
 */
export async function streamGeneralReply<
  M extends UIMessage,
  TOOLS extends ToolSet,
>(
  agent: Pick<ToolLoopAgent<never, TOOLS>, "stream">,
  messages: ModelMessage[],
  writer: UIMessageStreamWriter<M>,
  abortSignal: AbortSignal,
) {
  const result = await agent.stream({ messages, abortSignal })
  // Written in order so a second pass can continue the same message.
  for await (const chunk of result.toUIMessageStream<M>({
    sendReasoning: false,
    sendFinish: false,
  }))
    writer.write(chunk)
  if (!announcedWithoutAction(await result.steps)) {
    writer.write({ type: "finish" })
    return
  }
  const retry = await agent.stream({
    messages: [
      ...messages,
      ...(await result.response).messages,
      { role: "user", content: ANNOUNCED_ACTION_NUDGE },
    ],
    abortSignal,
  })
  writer.merge(
    retry.toUIMessageStream<M>({ sendReasoning: false, sendStart: false }),
  )
}
