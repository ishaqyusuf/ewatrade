import { expect, test } from "bun:test"
import type { Prisma } from "../../generated/prisma/client"
import { recordVoiceAttemptInTransaction } from "./assistant-voice"

function fixture(status: string | null) {
  const writes: string[] = []
  const rows = new Map<string, string>()
  let present = true
  const db = {
    assistantAttachment: {
      findUnique: async () =>
        present
          ? { id: "audio", actorUserId: "actor", processingAttempts: 3 }
          : null,
    },
    $queryRaw: async (query: Prisma.Sql) => {
      expect(query.sql).toContain("FOR SHARE")
      expect(query.values).toEqual(["account-deletion:actor"])
      return status ? [{ status }] : []
    },
    assistantTranscriptionAttempt: {
      findUnique: async ({
        where,
      }: {
        where: {
          attachmentId_generation_ordinal: {
            attachmentId: string
            generation: number
            ordinal: number
          }
        }
      }) => {
        const key = where.attachmentId_generation_ordinal
        const provider = rows.get(`${key.generation}:${key.ordinal}`)
        return provider ? { provider } : null
      },
      upsert: async ({
        create,
      }: {
        create: { generation: number; ordinal: number; provider: string }
      }) => {
        rows.set(`${create.generation}:${create.ordinal}`, create.provider)
        writes.push("upsert")
      },
      updateMany: async ({
        where,
      }: {
        where: {
          attachmentId: string
          generation: number
          ordinal: number
          provider: string
        }
      }) => {
        expect(where).toEqual({
          attachmentId: "audio",
          generation: 3,
          ordinal: 1,
          provider: "rehearsal",
        })
        writes.push("existing-terminal")
        return { count: 1 }
      },
    },
  } as unknown as Prisma.TransactionClient
  return {
    db,
    writes,
    rows,
    remove: () => {
      present = false
    },
  }
}
const input = {
  attachmentId: "audio",
  generation: 3,
  ordinal: 1,
  provider: "rehearsal",
  model: "initial-model",
  outcome: "started",
  audioSeconds: 2,
  billingStatus: "unknown",
}

test("privacy-locked started admission throws even with processing switch off; missing attachment cannot admit a send", async () => {
  const previous =
    process.env.ACCOUNT_PRIVACY_PRIVATE_ASSISTANT_PROCESSING_ENABLED
  try {
    process.env.ACCOUNT_PRIVACY_PRIVATE_ASSISTANT_PROCESSING_ENABLED = "false"
    for (const status of ["PROCESSING", "COMPLETED"]) {
      const owned = fixture(status)
      await expect(
        recordVoiceAttemptInTransaction(owned.db, input),
      ).rejects.toThrow("VOICE_CANCELLED")
      expect(owned.writes).toEqual([])
    }
    const missing = fixture(null)
    missing.remove()
    await expect(
      recordVoiceAttemptInTransaction(missing.db, input),
    ).rejects.toThrow("VOICE_CANCELLED")
    await recordVoiceAttemptInTransaction(missing.db, {
      ...input,
      outcome: "success",
    })
    expect(missing.writes).toEqual([])
  } finally {
    if (previous === undefined)
      Reflect.deleteProperty(
        process.env,
        "ACCOUNT_PRIVACY_PRIVATE_ASSISTANT_PROCESSING_ENABLED",
      )
    else
      process.env.ACCOUNT_PRIVACY_PRIVATE_ASSISTANT_PROCESSING_ENABLED =
        previous
  }
})

test("fenced terminal reconciliation only changes the admitted immutable provider/key; model resolution remains allowed", async () => {
  const owned = fixture("PROCESSING")
  await recordVoiceAttemptInTransaction(owned.db, {
    ...input,
    outcome: "success",
  })
  expect(owned.writes).toEqual([])
  owned.rows.set("3:1", "rehearsal")
  await recordVoiceAttemptInTransaction(owned.db, {
    ...input,
    outcome: "success",
    model: "provider-returned-model",
  })
  expect(owned.writes).toEqual(["existing-terminal"])
  await expect(
    recordVoiceAttemptInTransaction(owned.db, {
      ...input,
      outcome: "success",
      provider: "other-provider",
    }),
  ).rejects.toThrow("VOICE_ATTEMPT_CHANGED")
  await recordVoiceAttemptInTransaction(owned.db, {
    ...input,
    ordinal: 2,
    outcome: "failed",
  })
  expect(owned.writes).toEqual(["existing-terminal"])
})

test("unfenced default QA terminal without a start still persists, and stale started generation refuses", async () => {
  const owned = fixture("RECEIVED")
  await recordVoiceAttemptInTransaction(owned.db, {
    ...input,
    outcome: "success",
    billingStatus: "not_billable",
  })
  expect(owned.writes).toEqual(["upsert"])
  await expect(
    recordVoiceAttemptInTransaction(owned.db, { ...input, generation: 2 }),
  ).rejects.toThrow("VOICE_CANCELLED")
  expect(owned.writes).toEqual(["upsert"])
})
