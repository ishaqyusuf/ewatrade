import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import type { Prisma } from "../../generated/prisma/client"
import {
  executeStaffInvitationCommandInTransaction,
  reviewStaffInvitationCommandInTransaction,
  staffInvitationCommandInput,
  staffInvitationCommandReviewInput,
} from "./staff-invitation-commands"

const scope = { tenantId: "tenant", actorUserId: "owner" }
const intent = {
  kind: "REVOKE" as const,
  invitationId: "invite",
  reason: "Recipient no longer needs access",
}
const input = {
  ...intent,
  clientCommandId: "command-key",
  expectedReviewHash: "a".repeat(64),
}
const receipt = {
  version: 1 as const,
  commandId: "command",
  kind: "REVOKE" as const,
  membershipId: "member",
  invitationId: "invite",
  notificationId: null,
  status: "revoked" as const,
}
function replayFixture(actor = true, hashOverride?: string) {
  let reads = 0
  const payloadHash = createHash("sha256")
    .update(
      JSON.stringify({ ...scope, ...staffInvitationCommandInput.parse(input) }),
    )
    .digest("hex")
  const tx = {
    $queryRaw: async () =>
      actor ? [{ id: "owner-member", role: "OWNER", status: "ACTIVE" }] : [],
    staffInvitationCommand: {
      findUnique: async () => {
        reads++
        return {
          actorUserId: scope.actorUserId,
          kind: "REVOKE",
          payloadHash: hashOverride ?? payloadHash,
          result: receipt,
        }
      },
    },
  } as unknown as Prisma.TransactionClient
  return { tx, reads: () => reads }
}
describe("canonical invitation command identity and review", () => {
  test("strict command inputs reject client authority, tokens, delivery and malformed review identity", () => {
    expect(staffInvitationCommandInput.safeParse(input).success).toBe(true)
    for (const patch of [
      { tenantId: "foreign" },
      { actorUserId: "forged" },
      { acceptanceToken: "secret" },
      { inviteUrl: "https://example.test" },
      { providerMessageId: "receipt" },
      { expectedReviewHash: "bad" },
      { reason: "" },
      { kind: "ACTIVATE" },
    ])
      expect(
        staffInvitationCommandInput.safeParse({ ...input, ...patch }).success,
      ).toBe(false)
    expect(
      staffInvitationCommandReviewInput.safeParse({
        ...intent,
        clientCommandId: "key",
      }).success,
    ).toBe(false)
  })
  test("exact durable replay returns the safe original receipt before rollout/key configuration or writes", async () => {
    const f = replayFixture()
    expect(
      await executeStaffInvitationCommandInTransaction(
        f.tx,
        { ...scope, ...input },
        {},
      ),
    ).toEqual(receipt)
    expect(f.reads()).toBe(1)
    expect(JSON.stringify(receipt)).not.toMatch(
      /token|ciphertext|password|session/i,
    )
  })
  test("reused command key with changed payload conflicts; revoked actor cannot recover it", async () => {
    await expect(
      executeStaffInvitationCommandInTransaction(
        replayFixture(true, "b".repeat(64)).tx,
        { ...scope, ...input },
        {},
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" })
    const denied = replayFixture(false)
    await expect(
      executeStaffInvitationCommandInTransaction(
        denied.tx,
        { ...scope, ...input },
        {},
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(denied.reads()).toBe(0)
  })
  test("resend/revoke review binds original membership/access and reason; accepted or protected subjects remain blocked", async () => {
    const invitation = {
      id: "invite",
      email: "staff@example.test",
      role: "CASHIER",
      status: "ACTIVE",
      expiresAt: new Date("2026-10-01T00:00:00Z"),
      acceptedAt: null as Date | null,
      membershipId: "member",
      invitedUserId: "user",
    }
    const membership = {
      id: "member",
      userId: "user",
      status: "INVITED",
      role: "CASHIER",
      staffAccessRevision: 3,
      user: { email: invitation.email, name: "Staff", displayName: null },
      retailOpsStaffProfile: { id: "profile", defaultStoreId: "store" },
      staffStoreAssignments: [{ storeId: "store", role: "CASHIER" }],
    }
    const tx = {
      $queryRaw: async () => [
        { id: "owner-member", status: "ACTIVE", role: "OWNER" },
      ],
      retailOpsStaffInviteToken: { findFirst: async () => invitation },
      membership: { findFirst: async () => membership },
    } as unknown as Prisma.TransactionClient
    const review = await reviewStaffInvitationCommandInTransaction(tx, {
      ...scope,
      ...intent,
    })
    expect(review).toMatchObject({
      membershipId: "member",
      recipient: { email: invitation.email },
      current: { accessRevision: 3 },
    })
    if (review.kind !== "REVOKE") throw Error("Expected revocation review")
    expect(review.effect).toContain("still uses its staff seat")
    expect(
      review.blockers.some((b) => b.code === "STAFF_INVITATION_CHANGED"),
    ).toBe(false)
    const same = await reviewStaffInvitationCommandInTransaction(tx, {
      ...scope,
      ...intent,
    })
    expect(same.reviewHash).toBe(review.reviewHash)
    const changed = await reviewStaffInvitationCommandInTransaction(tx, {
      ...scope,
      ...intent,
      reason: "Changed reason",
    })
    expect(changed.reviewHash).not.toBe(review.reviewHash)
    membership.staffAccessRevision++
    expect(
      (
        await reviewStaffInvitationCommandInTransaction(tx, {
          ...scope,
          ...intent,
        })
      ).reviewHash,
    ).not.toBe(review.reviewHash)
    invitation.status = "ACCEPTED"
    invitation.acceptedAt = new Date()
    expect(
      (
        await reviewStaffInvitationCommandInTransaction(tx, {
          ...scope,
          ...intent,
        })
      ).blockers.some((b) => b.code === "STAFF_INVITATION_CHANGED"),
    ).toBe(true)
  })
})
