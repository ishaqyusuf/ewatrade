import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import {
  eraseAssistantWhatsAppPrivateCleanupInTransaction,
  readAssistantWhatsAppPrivateCleanupSnapshot,
} from "./private-cleanup"

const now = new Date("2026-10-15T12:00:00Z")
function fixture() {
  const changes: string[] = []
  const data = {
    identities: [
      {
        id: "identity",
        userId: "subject",
        generation: 2,
        selectionGeneration: 2,
        activeBindingId: null,
        revokedAt: now,
        updatedAt: now,
      },
    ],
    grants: [
      {
        id: "grant",
        identityId: "identity",
        generation: 2,
        revokedAt: now,
        updatedAt: now,
        membership: { userId: "subject" },
      },
    ],
    bindings: [
      {
        id: "binding",
        identityId: "identity",
        grantId: "grant",
        conversation: { ownerUserId: "subject" },
      },
    ],
    links: [
      {
        id: "link",
        userId: "subject",
        revision: 2,
        cancelledAt: now,
        confirmedAt: now,
        expiresAt: now,
        membership: { userId: "subject" },
      },
    ],
    inbox: [
      {
        id: "inbox",
        identityId: null,
        bindingId: "binding",
        state: "COMPLETED",
        leaseOwner: null as string | null,
        leaseExpiresAt: null as Date | null,
        updatedAt: now,
      },
    ],
    outbox: [
      {
        id: "outbox",
        state: "FAILED",
        leaseOwner: null as string | null,
        leaseExpiresAt: null as Date | null,
        updatedAt: now,
      },
    ],
    attempts: [{ id: "attempt", state: "REJECTED", updatedAt: now }],
    selections: [{ id: "selection" }],
    usage: [{ id: "usage", updatedAt: now }],
  }
  const table = (name: string, rows: unknown[]) => ({
    findMany: async () => structuredClone(rows),
    deleteMany: async () => {
      changes.push(name)
      return { count: rows.length }
    },
  })
  const db = {
    $queryRaw: async () => [],
    assistantWhatsAppIdentity: table("identity", data.identities),
    assistantWhatsAppGrant: table("grant", data.grants),
    assistantWhatsAppBinding: table("binding", data.bindings),
    assistantWhatsAppLink: table("link", data.links),
    assistantWhatsAppInbox: table("inbox", data.inbox),
    assistantWhatsAppOutbox: table("outbox", data.outbox),
    assistantWhatsAppAttempt: table("attempt", data.attempts),
    assistantWhatsAppSelection: table("selection", data.selections),
    assistantWhatsAppUsageBucket: table("usage", data.usage),
    assistantWhatsAppActionReview: { count: async () => 0 },
    assistantWhatsAppWorkflowReview: { count: async () => 0 },
  } as unknown as Prisma.TransactionClient
  return { db, data, changes }
}
function first<T>(rows: T[]): T {
  const row = rows[0]
  if (!row) throw Error("Missing owned fixture row")
  return row
}

test("uncertain original send and active inbox/outbox leases forbid erasure without touching proof", async () => {
  for (const kind of [
    "SENDING",
    "UNKNOWN",
    "STARTED",
    "UNKNOWN_ATTEMPT",
    "INBOX_LEASE",
    "OUTBOX_LEASE",
  ]) {
    const input = fixture()
    if (["SENDING", "UNKNOWN"].includes(kind))
      first(input.data.outbox).state = kind
    if (kind === "STARTED" || kind === "UNKNOWN_ATTEMPT")
      first(input.data.attempts).state = kind === "STARTED" ? kind : "UNKNOWN"
    if (kind === "INBOX_LEASE")
      first(input.data.inbox).leaseOwner = "still-owned"
    if (kind === "OUTBOX_LEASE")
      first(input.data.outbox).leaseExpiresAt = new Date(now.getTime() + 60_000)
    const snapshot = await readAssistantWhatsAppPrivateCleanupSnapshot(
      input.db,
      "subject",
      now,
    )
    expect(snapshot.unresolved).toBe(true)
    await expect(
      eraseAssistantWhatsAppPrivateCleanupInTransaction(
        input.db,
        "subject",
        snapshot,
        now,
      ),
    ).rejects.toMatchObject({ code: "PRIVATE_WORK_UNRESOLVED" })
    expect(input.changes).toEqual([])
    expect(snapshot.attempts).toHaveLength(1)
  }
})

test("foreign membership and conversation attribution cannot be erased through own identity", async () => {
  for (const kind of ["grant", "binding", "link", "inbox"]) {
    const input = fixture()
    if (kind === "grant") first(input.data.grants).membership.userId = "foreign"
    if (kind === "binding")
      first(input.data.bindings).conversation.ownerUserId = "foreign"
    if (kind === "link") first(input.data.links).membership.userId = "foreign"
    if (kind === "inbox") first(input.data.inbox).bindingId = "foreign"
    await expect(
      readAssistantWhatsAppPrivateCleanupSnapshot(input.db, "subject", now),
    ).rejects.toMatchObject({ code: "SHARED_SCOPE_REVIEW_REQUIRED" })
    expect(input.changes).toEqual([])
  }
})

test("source revision change refuses erasure; exact settled snapshot permits only owned dependency roots", async () => {
  const input = fixture()
  const before = await readAssistantWhatsAppPrivateCleanupSnapshot(
    input.db,
    "subject",
    now,
  )
  first(input.data.outbox).updatedAt = new Date(now.getTime() + 1)
  await expect(
    eraseAssistantWhatsAppPrivateCleanupInTransaction(
      input.db,
      "subject",
      before,
      now,
    ),
  ).rejects.toMatchObject({ code: "SCOPE_CHANGED" })
  expect(input.changes).toEqual([])
  const fresh = await readAssistantWhatsAppPrivateCleanupSnapshot(
    input.db,
    "subject",
    now,
  )
  expect(
    await eraseAssistantWhatsAppPrivateCleanupInTransaction(
      input.db,
      "subject",
      fresh,
      now,
    ),
  ).toBe(4)
  expect(input.changes).toEqual(["inbox", "identity", "link", "usage"])
})
