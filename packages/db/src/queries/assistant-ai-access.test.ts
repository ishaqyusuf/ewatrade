import { expect, test } from "bun:test"
import {
  AssistantLiveAiAccessError,
  requireAdultLiveAiAccount,
} from "./assistant-ai-access"

test("live AI reads only the current server account age; all nonadult states refuse", async () => {
  for (const ageBand of [
    "UNDER_13",
    "AGE_13_TO_15",
    "AGE_16_TO_17",
    "UNDECLARED",
    "adult",
    null,
  ]) {
    const db = {
      user: {
        findUnique: async (input: unknown) => {
          expect(input).toEqual({
            where: { id: "actor" },
            select: { ageBand: true },
          })
          return { ageBand }
        },
      },
    }
    await expect(requireAdultLiveAiAccount(db, "actor")).rejects.toBeInstanceOf(
      AssistantLiveAiAccessError,
    )
  }
  await expect(
    requireAdultLiveAiAccount(
      { user: { findUnique: async () => null } },
      "deleted",
    ),
  ).rejects.toBeInstanceOf(AssistantLiveAiAccessError)
})

test("adult admission is fresh and a missing actor cannot perform a read", async () => {
  let ageBand = "ADULT"
  let reads = 0
  const db = {
    user: {
      findUnique: async () => {
        reads += 1
        return { ageBand }
      },
    },
  }
  await requireAdultLiveAiAccount(db, "actor")
  ageBand = "AGE_16_TO_17"
  await expect(requireAdultLiveAiAccount(db, "actor")).rejects.toBeInstanceOf(
    AssistantLiveAiAccessError,
  )
  await expect(requireAdultLiveAiAccount(db, "")).rejects.toBeInstanceOf(
    AssistantLiveAiAccessError,
  )
  expect(reads).toBe(2)
})
