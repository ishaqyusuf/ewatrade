import { describe, expect, test } from "bun:test"
import type { Prisma } from "../../generated/prisma/client"
import {
  type StaffInvitationProviderEvent,
  reconcileStaffInvitationProviderEventInTransaction,
} from "./staff-invitation-provider-events"
const now = new Date("2026-10-12T12:00:00Z")
const input: StaffInvitationProviderEvent = {
  tenantId: "tenant",
  notificationId: "notification",
  type: "email.delivered",
  providerMessageId: "provider",
  payloadHash: "a".repeat(64),
  acceptedAt: new Date(now.getTime() - 2000),
  occurredAt: new Date(now.getTime() - 1000),
  now,
}
function fixture(status = "OUTCOME_UNKNOWN") {
  const row = {
    id: "notification",
    tenantId: "tenant",
    invitationId: "invite",
    payloadHash: input.payloadHash,
    claimId: "claim",
    sendStartedAt: new Date(now.getTime() - 3000),
    status,
    sentAt: null as Date | null,
    deliveredAt: null as Date | null,
    providerKey: null as string | null,
    providerMessageId: null as string | null,
    failureCode: "PROVIDER_OUTCOME_UNKNOWN" as string | null,
    payloadCiphertext: "encrypted",
    attemptCount: 1,
  }
  const updates: unknown[] = []
  const tx = {
    $queryRaw: async () => [],
    staffInvitationNotification: {
      findFirst: async ({
        where,
      }: { where: { id: string; tenantId: string } }) =>
        where.id === row.id && where.tenantId === row.tenantId ? row : null,
      update: async ({ data }: { data: object }) => {
        updates.push(data)
        Object.assign(row, data)
        return row
      },
    },
    staffInvitationNotificationAttempt: {
      updateMany: async (data: unknown) => {
        updates.push(data)
        return { count: 1 }
      },
    },
    retailOpsStaffInviteToken: {
      update: async (data: unknown) => {
        updates.push(data)
      },
    },
  } as unknown as Prisma.TransactionClient
  return { row, tx, updates }
}
describe("staff invitation trusted provider projection", () => {
  test("unknown delivery records acceptance and delivery, erases custody and replays without writes", async () => {
    const f = fixture()
    expect(
      await reconcileStaffInvitationProviderEventInTransaction(f.tx, input),
    ).toEqual({ recorded: true, replay: false })
    expect(f.row).toMatchObject({
      status: "DELIVERED",
      providerKey: "resend",
      providerMessageId: "provider",
      payloadCiphertext: null,
      failureCode: null,
      sentAt: input.acceptedAt,
      deliveredAt: input.occurredAt,
    })
    const count = f.updates.length
    expect(
      await reconcileStaffInvitationProviderEventInTransaction(f.tx, input),
    ).toEqual({ recorded: true, replay: true })
    expect(f.updates).toHaveLength(count)
  })
  test("late sent never downgrades delivery or clears a complaint; outcome precedence is deterministic", async () => {
    for (const types of [
      [
        "email.sent",
        "email.bounced",
        "email.delivered",
        "email.complained",
        "email.failed",
      ],
      [
        "email.complained",
        "email.delivered",
        "email.bounced",
        "email.failed",
        "email.sent",
      ],
    ] as const) {
      const f = fixture()
      for (const type of types)
        expect(
          (
            await reconcileStaffInvitationProviderEventInTransaction(f.tx, {
              ...input,
              type,
            })
          ).recorded,
        ).toBe(true)
      expect(f.row).toMatchObject({
        status: "DELIVERED",
        failureCode: "PROVIDER_COMPLAINED",
        deliveredAt: input.occurredAt,
        attemptCount: 1,
      })
    }
  })
  test("post-acceptance failures preserve acceptance and cannot become retryable FAILED", async () => {
    for (const [type, code] of [
      ["email.bounced", "PROVIDER_BOUNCED"],
      ["email.failed", "PROVIDER_FAILED"],
      ["email.complained", "PROVIDER_COMPLAINED"],
      ["email.suppressed", "PROVIDER_SUPPRESSED"],
    ] as const) {
      const f = fixture()
      expect(
        (
          await reconcileStaffInvitationProviderEventInTransaction(f.tx, {
            ...input,
            type,
          })
        ).recorded,
      ).toBe(true)
      expect(f.row).toMatchObject({
        status: "SENT",
        failureCode: code,
        payloadCiphertext: null,
        attemptCount: 1,
      })
    }
  })
  test("wrong scope, hash, provider receipt, missing send fence and impossible timestamps refuse without effects", async () => {
    for (const patch of [
      { tenantId: "foreign" },
      { notificationId: "foreign" },
      { payloadHash: "b".repeat(64) },
      { providerMessageId: "" },
      { occurredAt: new Date(Number.NaN) },
      { occurredAt: new Date(now.getTime() + 600000) },
      { acceptedAt: new Date(now.getTime() - 600000) },
      { occurredAt: new Date(now.getTime() - 10000) },
    ]) {
      const f = fixture()
      expect(
        await reconcileStaffInvitationProviderEventInTransaction(f.tx, {
          ...input,
          ...patch,
        }),
      ).toEqual({ recorded: false })
      expect(f.updates).toEqual([])
    }
    for (const status of ["PENDING", "CLAIMED", "FAILED", "CANCELLED"]) {
      const f = fixture(status)
      expect(
        (await reconcileStaffInvitationProviderEventInTransaction(f.tx, input))
          .recorded,
      ).toBe(false)
      expect(f.updates).toEqual([])
    }
    const f = fixture("SENT")
    f.row.providerKey = "resend"
    f.row.providerMessageId = "different"
    expect(
      (await reconcileStaffInvitationProviderEventInTransaction(f.tx, input))
        .recorded,
    ).toBe(false)
    expect(f.updates).toEqual([])
    f.row.providerMessageId = null
    f.row.claimId = ""
    expect(
      (await reconcileStaffInvitationProviderEventInTransaction(f.tx, input))
        .recorded,
    ).toBe(false)
  })
  test("authentic provider delivery can precede local worker persistence time", async () => {
    const f = fixture("SENT")
    f.row.sentAt = now
    f.row.providerKey = "resend"
    f.row.providerMessageId = "provider"
    expect(
      (await reconcileStaffInvitationProviderEventInTransaction(f.tx, input))
        .recorded,
    ).toBe(true)
    expect(f.row.sentAt).toEqual(input.acceptedAt)
    expect(f.row.deliveredAt).toEqual(input.occurredAt)
  })
})
