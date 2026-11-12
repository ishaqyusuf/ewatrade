import { expect, test } from "bun:test"
import type { DbClient } from "../types"
import type { TelegramInboxLease } from "./authority"
import { readAssistantTelegramDraftState } from "./control"
import { readAssistantTelegramActionReview } from "./review"

const now = new Date("2026-11-12T10:00:00Z")

function reviews(rows: {
  open?: { providerMessageId: string | null }
  latest?: { decision: string; completedAt: Date }
}) {
  const wheres: unknown[] = []
  const db = {
    assistantTelegramActionReview: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        wheres.push(where)
        if (where.decision === null)
          return rows.open ? { outbox: rows.open } : null
        return rows.latest ?? null
      },
    },
  } as unknown as DbClient
  return { db, wheres }
}

test("an open review is found only for this binding, unexpired, sent and pending", async () => {
  const { db, wheres } = reviews({ open: { providerMessageId: "41" } })
  expect(await readAssistantTelegramDraftState(db, "binding-1", now)).toEqual({
    state: "open",
    reviewMessageId: "41",
  })
  expect(wheres[0]).toEqual({
    bindingId: "binding-1",
    decision: null,
    expiresAt: { gt: now },
    outbox: { state: "SENT" },
    proposal: { status: "PENDING", expiresAt: { gt: now } },
  })
})

test("a cancel is mentioned for 15 minutes, then the chat has nothing to decide", async () => {
  const recent = reviews({
    latest: {
      decision: "cancel",
      completedAt: new Date(now.getTime() - 5 * 60_000),
    },
  })
  expect(
    await readAssistantTelegramDraftState(recent.db, "binding-1", now),
  ).toEqual({ state: "cancelled" })
  const old = reviews({
    latest: {
      decision: "cancel",
      completedAt: new Date(now.getTime() - 20 * 60_000),
    },
  })
  expect(
    await readAssistantTelegramDraftState(old.db, "binding-1", now),
  ).toEqual({ state: "none" })
  const confirmed = reviews({
    latest: { decision: "confirm", completedAt: now },
  })
  expect(
    await readAssistantTelegramDraftState(confirmed.db, "binding-1", now),
  ).toEqual({ state: "none" })
})

test("s-forward: a review's buttons work only on the exact message in its own chat", async () => {
  // A forwarded copy is a different message, and usually in a different chat
  // and binding. The proof query must filter on both.
  const reviewId = "r".repeat(24)
  const wheres: unknown[] = []
  const tx = {
    $queryRaw: async () => [],
    assistantTelegramActionReview: {
      findFirst: async ({ where }: { where: unknown }) => {
        wheres.push(where)
        return null
      },
    },
  } as unknown as Parameters<typeof readAssistantTelegramActionReview>[0]
  const lease = { bindingId: "binding-2" } as unknown as TelegramInboxLease
  expect(
    await readAssistantTelegramActionReview(
      tx,
      lease,
      { reviewId, providerMessageId: "77" },
      now,
    ),
  ).toBeNull()
  expect(wheres).toEqual([
    {
      id: reviewId,
      bindingId: "binding-2",
      expiresAt: { gt: now },
      outbox: { state: "SENT", providerMessageId: "77" },
    },
  ])
})
