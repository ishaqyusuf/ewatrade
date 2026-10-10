import { expect, test } from "bun:test"
import { parseArgs } from "../../../scripts/dev"
import { config, publisherProblem } from "./config"

test("wapi is selectable together with dashboard through the existing router", () => {
  expect(parseArgs(["--f", "wapi", "dashboard"]).filters?.targets).toEqual([
    "@ewatrade/wapi",
    "@ewatrade/dashboard",
  ])
})

test("managed cache stays in EwaTrade; borrowed service needs an explicit cache", () => {
  const value = config({}, "/work/ewatrade")
  expect(value.service).toBe("/work/al-ghurobaa/services/transcriber")
  expect(value.cache).toBe("/work/ewatrade/apps/wapi/.cache/whisper")
  expect(value.reuseCache).toBeUndefined()
  expect(
    config({ ASSISTANT_WHISPER_CACHE_DIR: "/shared/cache" }, "/work/ewatrade")
      .reuseCache,
  ).toBe("/shared/cache")
})

test("refuses remote, credential-bearing or path-based raw Whisper URLs", () => {
  for (const url of [
    "https://example.com",
    "http://127.0.0.1/private",
    "http://user:secret@localhost",
    "http://localhost?token=secret",
  ])
    expect(() => config({ ASSISTANT_WHISPER_URL: url }, "/work")).toThrow(
      "loopback",
    )
})

test("tunnel waits for complete authenticated HTTPS registry configuration", () => {
  expect(publisherProblem({})).toContain("ASSISTANT_VOICE_REGISTRY_URL")
  const env = {
    ASSISTANT_VOICE_REGISTRY_URL:
      "https://api.example.com/api/assistant/voice/gateway",
    ASSISTANT_VOICE_PUBLISH_SECRET: "p".repeat(32),
    ASSISTANT_VOICE_GATEWAY_SECRET: "g".repeat(32),
    APP_ENV: "local",
  }
  expect(publisherProblem(env)).toBeNull()
  expect(
    publisherProblem({ ...env, ASSISTANT_VOICE_GATEWAY_SECRET: "short" }),
  ).toContain("secrets")
  expect(
    publisherProblem({
      ...env,
      ASSISTANT_VOICE_REGISTRY_URL:
        "http://api.example.com/api/assistant/voice/gateway",
    }),
  ).toContain("HTTPS")
})
