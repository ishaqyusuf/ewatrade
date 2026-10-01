import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { consumeMobilePasswordAttempt } from "./mobile-auth"
import type { DbClient } from "./types"

const originalSecret = process.env.BETTER_AUTH_SECRET
beforeAll(() => {
  process.env.BETTER_AUTH_SECRET = "test-only-mobile-password-rate-secret"
})
afterAll(() => {
  if (originalSecret === undefined) process.env.BETTER_AUTH_SECRET = undefined
  else process.env.BETTER_AUTH_SECRET = originalSecret
})

function createBucketDb() {
  const buckets = new Map<
    string,
    { sentCount: number; windowStartedAt: Date }
  >()
  const db = {
    async $transaction<T>(callback: (tx: unknown) => Promise<T>) {
      return callback(this)
    },
    accountPrivacyRateBucket: {
      async findUnique({ where }: { where: { bucketDigest: string } }) {
        return buckets.get(where.bucketDigest) ?? null
      },
      async upsert(input: {
        where: { bucketDigest: string }
        create: { sentCount: number; windowStartedAt: Date }
        update: {
          sentCount: number | { increment: number }
          windowStartedAt?: Date
        }
      }) {
        const existing = buckets.get(input.where.bucketDigest)
        buckets.set(
          input.where.bucketDigest,
          existing
            ? {
                sentCount:
                  typeof input.update.sentCount === "number"
                    ? input.update.sentCount
                    : existing.sentCount + input.update.sentCount.increment,
                windowStartedAt:
                  input.update.windowStartedAt ?? existing.windowStartedAt,
              }
            : input.create,
        )
      },
    },
  }
  return { db: db as unknown as DbClient, buckets }
}

describe("native password sign-in throttle", () => {
  test("caps attempts for a normalized address and resets after 15 minutes", async () => {
    const { db, buckets } = createBucketDb()
    const now = new Date("2026-09-24T00:00:00.000Z")
    for (let attempt = 0; attempt < 8; attempt++)
      expect(
        await consumeMobilePasswordAttempt(db, "  REVIEWER@example.test ", now),
      ).toBe(true)
    expect(
      await consumeMobilePasswordAttempt(db, "reviewer@example.test", now),
    ).toBe(false)
    expect(buckets.size).toBe(1)
    expect(
      await consumeMobilePasswordAttempt(
        db,
        "reviewer@example.test",
        new Date(now.getTime() + 15 * 60_000),
      ),
    ).toBe(true)
  })
})
