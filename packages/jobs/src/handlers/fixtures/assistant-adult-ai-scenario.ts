import { mock } from "bun:test"
import assert from "node:assert/strict"
import type { ClaimedSetupAttachment } from "@ewatrade/assistant/setup/attachment-processing"
import { z } from "zod"

let ageBand: string | null = "AGE_16_TO_17"
let ageReads = 0
let sends = 0
let classification: "LIVE" | "QA" = "LIVE"
mock.module("@ewatrade/db/client", () => ({
  prisma: {
    user: {
      findUnique: async () => {
        ageReads += 1
        return ageBand === null ? null : { ageBand }
      },
    },
    tenant: {
      findUnique: async () => ({ dataClassification: classification }),
    },
  },
}))
// Existing lease/role/scope checks have their own tests. Isolate the new age
// boundary here without querying a database or weakening the production wiring.
mock.module("@ewatrade/db/assistant-voice", () => ({
  assertAssistantAttachmentProcessingActive: async () => {},
  assertVoiceAttemptActive: async () => {},
  readVoiceGateway: async () => null,
  recordVoiceAttempt: async () => {},
  reserveVoiceAudio: async () => true,
  voiceCircuitOpen: async () => false,
}))
globalThis.fetch = Object.assign(async () => {
  sends += 1
  throw new Error("unexpected network dispatch")
}, fetch)
process.env.ASSISTANT_OPENAI_API_KEY = "unit-test-not-a-key"
const { defaultAssistantAttachmentDeps } = await import(
  "../assistant-attachment-process"
)
const { TranscriptionError } = await import(
  "@ewatrade/ai/transcription-contracts"
)

const attachment: ClaimedSetupAttachment = {
  id: "attachment",
  tenantId: "tenant",
  conversationId: "conversation",
  actorUserId: "actor",
  kind: "IMAGE",
  contentType: "image/png",
  contentDigest: "digest",
  sizeBytes: 3,
  durationMs: null,
  processingAttempts: 1,
}
const isAgeRefusal = (error: unknown) =>
  error instanceof TranscriptionError &&
  error.code === "LIVE_AI_ADULT_REQUIRED" &&
  error.terminal
for (const state of ["AGE_13_TO_15", "AGE_16_TO_17", "UNDECLARED", null]) {
  ageBand = state
  await assert.rejects(
    defaultAssistantAttachmentDeps().media(attachment),
    isAgeRefusal,
  )
}
ageBand = "ADULT"
const vision = await defaultAssistantAttachmentDeps().media(attachment)
assert.ok(vision)
ageBand = "AGE_16_TO_17"
await assert.rejects(
  vision.readImage({
    schema: z.object({ ok: z.boolean() }),
    instructions: "unit-only",
    image: new Uint8Array([1, 2, 3]),
    mediaType: "image/png",
  }),
  isAgeRefusal,
)

ageBand = "ADULT"
const audio = await defaultAssistantAttachmentDeps().media({
  ...attachment,
  kind: "AUDIO",
  contentType: "audio/webm",
  durationMs: 1000,
})
assert.ok(audio)
ageBand = "AGE_13_TO_15"
await assert.rejects(
  audio.transcribe({ audio: new Uint8Array([1, 2, 3]) }),
  isAgeRefusal,
)
assert.equal(sends, 0)
assert.ok(ageReads >= 8)

classification = "QA"
ageBand = "AGE_13_TO_15"
const beforeRehearsalReads = ageReads
const rehearsal = await defaultAssistantAttachmentDeps().media(attachment)
assert.ok(rehearsal)
assert.equal(ageReads, beforeRehearsalReads)
assert.equal(sends, 0)
console.log(
  "worker age refusals, fresh vision/audio dispatch and provider-free QA passed",
)
