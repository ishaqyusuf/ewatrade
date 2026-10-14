import { afterEach, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import type { PrismaClient } from "../../generated/prisma/client"
import {
  getApprovedPrivateAssistantPolicy,
  processAccountPrivacyPrivateAssistant,
} from "./account-privacy-private-assistant"
const names = [
  "ACCOUNT_PRIVACY_PROCESSING_ENABLED",
  "ACCOUNT_PRIVACY_PRIVATE_ASSISTANT_PROCESSING_ENABLED",
  "ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION",
  "ACCOUNT_PRIVACY_PRIVATE_ASSISTANT_POLICY_JSON",
  "ACCOUNT_PRIVACY_APPROVED_PRIVATE_ASSISTANT_POLICY_SHA256",
] as const
const previous = Object.fromEntries(names.map((key) => [key, process.env[key]]))
afterEach(() => {
  for (const key of names) {
    const value = previous[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})
const now = new Date("2026-10-12T14:00:00Z")
function configuration(overrides: Record<string, unknown> = {}) {
  const raw = JSON.stringify({
    version: "test-private-v1",
    approvalReference: "synthetic-fixture-only",
    approvedAt: "2026-10-12T13:00:00Z",
    reviewAt: "2026-10-13T13:00:00Z",
    mode: "ERASE_PRIVATE_ASSISTANT_DATA",
    ...overrides,
  })
  return {
    ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION: "test-private-v1",
    ACCOUNT_PRIVACY_PRIVATE_ASSISTANT_POLICY_JSON: raw,
    ACCOUNT_PRIVACY_APPROVED_PRIVATE_ASSISTANT_POLICY_SHA256: createHash(
      "sha256",
    )
      .update(raw)
      .digest("hex"),
  }
}
test("exact private-data policy rejects stale dates, unknown fields, mode/version changes and unsigned bytes", () => {
  expect(getApprovedPrivateAssistantPolicy(configuration(), now)?.version).toBe(
    "test-private-v1",
  )
  for (const changes of [
    { reviewAt: "2026-10-11T13:00:00Z" },
    { approvedAt: "2026-10-13T13:00:00Z" },
    { mode: "DELETE_TENANT" },
    { version: "other" },
    { skipChecks: true },
  ])
    expect(
      getApprovedPrivateAssistantPolicy(configuration(changes), now),
    ).toBeNull()
  expect(
    getApprovedPrivateAssistantPolicy(
      {
        ...configuration(),
        ACCOUNT_PRIVACY_APPROVED_PRIVATE_ASSISTANT_POLICY_SHA256: "a".repeat(
          64,
        ),
      },
      now,
    ),
  ).toBeNull()
})
test("disabled and unapproved cleanup cannot reach database or storage", async () => {
  const db = {
    $transaction: () => {
      throw Error("database must not be reached")
    },
  } as unknown as PrismaClient
  let calls = 0
  const remove = async () => {
    calls++
  }
  const input = { requestId: "r", operatorUserId: "o", now }
  Object.assign(process.env, configuration(), {
    ACCOUNT_PRIVACY_PROCESSING_ENABLED: "true",
    ACCOUNT_PRIVACY_PRIVATE_ASSISTANT_PROCESSING_ENABLED: "false",
  })
  await expect(
    processAccountPrivacyPrivateAssistant(db, input, remove),
  ).rejects.toMatchObject({ code: "DISABLED" })
  process.env.ACCOUNT_PRIVACY_PRIVATE_ASSISTANT_PROCESSING_ENABLED = "true"
  process.env.ACCOUNT_PRIVACY_APPROVED_PRIVATE_ASSISTANT_POLICY_SHA256 =
    "a".repeat(64)
  await expect(
    processAccountPrivacyPrivateAssistant(db, input, remove),
  ).rejects.toMatchObject({ code: "POLICY_NOT_APPROVED" })
  expect(calls).toBe(0)
})
