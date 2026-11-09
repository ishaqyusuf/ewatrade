import { expect, test } from "bun:test"
import { authorizedLiveAiFetch } from "./dispatch-guard"

test("each actual outbound request requires fresh authority and forwards allowed requests unchanged", async () => {
  let adult = true
  let checks = 0
  let sends = 0
  const inputs: unknown[] = []
  const transport = Object.assign(async (...args: Parameters<typeof fetch>) => {
    sends += 1
    inputs.push(args)
    return new Response("ok")
  }, fetch)
  const guarded = authorizedLiveAiFetch(async () => {
    checks += 1
    if (!adult) throw new Error("LIVE_AI_ADULT_REQUIRED")
  }, transport)
  const init = { method: "POST", body: "permitted prompt" }
  expect(
    await (await guarded("https://provider.invalid/model", init)).text(),
  ).toBe("ok")
  adult = false
  await expect(guarded("https://provider.invalid/model", init)).rejects.toThrow(
    "LIVE_AI_ADULT_REQUIRED",
  )
  await expect(guarded("https://provider.invalid/model", init)).rejects.toThrow(
    "LIVE_AI_ADULT_REQUIRED",
  )
  expect(checks).toBe(3)
  expect(sends).toBe(1)
  expect(inputs).toEqual([["https://provider.invalid/model", init]])
})

test("authority read failures do not dispatch", async () => {
  let sends = 0
  const guarded = authorizedLiveAiFetch(
    async () => {
      throw new Error("authority unavailable")
    },
    Object.assign(async () => {
      sends += 1
      return new Response()
    }, fetch),
  )
  await expect(guarded("https://provider.invalid/model")).rejects.toThrow(
    "authority unavailable",
  )
  expect(sends).toBe(0)
})
