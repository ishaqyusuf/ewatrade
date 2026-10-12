import { expect, test } from "bun:test"
import { staffInvitationCommandReceiptSchema, staffInvitationSavedReviewSchema } from "./staff-invitation-command-receipt"
import type { z } from "zod"

test("saved review preserves original recipient and grants, supports legacy receipts, and refuses private custody", () => {
  const receipt = {
    version: 1,
    commandId: "command",
    kind: "INVITE",
    membershipId: "member",
    invitationId: "invite",
    notificationId: "outbox",
    status: "saved",
  }
  expect(staffInvitationCommandReceiptSchema.safeParse(receipt).success).toBe(
    true,
  )
  const details: z.infer<typeof staffInvitationSavedReviewSchema> = {
    recipient: { email: "person@example.test", name: "Person" },
    membershipBefore: null,
    grants: {
      role: "CASHIER",
      status: "INVITED",
      defaultStoreId: "store",
      catalogEditor: false,
      assignments: [
        { storeId: "store", storeName: "Original Store", role: "CASHIER" },
      ],
    },
    seats: { used: 1, limit: 5, additional: 1, planName: "Starter" },
    reason: null,
    emailEffect: "REQUEST_INVITATION_EMAIL",
    reviewedAt: "2026-10-12T00:00:00Z",
    reviewHash: "a".repeat(64),
  }
  expect(
    staffInvitationCommandReceiptSchema.parse({ ...receipt, details }).details,
  ).toEqual(details)
  for (const patch of [
    { tokenHash: "private" },
    { providerMessageId: "private" },
    { payloadCiphertext: "private" },
  ])
    expect(
      staffInvitationCommandReceiptSchema.safeParse({
        ...receipt,
        details,
        ...patch,
      }).success,
    ).toBe(false)
  expect(
    staffInvitationCommandReceiptSchema.safeParse({
      ...receipt,
      details: { ...details, grants: { ...details.grants, status: "ACTIVE" } },
    }).success,
  ).toBe(false)
  expect(
    staffInvitationCommandReceiptSchema.safeParse({
      ...receipt,
      kind: "REVOKE",
      notificationId: null,
      status: "revoked",
      details: {
        ...details,
        seats: null,
        emailEffect: "CANCEL_UNSENT_WORK",
        grants: { ...details.grants, defaultStoreId: null, assignments: [] },
      },
    }).success,
  ).toBe(true)
})
