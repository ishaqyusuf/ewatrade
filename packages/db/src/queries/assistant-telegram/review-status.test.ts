import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import {
  finishAssistantTelegramReviewRenewal,
  markAssistantTelegramReviewExpired,
  readAssistantTelegramExpiredReview,
} from "./review-status"

const now = new Date("2026-11-12T09:02:00.000Z")
const lease = {
  inboxId: "inbox",
  bindingId: "binding",
  owner: "owner",
  generation: 1,
}
const reviewId = "r".repeat(24)

function fixture(count = 1) {
  const calls: unknown[] = []
  const tx = {
    $queryRaw: async () => [],
    assistantTelegramActionReview: {
      findFirst: async (args: unknown) => {
        calls.push(["findFirst", args])
        return null
      },
      updateMany: async (args: unknown) => {
        calls.push(["updateMany", args])
        return { count }
      },
    },
  } as unknown as Prisma.TransactionClient
  return { tx, calls }
}

test("a late tap reads only this chat's expired, sent review", async () => {
  const { tx, calls } = fixture()
  expect(
    await readAssistantTelegramExpiredReview(
      tx,
      lease,
      { reviewId, providerMessageId: "77", decision: "expired-or-open" },
      now,
    ),
  ).toBeNull()
  expect(
    await readAssistantTelegramExpiredReview(
      tx,
      lease,
      { reviewId: "short", decision: "expired" },
      now,
    ),
  ).toBeNull()
  expect(calls).toEqual([
    [
      "findFirst",
      {
        where: {
          id: reviewId,
          bindingId: "binding",
          expiresAt: { lte: now },
          OR: [{ decision: null }, { decision: "expired" }],
          outbox: { state: "SENT", providerMessageId: "77" },
        },
        include: {
          outbox: {
            select: { authorityDigest: true, providerMessageId: true },
          },
        },
      },
    ],
  ])
})

test("Review it again needs a review already marked expired", async () => {
  const { tx, calls } = fixture()
  await readAssistantTelegramExpiredReview(
    tx,
    lease,
    { reviewId, decision: "expired" },
    now,
  )
  expect(calls[0]).toMatchObject([
    "findFirst",
    { where: { decision: "expired", outbox: { state: "SENT" } } },
  ])
})

test("an expired review is marked once and renewed at most once", async () => {
  const { tx, calls } = fixture()
  await markAssistantTelegramReviewExpired(tx, reviewId, now)
  await finishAssistantTelegramReviewRenewal(tx, reviewId, now)
  expect(calls).toEqual([
    [
      "updateMany",
      {
        where: { id: reviewId, decision: null, expiresAt: { lte: now } },
        data: { decision: "expired", completedAt: now },
      },
    ],
    [
      "updateMany",
      {
        where: { id: reviewId, decision: "expired", expiresAt: { lte: now } },
        data: { decision: "renewed", completedAt: now },
      },
    ],
  ])
  await expect(
    finishAssistantTelegramReviewRenewal(fixture(0).tx, reviewId, now),
  ).rejects.toMatchObject({ code: "CONFLICT" })
})
