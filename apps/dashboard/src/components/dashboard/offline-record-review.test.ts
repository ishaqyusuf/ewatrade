import { describe, expect, test } from "bun:test"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  offlineReviewActions,
  offlineReviewFingerprint,
  offlineReviewOutcome,
  offlineReviewScope,
} from "./offline-record-review"

type Row = RouterOutputs["offline"]["conflicts"][number]
const ordinary: Row = {
  id: "record",
  clientCommandId: "original-command",
  type: "COMMERCIAL_ORDER",
  status: "REVIEW_REQUIRED",
  createdAtClient: new Date("2026-10-17T08:00:00Z"),
  processedAt: null,
  payload: {
    kind: "commercial_order",
    actorUserId: "rep",
    lines: [{ custom: "quick_sale", description: "Feed", amountMinor: 50000 }],
    initialPayment: { moneyAccountId: "original-account", amountMinor: 20000 },
  },
  result: null,
  conflictCode: null,
  conflictMessage: null,
  authoritativeState: null,
  dependencyClientIds: [],
  actor: {
    id: "rep",
    name: "Rep",
    displayName: "Rep",
    email: "rep@example.test",
  },
  recovery: null,
  recoveryOrigin: null,
  recoveryEnvelope: null,
  dependentCommands: [],
  reviewKind: "approval",
  safeActions: ["approve", "reject"],
}
const recovery: Row = {
  ...ordinary,
  reviewKind: "suspended_recovery",
  recovery: {
    version: 1,
    kind: "suspended_staff",
    membershipId: "rep-membership",
    accessRevision: 2,
    accessChangedAt: "2026-10-17T09:00:00.000Z",
    lifecycleEventId: "event",
    receivedAt: "2026-10-17T10:00:00.000Z",
  },
  recoveryOrigin: {
    store: {
      id: "store",
      name: "Store",
      currencyCode: "NGN",
      status: "ACTIVE",
    },
    device: null,
    moneyAccount: null,
  },
  recoveryEnvelope: {
    clientCommandId: "original-command",
    createdAtClient: ordinary.createdAtClient,
    dependencyClientIds: [],
    eventVersion: 1,
    payload: {
      kind: "commercial_order",
      lines: [
        { custom: "quick_sale", description: "Feed", amountMinor: 50000 },
      ],
    },
  },
}

describe("dashboard offline management review", () => {
  test("requires the exact active Store and binds identity, business and membership", () => {
    const context = {
      actorUserId: "owner",
      tenant: { id: "business" },
      membership: { id: "membership" },
      activeStore: { id: "store" },
    }
    const scope = offlineReviewScope(context, "store")
    expect(scope).not.toBeNull()
    expect(offlineReviewScope(undefined, "store")).toBeNull()
    expect(
      offlineReviewScope({ ...context, activeStore: null }, "store"),
    ).toBeNull()
    expect(offlineReviewScope(context, "other-store")).toBeNull()
    for (const changed of [
      { ...context, actorUserId: "other" },
      { ...context, tenant: { id: "other" } },
      { ...context, membership: { id: "other" } },
    ])
      expect(offlineReviewScope(changed, "store")).not.toBe(scope)
  })

  test("ordinary management ceiling and current safe actions remain canonical", () => {
    for (const role of ["OWNER", "ADMIN", "MANAGER"])
      expect(offlineReviewActions(ordinary, role, "reviewer", "store")).toEqual(
        ["approve", "reject"],
      )
    for (const role of ["CASHIER", "OPERATOR", "SUPPORT", undefined, "unknown"])
      expect(offlineReviewActions(ordinary, role, "reviewer", "store")).toEqual(
        [],
      )
    expect(
      offlineReviewActions(
        { ...ordinary, status: "APPLIED" },
        "OWNER",
        "owner",
        "store",
      ),
    ).toEqual([])
    expect(
      offlineReviewActions(
        { ...ordinary, safeActions: ["retry", "discard"] },
        "OWNER",
        "owner",
        "store",
      ),
    ).toEqual([])
  })

  test("recovery can only use a different Owner/Admin with an original envelope", () => {
    for (const role of ["OWNER", "ADMIN"])
      expect(offlineReviewActions(recovery, role, "reviewer", "store")).toEqual(
        ["approve", "reject"],
      )
    for (const row of [
      { ...recovery, actor: null },
      { ...recovery, recoveryEnvelope: null },
      { ...recovery, recovery: null },
    ])
      expect(offlineReviewActions(row, "OWNER", "reviewer", "store")).toEqual(
        [],
      )
    expect(offlineReviewActions(recovery, "OWNER", "rep", "store")).toEqual([])
    expect(
      offlineReviewActions(recovery, "MANAGER", "reviewer", "store"),
    ).toEqual([])
    expect(offlineReviewActions(recovery, "OWNER", undefined, "store")).toEqual(
      [],
    )
    expect(
      offlineReviewActions(recovery, "OWNER", "reviewer", "another-store"),
    ).toEqual(["reject"])
    expect(
      offlineReviewActions(
        { ...ordinary, recovery: recovery.recovery },
        "OWNER",
        "reviewer",
        "store",
      ),
    ).toEqual([])
  })

  test("fresh exposed payload, dependencies, state and envelope all belong to the selected snapshot", () => {
    const fingerprint = offlineReviewFingerprint(recovery)
    expect(offlineReviewFingerprint(structuredClone(recovery))).toBe(
      fingerprint,
    )
    const reordered = Object.fromEntries(Object.entries(recovery).reverse())
    expect(offlineReviewFingerprint(reordered)).toBe(fingerprint)
    for (const changed of [
      { ...recovery, id: "other-record" },
      { ...recovery, status: "APPLIED" },
      { ...recovery, reviewKind: "approval" },
      {
        ...recovery,
        payload: {
          ...Object(recovery.payload),
          initialPayment: {
            moneyAccountId: "other-account",
            amountMinor: 20000,
          },
        },
      },
      { ...recovery, dependencyClientIds: ["other-command"] },
      {
        ...recovery,
        recoveryEnvelope: { ...recovery.recoveryEnvelope, eventVersion: 2 },
      },
    ])
      expect(offlineReviewFingerprint(changed)).not.toBe(fingerprint)
  })

  test("conflict retry stays pending and only terminal receipts report application", () => {
    expect(
      offlineReviewActions(
        {
          ...ordinary,
          reviewKind: "conflict",
          conflictCode: "INVALID_COMMAND",
          safeActions: ["retry", "discard"],
        },
        "MANAGER",
        "manager",
        "store",
      ),
    ).toEqual(["retry", "discard"])
    for (const status of ["PENDING", "REVIEW_REQUIRED", "BLOCKED", "held"])
      expect(offlineReviewOutcome(status)).toContain("not been recorded")
    for (const status of ["APPLIED", "approved"])
      expect(offlineReviewOutcome(status)).toBe(
        "Applied. The sale is recorded.",
      )
    for (const status of ["DISCARDED", "rejected"])
      expect(offlineReviewOutcome(status)).toContain("will not be applied")
    expect(offlineReviewOutcome("unexpected")).toContain(
      "outcome is unavailable",
    )
  })
})
