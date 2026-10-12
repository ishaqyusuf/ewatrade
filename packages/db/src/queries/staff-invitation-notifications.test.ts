import { describe, expect, test } from "bun:test"
import type {
  Prisma,
  StaffInvitationNotificationStatus,
} from "../../generated/prisma/client"
import {
  claimStaffInvitationNotificationInTransaction,
  startStaffInvitationNotificationInTransaction,
  finishStaffInvitationNotificationInTransaction,
  recordStaffInvitationDeliveredInTransaction,
} from "./staff-invitation-notifications"

const now = new Date("2026-10-12T12:00:00Z")
const input = { tenantId: "tenant", notificationId: "notification", now }
function fixture(
  status: StaffInvitationNotificationStatus = "PENDING",
  attemptCount = 0,
) {
  const row = {
    id: "notification",
    tenantId: "tenant",
    membershipId: "member",
    invitationId: "invite",
    status,
    attemptCount,
    payloadCiphertext: "encrypted",
    payloadHash: "a".repeat(64),
    encryptionKeyId: "key",
    nextAttemptAt: new Date(0),
    claimId: "previous-claim",
    claimExpiresAt: new Date(now.getTime() - 1),
    sentAt: null as Date | null,
    deliveredAt: null as Date | null,
    providerKey: null as string | null,
    providerMessageId: null as string | null,
    command: { actorUserId: "owner" },
    invitation: {
      status: "ACTIVE",
      role: "CASHIER",
      email: "staff@example.test",
      expiresAt: new Date(now.getTime() + 3600000),
      tokenHash: "token-hash",
      invitedUserId: "user",
    },
    membership: {
      status: "INVITED",
      role: "CASHIER",
      userId: "user",
      staffAccessRevision: 3,
      user: { email: "staff@example.test" },
      retailOpsStaffProfile: { defaultStoreId: "store" },
      staffStoreAssignments: [{ storeId: "store" }],
    },
  }
  let authority = true
  const updates: unknown[] = [],
    attempts: unknown[] = []
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray) =>
      strings.join("").includes('AND m."role" IN') && authority
        ? [{ id: "owner-member" }]
        : [],
    membership: {
      findFirst: async () => (authority ? { id: "owner-member" } : null),
    },
    staffInvitationNotification: {
      findFirst: async (args: { where: { tenantId: string; id: string } }) =>
        args.where.tenantId === row.tenantId && args.where.id === row.id
          ? row
          : null,
      update: async (args: { data: object }) => {
        updates.push(args)
        Object.assign(row, args.data)
        return row
      },
    },
    staffInvitationNotificationAttempt: {
      create: async (args: unknown) => {
        attempts.push(args)
      },
      updateMany: async (args: unknown) => {
        attempts.push(args)
      },
    },
    retailOpsStaffInviteToken: {
      update: async (args: unknown) => {
        updates.push(args)
      },
    },
  } as unknown as Prisma.TransactionClient
  return {
    tx,
    row,
    updates,
    attempts,
    revokeAuthority: () => {
      authority = false
    },
  }
}
describe("durable staff notification transitions", () => {
  test("post-send failures cannot be relabeled as retryable pre-send errors", async () => {
    const f = fixture("SENDING", 1)
    expect(
      await finishStaffInvitationNotificationInTransaction(f.tx, {
        ...input,
        claimId: "previous-claim",
        payloadHash: f.row.payloadHash,
        outcome: "FAILED",
        failureCode: "CUSTODY_UNAVAILABLE",
      }),
    ).toBe(false)
    expect(f.row.status).toBe("SENDING")
    const exhausted = fixture("SENDING", 3)
    expect(
      await finishStaffInvitationNotificationInTransaction(exhausted.tx, {
        ...input,
        claimId: "previous-claim",
        payloadHash: exhausted.row.payloadHash,
        outcome: "FAILED",
        failureCode: "PROVIDER_REJECTED",
      }),
    ).toBe(true)
    expect(exhausted.row.status).toBe("FAILED")
    expect(exhausted.row.payloadCiphertext).toBeNull()
  })
  test("one live claim fences duplicates and increments a bounded attempt", async () => {
    const f = fixture(),
      claim = await claimStaffInvitationNotificationInTransaction(f.tx, input)
    expect(claim).toMatchObject({
      membershipId: "member",
      currentAccessRevision: 3,
      providerIdempotencyKey: "staff-invitation:notification",
    })
    expect(f.row.status).toBe("CLAIMED")
    expect(f.row.attemptCount).toBe(1)
    expect(
      await claimStaffInvitationNotificationInTransaction(f.tx, input),
    ).toBeNull()
    expect(
      await startStaffInvitationNotificationInTransaction(f.tx, {
        ...input,
        claimId: "stale",
        expectedAccessRevision: 3,
      }),
    ).toBe(false)
    expect(
      await startStaffInvitationNotificationInTransaction(f.tx, {
        ...input,
        claimId: claim!.claimId,
        expectedAccessRevision: 3,
      }),
    ).toBe(true)
    expect(f.row.status).toBe("SENDING")
    expect(
      await startStaffInvitationNotificationInTransaction(f.tx, {
        ...input,
        claimId: claim!.claimId,
        expectedAccessRevision: 3,
      }),
    ).toBe(false)
  })
  test("expired sending becomes unknown and is never re-claimed; late exact receipt may resolve it", async () => {
    const f = fixture("SENDING", 1)
    expect(
      await claimStaffInvitationNotificationInTransaction(f.tx, input),
    ).toBeNull()
    expect(f.row.status).toBe("OUTCOME_UNKNOWN")
    expect(
      await claimStaffInvitationNotificationInTransaction(f.tx, input),
    ).toBeNull()
    expect(
      await finishStaffInvitationNotificationInTransaction(f.tx, {
        ...input,
        claimId: "wrong",
        payloadHash: f.row.payloadHash,
        outcome: "SENT",
        providerKey: "provider",
        providerMessageId: "receipt",
      }),
    ).toBe(false)
    expect(
      await finishStaffInvitationNotificationInTransaction(f.tx, {
        ...input,
        claimId: "previous-claim",
        payloadHash: f.row.payloadHash,
        outcome: "SENT",
        providerKey: "provider",
        providerMessageId: "receipt",
      }),
    ).toBe(true)
    expect(f.row.status).toBe("SENT")
    expect(f.row.payloadCiphertext).toBeNull()
    expect(f.row.deliveredAt).toBeNull()
  })
  test("claimed crash is safely reclaimable before send, but exhausted claims terminate", async () => {
    const safe = fixture("CLAIMED", 1)
    expect(
      await claimStaffInvitationNotificationInTransaction(safe.tx, input),
    ).not.toBeNull()
    expect(safe.row.attemptCount).toBe(2)
    const exhausted = fixture("CLAIMED", 3)
    expect(
      await claimStaffInvitationNotificationInTransaction(exhausted.tx, input),
    ).toBeNull()
    expect(exhausted.row.status).toBe("CANCELLED")
    expect(exhausted.row.payloadCiphertext).toBeNull()
  })
  test("revoked creator, accepted/expired invitation and changed membership/default Store cancel before send", async () => {
    for (const change of [
      "actor",
      "accepted",
      "expired",
      "membership",
      "store",
    ]) {
      const f = fixture()
      if (change === "actor") f.revokeAuthority()
      if (change === "accepted") f.row.invitation.status = "ACCEPTED"
      if (change === "expired") f.row.invitation.expiresAt = now
      if (change === "membership") f.row.membership.status = "ACTIVE"
      if (change === "store") f.row.membership.staffStoreAssignments = []
      expect(
        await claimStaffInvitationNotificationInTransaction(f.tx, input),
      ).toBeNull()
      expect(f.row.status).toBe("CANCELLED")
    }
    const f = fixture()
    const claim = await claimStaffInvitationNotificationInTransaction(
      f.tx,
      input,
    )
    f.row.membership.staffAccessRevision++
    expect(
      await startStaffInvitationNotificationInTransaction(f.tx, {
        ...input,
        claimId: claim!.claimId,
        expectedAccessRevision: 3,
      }),
    ).toBe(false)
    expect(f.row.status).toBe("CANCELLED")
  })
  test("cross-Tenant identifiers and stale completion digests cannot change work", async () => {
    const f = fixture("SENDING", 1)
    expect(
      await claimStaffInvitationNotificationInTransaction(f.tx, {
        ...input,
        tenantId: "foreign",
      }),
    ).toBeNull()
    expect(
      await finishStaffInvitationNotificationInTransaction(f.tx, {
        ...input,
        claimId: "previous-claim",
        payloadHash: "b".repeat(64),
        outcome: "FAILED",
        failureCode: "PROVIDER_REJECTED",
      }),
    ).toBe(false)
    expect(f.updates).toEqual([])
  })
  test("verified matching delivery only follows provider acceptance; repeats preserve original receipt", async () => {
    const f = fixture("SENDING", 1),
      completion = {
        ...input,
        claimId: "previous-claim",
        payloadHash: f.row.payloadHash,
        outcome: "SENT" as const,
        providerKey: "provider",
        providerMessageId: "receipt",
      }
    const delivery = {
      ...input,
      payloadHash: f.row.payloadHash,
      providerKey: "provider",
      providerMessageId: "receipt",
      deliveredAt: new Date(now.getTime() + 1000),
    }
    expect(
      await recordStaffInvitationDeliveredInTransaction(f.tx, delivery),
    ).toBe(false)
    expect(
      await finishStaffInvitationNotificationInTransaction(f.tx, completion),
    ).toBe(true)
    expect(
      await recordStaffInvitationDeliveredInTransaction(f.tx, {
        ...delivery,
        providerMessageId: "other",
      }),
    ).toBe(false)
    expect(
      await recordStaffInvitationDeliveredInTransaction(f.tx, {
        ...delivery,
        deliveredAt: new Date(now.getTime() - 1),
      }),
    ).toBe(false)
    expect(
      await recordStaffInvitationDeliveredInTransaction(f.tx, delivery),
    ).toBe(true)
    expect(f.row.status).toBe("DELIVERED")
    expect(
      await recordStaffInvitationDeliveredInTransaction(f.tx, delivery),
    ).toBe(true)
    expect(
      await recordStaffInvitationDeliveredInTransaction(f.tx, {
        ...delivery,
        deliveredAt: new Date(now.getTime() + 2000),
      }),
    ).toBe(false)
    expect(
      await finishStaffInvitationNotificationInTransaction(f.tx, completion),
    ).toBe(true)
    expect(
      await finishStaffInvitationNotificationInTransaction(f.tx, {
        ...completion,
        providerMessageId: "different",
      }),
    ).toBe(false)
  })
})
