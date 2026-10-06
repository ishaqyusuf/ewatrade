import type {
  LanguageModelV3CallOptions,
  LanguageModelV3StreamPart,
} from "@ai-sdk/provider"
import { simulateReadableStream } from "ai"
import { MockLanguageModelV3 } from "ai/test"

export type RehearsalTurn =
  | { kind: "text"; text: string }
  | { kind: "tool"; toolName: string; input: unknown }

/**
 * Deterministic, provider-free model for QA tenants and tests. It satisfies the
 * QA provider policy's test-adapter requirement: no prompt leaves the server.
 */
export function createRehearsalModel(
  respond: (prompt: LanguageModelV3CallOptions["prompt"]) => RehearsalTurn,
) {
  let callCount = 0
  return new MockLanguageModelV3({
    provider: "ewatrade-rehearsal",
    modelId: "rehearsal-v1",
    doStream: async (options) => {
      callCount += 1
      const turn = respond(options.prompt)
      const usage = {
        inputTokens: {
          total: 0,
          noCache: 0,
          cacheRead: 0,
          cacheWrite: 0,
        },
        outputTokens: { total: 0, text: 0, reasoning: 0 },
      }
      const chunks: LanguageModelV3StreamPart[] =
        turn.kind === "tool"
          ? [
              {
                type: "tool-call",
                toolCallId: `rehearsal-${callCount}`,
                toolName: turn.toolName,
                input: JSON.stringify(turn.input),
              },
              {
                type: "finish",
                finishReason: { unified: "tool-calls", raw: "tool_calls" },
                usage,
              },
            ]
          : [
              { type: "text-start", id: "text" },
              ...turn.text.split(/(?<= )/).map(
                (delta): LanguageModelV3StreamPart => ({
                  type: "text-delta",
                  id: "text",
                  delta,
                }),
              ),
              { type: "text-end", id: "text" },
              {
                type: "finish",
                finishReason: { unified: "stop", raw: "stop" },
                usage,
              },
            ]
      return {
        stream: simulateReadableStream({ chunks, chunkDelayInMs: 12 }),
      }
    },
  })
}
