import { expect, test } from "bun:test"
import {
  type OfflineConflictRow,
  recoveryDecisionAccess,
  recoveryReasonError,
  recoverySummary,
} from "./offline-recovery-review-model"

const row = (patch: Partial<Record<string, unknown>> = {}) =>
  ({
    id: "command-1",
    actor: {
      id: "rep-1",
      displayName: "Musa",
      name: "Musa B",
      email: "musa@example.test",
    },
    recovery: {
      version: 1,
      kind: "suspended_staff",
      membershipId: "membership-1",
      accessRevision: 3,
      accessChangedAt: "2026-10-17T09:00:00.000Z",
      lifecycleEventId: "event-1",
      receivedAt: "2026-10-17T10:00:00.000Z",
    },
    recoveryOrigin: {
      store: {
        id: "store-1",
        name: "Ikeja",
        currencyCode: "NGN",
        status: "ACTIVE",
      },
      device: {
        id: "device-1",
        deviceId: "device-partition",
        deviceName: "android device",
        platform: "android",
        registeredAt: "2026-10-01T00:00:00.000Z",
      },
    },
    recoveryEnvelope: {
      clientCommandId: "client-1",
      createdAtClient: "2026-10-17T08:30:00.000Z",
      dependencyClientIds: [],
      eventVersion: 1,
      payload: {
        kind: "commercial_order",
        customerName: "Aisha Bello",
        fulfillNow: true,
        lines: [{ offeringId: "o-1", quantity: "2" }],
        initialPayment: {
          amountMinor: 650000,
          clientPaymentId: "pay-1",
          method: "cash",
          moneyAccountId: "account-abcdef123456",
        },
      },
    },
    reviewKind: "suspended_recovery",
    ...patch,
  }) as unknown as OfflineConflictRow

test("only an Owner or Admin who isn't the author may decide", () => {
  expect(
    recoveryDecisionAccess({ role: "OWNER", viewerId: "a", authorId: "rep-1" }),
  ).toEqual({ canDecide: true })
  expect(
    recoveryDecisionAccess({ role: "admin", viewerId: "a", authorId: "rep-1" }),
  ).toEqual({ canDecide: true })
  expect(
    recoveryDecisionAccess({
      role: "MANAGER",
      viewerId: "a",
      authorId: "rep-1",
    }).canDecide,
  ).toBe(false)
  expect(
    recoveryDecisionAccess({
      role: "OWNER",
      viewerId: "rep-1",
      authorId: "rep-1",
    }),
  ).toEqual({
    canDecide: false,
    reason: "You can't decide a record you recorded yourself.",
  })
})

test("a reason is required and bounded", () => {
  expect(recoveryReasonError("   ")).toBe("Add a reason for this decision.")
  expect(recoveryReasonError("x".repeat(501))).toBe(
    "Keep the reason under 500 characters.",
  )
  expect(recoveryReasonError("Confirmed with Musa")).toBeNull()
})

test("summarises the exact held draft with claimed and server times apart", () => {
  const summary = recoverySummary(row())
  expect(summary).toMatchObject({
    decidable: true,
    author: "Musa",
    store: "Ikeja",
    storeInactive: false,
    currencyCode: "NGN",
    device: "android device · android",
    lineCount: 1,
    customer: "Aisha Bello",
    payment: {
      amountMinor: 650000,
      method: "Cash",
      account: "Account …123456",
    },
    fulfillNow: true,
  })
  expect(summary.claimedAt?.toISOString()).toBe("2026-10-17T08:30:00.000Z")
  expect(summary.receivedAt?.toISOString()).toBe("2026-10-17T10:00:00.000Z")
  expect(summary.accessChangedAt?.toISOString()).toBe(
    "2026-10-17T09:00:00.000Z",
  )
})

test("a missing envelope blocks both decisions; missing Store blocks only approval", () => {
  const noEnvelope = recoverySummary(row({ recoveryEnvelope: null }))
  expect(noEnvelope.decidable).toBe(false)
  expect(noEnvelope.canApprove).toBe(false)
  const noStore = recoverySummary(
    row({ recoveryOrigin: { store: null, device: null, moneyAccount: null } }),
  )
  expect(noStore.decidable).toBe(true)
  expect(noStore.canApprove).toBe(false)
})

test("lists every held line exactly, with unknown names as references", () => {
  const summary = recoverySummary(
    row({
      recoveryEnvelope: {
        clientCommandId: "client-1",
        createdAtClient: "2026-10-17T08:30:00.000Z",
        dependencyClientIds: [],
        eventVersion: 1,
        payload: {
          kind: "commercial_order",
          lines: [
            {
              offeringId: "offering-998877",
              quantity: "3",
              expectedFixedPriceMinor: 650000,
            },
            {
              custom: "quick_sale",
              description: "  Egg tray  ",
              amountMinor: 120000,
            },
            { custom: "additional_cost", amountMinor: 5000 },
          ],
        },
      },
    }),
  )
  expect(summary.lines).toEqual([
    {
      kind: "Catalog item · unit price",
      label: "Item …998877",
      quantity: "3",
      amountMinor: 650000,
    },
    {
      kind: "Quick sale",
      label: "Egg tray",
      quantity: null,
      amountMinor: 120000,
    },
    {
      kind: "Additional cost",
      label: "No description",
      quantity: null,
      amountMinor: 5000,
    },
  ])
})

test("shows the held account's name when the projection proves it", () => {
  const named = recoverySummary(
    row({
      recoveryOrigin: {
        store: {
          id: "store-1",
          name: "Ikeja",
          currencyCode: "NGN",
          status: "ACTIVE",
        },
        device: null,
        moneyAccount: { id: "account-abcdef123456", name: "Shop cash drawer" },
      },
    }),
  )
  expect(named.payment?.account).toBe("Shop cash drawer")
  const mismatched = recoverySummary(
    row({
      recoveryOrigin: {
        store: {
          id: "store-1",
          name: "Ikeja",
          currencyCode: "NGN",
          status: "ACTIVE",
        },
        device: null,
        moneyAccount: { id: "other-account", name: "Other" },
      },
    }),
  )
  expect(mismatched.payment?.account).toBe("Account …123456")
})
