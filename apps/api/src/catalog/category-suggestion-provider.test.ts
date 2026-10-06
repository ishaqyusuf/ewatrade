import { describe, expect, test } from "bun:test"
import { DEFAULT_CATEGORY_SUGGESTION_CONFIGURATION } from "@ewatrade/utils/catalog-category-suggestions"
import { createCategorySuggestionProvider } from "./category-suggestion-provider"

const input = {
  title: "Free-range eggs",
  business: {
    key: "animal-feed-agricultural-supplies",
    title: "Farm supplies",
  },
  paths: [{ id: "path-1", root: "Poultry", child: "Eggs" }],
  signal: new AbortController().signal,
}
function completion(content: string, finishReason = "stop") {
  return Response.json({
    id: "test-completion",
    object: "chat.completion",
    created: 1,
    model: "deepseek-flash",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: finishReason,
      },
    ],
    usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
  })
}
function harness(
  respond: () => Response = () => completion('{"selections":["path-1"]}'),
) {
  const requests: Array<{
    url: string
    headers: Headers
    body: Record<string, unknown>
    redirect?: RequestRedirect
  }> = []
  const fetchImpl = Object.assign(async (...args: Parameters<typeof fetch>) => {
    const [url, init] = args
    requests.push({
      url: String(url),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
      redirect: init?.redirect,
    })
    return respond()
  }, fetch)
  return { requests, fetchImpl }
}
function provider(
  environment: Record<string, string | undefined>,
  fetchImpl: typeof fetch,
  overrides = {},
) {
  const run = createCategorySuggestionProvider(
    { ...DEFAULT_CATEGORY_SUGGESTION_CONFIGURATION, ...overrides },
    { environment, fetchImpl },
  )
  if (!run) throw new Error("Expected a configured test provider")
  return run
}
describe("real SDK adapters with isolated transport", () => {
  test("DeepSeek dedicated key takes precedence and SDK options are bounded", async () => {
    const h = harness()
    const result = await provider(
      {
        CATEGORY_SUGGESTION_DEEPSEEK_API: " dedicated-test ",
        DEEPSEEK_API: "general-test",
      },
      h.fetchImpl,
    )(input)
    expect(result).toEqual({ selections: ["path-1"] })
    expect(h.requests).toHaveLength(1)
    expect(h.requests[0]?.url).toBe("https://api.deepseek.com/chat/completions")
    expect(h.requests[0]?.headers.get("authorization")).toBe(
      "Bearer dedicated-test",
    )
    expect(h.requests[0]?.body).toMatchObject({
      model: "deepseek-flash",
      max_tokens: 256,
      temperature: 0,
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
    })
    expect(h.requests[0]?.redirect).toBe("error")
  })
  test("blank dedicated key falls back to DEEPSEEK_API", async () => {
    const h = harness()
    await provider(
      {
        CATEGORY_SUGGESTION_DEEPSEEK_API: " ",
        DEEPSEEK_API: " fallback-test ",
      },
      h.fetchImpl,
    )(input)
    expect(h.requests[0]?.headers.get("authorization")).toBe(
      "Bearer fallback-test",
    )
  })
  test("OFF, missing credentials and invalid model make no request", () => {
    const h = harness()
    for (const configuration of [
      { ...DEFAULT_CATEGORY_SUGGESTION_CONFIGURATION, enabled: false },
      { ...DEFAULT_CATEGORY_SUGGESTION_CONFIGURATION, model: "gpt-4.1" },
    ]) {
      expect(
        createCategorySuggestionProvider(configuration, {
          environment: { DEEPSEEK_API: "test" },
          fetchImpl: h.fetchImpl,
        }),
      ).toBeNull()
    }
    expect(
      createCategorySuggestionProvider(
        DEFAULT_CATEGORY_SUGGESTION_CONFIGURATION,
        { environment: {}, fetchImpl: h.fetchImpl },
      ),
    ).toBeNull()
    expect(h.requests).toHaveLength(0)
  })
  test("DeepSeek rejects invalid JSON, unknown fields, too many paths and truncation", async () => {
    for (const content of [
      "not-json",
      '{"selections":["path-1"],"invented":true}',
      '{"selections":["1","2","3","4"]}',
    ]) {
      const h = harness(() => completion(content))
      await expect(
        provider({ DEEPSEEK_API: "test" }, h.fetchImpl)(input),
      ).rejects.toThrow()
      expect(h.requests).toHaveLength(1)
    }
    const h = harness(() => completion('{"selections":["path-1"]}', "length"))
    await expect(
      provider({ DEEPSEEK_API: "test" }, h.fetchImpl)(input),
    ).rejects.toThrow()
  })
  test("empty suggestions remain valid", async () => {
    const h = harness(() => completion('{"selections":[]}'))
    expect(
      await provider({ DEEPSEEK_API: "test" }, h.fetchImpl)(input),
    ).toEqual({ selections: [] })
  })
  test("server errors are not retried and oversized responses are rejected", async () => {
    for (const response of [
      Response.json(
        { error: { message: "unavailable", type: "error", code: "500" } },
        { status: 500 },
      ),
      completion("x".repeat(33_000)),
    ]) {
      const h = harness(() => response)
      await expect(
        provider({ DEEPSEEK_API: "test" }, h.fetchImpl)(input),
      ).rejects.toThrow()
      expect(h.requests).toHaveLength(1)
    }
  })
  test("already aborted calls never reach transport", async () => {
    const h = harness()
    await expect(
      provider(
        { DEEPSEEK_API: "test" },
        h.fetchImpl,
      )({ ...input, signal: AbortSignal.abort() }),
    ).rejects.toThrow()
    expect(h.requests).toHaveLength(0)
  })
  test.each([
    ["CATEGORY_SUGGESTION_OPENAI_API", "dedicated-openai"],
    ["OPENAI_API", "general-openai"],
    ["OPENAI_API_KEY", "standard-openai"],
  ])(
    "OpenAI adapter resolves %s and disables response storage",
    async (key, value) => {
      const h = harness(() =>
        Response.json({
          id: "resp-test",
          created_at: 1,
          model: "gpt-4.1",
          status: "completed",
          output: [
            {
              type: "message",
              id: "msg-test",
              role: "assistant",
              status: "completed",
              content: [
                {
                  type: "output_text",
                  text: '{"selections":["path-1"]}',
                  annotations: [],
                },
              ],
            },
          ],
          usage: { input_tokens: 5, output_tokens: 5, total_tokens: 10 },
        }),
      )
      expect(
        await provider({ [key]: value }, h.fetchImpl, {
          provider: "OPENAI",
          model: "gpt-4.1",
        })(input),
      ).toEqual({ selections: ["path-1"] })
      expect(h.requests[0]?.url).toBe("https://api.openai.com/v1/responses")
      expect(h.requests[0]?.headers.get("authorization")).toBe(
        `Bearer ${value}`,
      )
      expect(h.requests[0]?.body).toMatchObject({
        model: "gpt-4.1",
        store: false,
        max_output_tokens: 256,
      })
    },
  )
})
