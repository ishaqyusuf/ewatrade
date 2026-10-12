import { describe, expect, test } from "bun:test"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import {
  sealStaffInvitationPayload,
  staffInvitationPayloadHash,
} from "@ewatrade/db/staff-invitation-custody"
import {
  type StaffInvitationDispatchDependencies,
  StaffInvitationProviderRejected,
  runStaffInvitationNotificationDispatch,
} from "./staff-invitation-notification-dispatch"

const input = { tenantId: "tenant", notificationId: "notification" }
const config = {
  STAFF_INVITATION_ENCRYPTION_KEY_ID: "test",
  STAFF_INVITATION_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
}
const token = "ephemeral-test-token"
const payload = {
  version: 1 as const,
  appUrl: "https://dashboard.example.test/",
  inviteUrl: `https://dashboard.example.test/staff-onboarding?inviteToken=${token}`,
  businessName: "Business",
  invitedByName: "Owner",
  inviteeEmail: "amina@example.test",
  inviteeName: "Amina",
  membershipId: "member",
  staffAccessRevision: 3,
  role: "CASHIER" as const,
}
const binding = {
  ...input,
  membershipId: "member",
  invitationId: "invite",
  payloadHash: staffInvitationPayloadHash(payload),
}
const sealed = sealStaffInvitationPayload(payload, binding, config)
const claim = {
  ...binding,
  payloadCiphertext: sealed.envelope,
  encryptionKeyId: sealed.keyId,
  claimId: randomUUID(),
  currentAccessRevision: 3,
  currentEmail: payload.inviteeEmail,
  tokenHash: createHash("sha256").update(token).digest("hex"),
  providerIdempotencyKey: "staff-invitation:notification",
}
function fixture(overrides: Partial<StaffInvitationDispatchDependencies> = {}) {
  const calls: Array<[string, unknown]> = []
  const deps: StaffInvitationDispatchDependencies = {
    config,
    claim: async () => {
      calls.push(["claim", input])
      return claim
    },
    start: async (value) => {
      calls.push(["start", value])
      return true
    },
    finish: async (value) => {
      calls.push(["finish", value])
      return true
    },
    assertProviderAllowed: async (value) => {
      calls.push(["guard", value])
    },
    send: async (value) => {
      calls.push(["send", value])
      return { providerKey: "test-provider", providerMessageId: "test-receipt" }
    },
    ...overrides,
  }
  return { deps, calls }
}
describe("staff invitation ID-only notification dispatch", () => {
  test("frozen payload, stable provider key and fresh authorization precede send; acceptance is only sent", async () => {
    const f = fixture()
    expect(await runStaffInvitationNotificationDispatch(input, f.deps)).toEqual(
      { status: "sent" },
    )
    expect(f.calls.map(([name]) => name)).toEqual([
      "claim",
      "guard",
      "start",
      "send",
      "finish",
    ])
    expect(f.calls[2]?.[1]).toEqual({
      ...input,
      claimId: claim.claimId,
      expectedAccessRevision: 3,
    })
    expect(f.calls[3]?.[1]).toMatchObject({
      to: payload.inviteeEmail,
      idempotencyKey: claim.providerIdempotencyKey,
      tags: [
        { name: "category", value: "staff_invitation" },
        { name: "tenant_id", value: claim.tenantId },
        { name: "notification_id", value: claim.notificationId },
        { name: "payload_hash", value: claim.payloadHash },
      ],
    })
    expect(f.calls[4]?.[1]).toMatchObject({
      ...input,
      claimId: claim.claimId,
      payloadHash: binding.payloadHash,
      outcome: "SENT",
      providerMessageId: "test-receipt",
    })
    expect(JSON.stringify(f.calls[4])).not.toContain(token)
  })
  test("no claim means no decryption, provider guard, send or completion", async () => {
    const f = fixture({ claim: async () => null, config: {} })
    expect(
      await runStaffInvitationNotificationDispatch(input, f.deps),
    ).toBeNull()
    expect(f.calls).toEqual([])
  })
  test("unavailable custody is a pre-send failure with no provider work", async () => {
    const f = fixture({ config: {} })
    await runStaffInvitationNotificationDispatch(input, f.deps)
    expect(f.calls.map(([name]) => name)).toEqual(["claim", "finish"])
    expect(f.calls[1]?.[1]).toMatchObject({
      outcome: "FAILED",
      failureCode: "CUSTODY_UNAVAILABLE",
    })
  })
  test("changed recipient, access revision or token refuses before provider work", async () => {
    for (const patch of [
      { currentEmail: "changed@example.test" },
      { currentAccessRevision: 4 },
      { tokenHash: "0".repeat(64) },
    ]) {
      const f = fixture({ claim: async () => ({ ...claim, ...patch }) })
      await runStaffInvitationNotificationDispatch(input, f.deps)
      expect(f.calls.map(([name]) => name)).toEqual(["finish"])
      expect(f.calls[0]?.[1]).toMatchObject({
        outcome: "FAILED",
        failureCode: "PAYLOAD_CHANGED",
      })
    }
  })
  test("QA/provider guard refusal is safely pre-send; fresh authority refusal also never sends", async () => {
    const blocked = fixture({
      assertProviderAllowed: async () => {
        throw Error("blocked")
      },
    })
    await runStaffInvitationNotificationDispatch(input, blocked.deps)
    expect(blocked.calls.map(([name]) => name)).toEqual(["claim", "finish"])
    expect(blocked.calls[1]?.[1]).toMatchObject({
      outcome: "FAILED",
      failureCode: "PROVIDER_UNAVAILABLE",
    })
    const stale = fixture({ start: async () => false })
    await runStaffInvitationNotificationDispatch(input, stale.deps)
    expect(stale.calls.map(([name]) => name)).toEqual(["claim", "guard"])
  })
  test("transport uncertainty and missing acceptance evidence become unknown, never rejected or delivered", async () => {
    for (const send of [
      async () => {
        throw Error("private provider details")
      },
      async () => ({ providerKey: "test-provider", providerMessageId: "" }),
    ]) {
      const f = fixture({ send })
      await runStaffInvitationNotificationDispatch(input, f.deps)
      expect(f.calls.at(-1)?.[1]).toMatchObject({
        outcome: "OUTCOME_UNKNOWN",
        failureCode: "PROVIDER_OUTCOME_UNKNOWN",
      })
      expect(JSON.stringify(f.calls.at(-1))).not.toContain(
        "private provider details",
      )
    }
  })
  test("only definitive provider rejection is retryable failure", async () => {
    const f = fixture({
      send: async () => {
        throw new StaffInvitationProviderRejected()
      },
    })
    await runStaffInvitationNotificationDispatch(input, f.deps)
    expect(f.calls.at(-1)?.[1]).toMatchObject({
      outcome: "FAILED",
      failureCode: "PROVIDER_REJECTED",
    })
  })
  test("accepted provider result with persistence failure propagates without a second send or failure relabel", async () => {
    let finishes = 0
    const f = fixture({
      finish: async () => {
        finishes++
        throw Error("storage unavailable")
      },
    })
    await expect(
      runStaffInvitationNotificationDispatch(input, f.deps),
    ).rejects.toThrow("storage unavailable")
    expect(finishes).toBe(1)
    expect(f.calls.filter(([name]) => name === "send")).toHaveLength(1)
  })
})
