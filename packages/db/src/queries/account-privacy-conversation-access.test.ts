import { afterEach, describe, expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import {
  AccountPrivacyConversationAccessError,
  revokeAccountPrivacyConversationAccess,
} from "./account-privacy-conversation-access"

const previousFlags = {
  processing: process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED,
  conversation:
    process.env.ACCOUNT_PRIVACY_CONVERSATION_ACCESS_PROCESSING_ENABLED,
}

afterEach(() => {
  if (previousFlags.processing === undefined)
    Reflect.deleteProperty(process.env, "ACCOUNT_PRIVACY_PROCESSING_ENABLED")
  else process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = previousFlags.processing
  if (previousFlags.conversation === undefined)
    Reflect.deleteProperty(
      process.env,
      "ACCOUNT_PRIVACY_CONVERSATION_ACCESS_PROCESSING_ENABLED",
    )
  else
    process.env.ACCOUNT_PRIVACY_CONVERSATION_ACCESS_PROCESSING_ENABLED =
      previousFlags.conversation
})

function fixture(
  options: {
    admin?: boolean
    accessRevoked?: boolean
    unresolvedBridgePrompts?: number
    unresolvedCandidatePrompts?: number
    unresolvedOutboundSends?: number
  } = {},
) {
  const calls: string[] = []
  const updates: Array<{ name: string; args: unknown }> = []
  const countQueries: Array<{ name: string; args: unknown }> = []
  let remaining = true
  const query = (name: string) => ({
    updateMany: async (args: unknown) => {
      calls.push(name)
      updates.push({ name, args })
      return { count: remaining ? 1 : 0 }
    },
    count: async (args: unknown) => {
      countQueries.push({ name, args })
      return name === "bridgeAttempts"
        ? (options.unresolvedBridgePrompts ?? 0)
        : name === "candidateAttempts"
          ? (options.unresolvedCandidatePrompts ?? 0)
          : name === "outboundAttempts"
            ? (options.unresolvedOutboundSends ?? 0)
            : 0
    },
  })
  const tx = {
    user: {
      findUnique: async () => ({ isPlatformAdmin: options.admin ?? true }),
    },
    accountPrivacyRequest: {
      findUnique: async () => ({
        userId: "subject",
        verifiedSubjectUserId: "subject",
        verifiedAt: new Date("2026-09-25T00:00:00Z"),
        status: "PROCESSING",
        accessRevocation: {
          status: options.accessRevoked === false ? "PENDING" : "REVOKED",
          userId: "subject",
        },
      }),
    },
    storeConversationAccountAccess: {
      ...query("accountLinks"),
      findMany: async () => [{ id: "account-link" }],
    },
    storeConversationWhatsAppBridge: {
      ...query("bridges"),
      findMany: async () => [{ id: "bridge" }],
    },
    storeConversationWhatsAppCandidate: {
      ...query("candidates"),
      findMany: async () => [{ id: "candidate" }],
    },
    storeConversationWhatsAppBridgeCapability: query("bridgeCapabilities"),
    storeConversationWhatsAppBridgeChoiceCapability: query("bridgeChoices"),
    storeConversationWhatsAppBridgeAttempt: query("bridgeAttempts"),
    storeConversationWhatsAppCandidateActionCapability:
      query("candidateChoices"),
    storeConversationWhatsAppCandidateAttempt: query("candidateAttempts"),
    storeConversationWhatsAppOutboundAttempt: query("outboundAttempts"),
  }
  const db = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
  } as unknown as PrismaClient
  return {
    db,
    calls,
    updates,
    countQueries,
    clearRemaining: () => {
      remaining = false
    },
  }
}

describe("account privacy conversation access stage", () => {
  test("requires both processing switches and prior identity revocation", async () => {
    const { db, calls } = fixture({ accessRevoked: false })
    await expect(
      revokeAccountPrivacyConversationAccess(db, {
        requestId: "request",
        operatorUserId: "operator",
      }),
    ).rejects.toMatchObject({ code: "DISABLED" })
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
    process.env.ACCOUNT_PRIVACY_CONVERSATION_ACCESS_PROCESSING_ENABLED = "true"
    await expect(
      revokeAccountPrivacyConversationAccess(db, {
        requestId: "request",
        operatorUserId: "operator",
      }),
    ).rejects.toMatchObject({ code: "ACCESS_REVOCATION_REQUIRED" })
    expect(calls).toEqual([])
  })

  test("requires an operator with platform authority", async () => {
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
    process.env.ACCOUNT_PRIVACY_CONVERSATION_ACCESS_PROCESSING_ENABLED = "true"
    const { db, calls } = fixture({ admin: false })
    await expect(
      revokeAccountPrivacyConversationAccess(db, {
        requestId: "request",
        operatorUserId: "operator",
      }),
    ).rejects.toBeInstanceOf(AccountPrivacyConversationAccessError)
    expect(calls).toEqual([])
  })

  test("revokes account-bound paths without a conversation outcome, then replays", async () => {
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
    process.env.ACCOUNT_PRIVACY_CONVERSATION_ACCESS_PROCESSING_ENABLED = "true"
    const { db, calls, clearRemaining } = fixture()
    const command = { requestId: "request", operatorUserId: "operator" }
    const first = await revokeAccountPrivacyConversationAccess(db, command)
    expect(first).toMatchObject({
      accountLinksRevoked: 1,
      bridgeCapabilitiesRevoked: 1,
      bridgesRevoked: 1,
      candidatesRevoked: 1,
      replay: false,
      conversationOutcomeRecorded: false,
    })
    expect(calls).toEqual([
      "bridgeChoices",
      "bridgeAttempts",
      "candidateChoices",
      "candidateAttempts",
      "bridgeCapabilities",
      "candidates",
      "bridges",
      "accountLinks",
    ])
    clearRemaining()
    expect(
      await revokeAccountPrivacyConversationAccess(db, command),
    ).toMatchObject({
      accountLinksRevoked: 0,
      replay: true,
      conversationOutcomeRecorded: false,
    })
  })

  test("preserves claimed prompts for provider reconciliation", async () => {
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
    process.env.ACCOUNT_PRIVACY_CONVERSATION_ACCESS_PROCESSING_ENABLED = "true"
    const { db, updates, countQueries } = fixture({
      unresolvedBridgePrompts: 1,
      unresolvedCandidatePrompts: 1,
      unresolvedOutboundSends: 1,
    })
    const result = await revokeAccountPrivacyConversationAccess(db, {
      requestId: "request",
      operatorUserId: "operator",
    })
    expect(result.providerPromptReconciliationPending).toBe(3)
    expect(
      countQueries.find((query) => query.name === "outboundAttempts")?.args,
    ).toEqual({
      where: {
        bridgeId: { in: ["bridge"] },
        status: { in: ["CLAIMED", "OUTCOME_UNKNOWN"] },
      },
    })
    for (const name of ["bridgeAttempts", "candidateAttempts"]) {
      expect(
        updates.find((update) => update.name === name)?.args,
      ).toMatchObject({
        where: { status: { in: ["PENDING", "FAILED"] } },
      })
    }
  })
})
