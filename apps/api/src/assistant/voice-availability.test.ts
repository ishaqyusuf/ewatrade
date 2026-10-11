import { expect, test } from "bun:test"
import { assistantVoiceAvailability } from "./voice-availability"

type Attempt = { outcome: string; errorCode: string | null; startedAt: Date }
function db(lease: unknown, attempts: Record<string, Attempt[]> = {}) {
  return {
    systemConfiguration: {
      findUnique: async () => (lease ? { value: lease } : null),
    },
    assistantTranscriptionAttempt: {
      findMany: async ({ where }: { where: { provider: string } }) =>
        attempts[where.provider] ?? [],
    },
  } as never
}
const live = {
  url: "https://voice-123.ngrok-free.app",
  generation: "00000000-0000-4000-8000-000000000000",
  environment: "preview",
  expiresAt: Date.now() + 60_000,
}
const env = (extra: Record<string, string> = {}) => ({
  APP_ENV: "preview",
  ...extra,
})

test("no transcriber means no mic", async () => {
  expect(await assistantVoiceAvailability(db(null), env())).toEqual({
    available: false,
    provider: null,
    reason: "no_provider",
  })
})

test("local Whisper needs a live lease for this environment", async () => {
  expect((await assistantVoiceAvailability(db(live), env())).provider).toBe(
    "local_whisper",
  )
  // Expired lease, or another environment's lease: unavailable.
  expect(
    (
      await assistantVoiceAvailability(
        db({ ...live, expiresAt: Date.now() - 1 }),
        env(),
      )
    ).available,
  ).toBe(false)
  expect(
    (
      await assistantVoiceAvailability(
        db({ ...live, environment: "production" }),
        env(),
      )
    ).available,
  ).toBe(false)
})

test("a cloud key counts until its last attempt fails on auth or credit", async () => {
  const withKey = env({ XAI_API_KEY: "key" })
  expect((await assistantVoiceAvailability(db(null), withKey)).provider).toBe(
    "xai",
  )
  const noCredit = {
    xai: [
      { outcome: "failed", errorCode: "RATE_LIMITED", startedAt: new Date() },
    ],
  }
  expect(await assistantVoiceAvailability(db(null, noCredit), withKey)).toEqual(
    { available: false, provider: null, reason: "no_provider" },
  )
})
