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
  environment: "production",
  expiresAt: Date.now() + 60_000,
}
const env = (extra: Record<string, string> = {}) => ({
  ASSISTANT_VOICE_ENABLED: "true",
  APP_ENV: "production",
  ...extra,
})

test("off unless the voice flag is on", async () => {
  expect(
    (
      await assistantVoiceAvailability(db(live), "t1", {
        APP_ENV: "production",
      })
    ).reason,
  ).toBe("off")
})

test("local Whisper needs enrolment and a live lease for this environment", async () => {
  const enrolled = env({ ASSISTANT_LOCAL_TENANT_IDS: "*" })
  expect(
    (await assistantVoiceAvailability(db(live), "t1", enrolled)).provider,
  ).toBe("local_whisper")
  // Not enrolled, expired lease, or another environment's lease: unavailable.
  expect(
    (await assistantVoiceAvailability(db(live), "t1", env())).available,
  ).toBe(false)
  expect(
    (
      await assistantVoiceAvailability(
        db({ ...live, expiresAt: Date.now() - 1 }),
        "t1",
        enrolled,
      )
    ).available,
  ).toBe(false)
  expect(
    (
      await assistantVoiceAvailability(
        db({ ...live, environment: "preview" }),
        "t1",
        enrolled,
      )
    ).available,
  ).toBe(false)
})

test("a cloud key counts until its last attempt fails on auth or credit", async () => {
  const withKey = env({ XAI_API_KEY: "key" })
  expect(
    (await assistantVoiceAvailability(db(null), "t1", withKey)).provider,
  ).toBe("xai")
  const noCredit = {
    xai: [
      { outcome: "failed", errorCode: "RATE_LIMITED", startedAt: new Date() },
    ],
  }
  expect(
    await assistantVoiceAvailability(db(null, noCredit), "t1", withKey),
  ).toEqual({ available: false, provider: null, reason: "no_provider" })
})
