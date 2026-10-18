import { createHash } from "node:crypto"
import {
  isValidStoreLink,
  normalizeStoreLink,
  storeLinkSuggestions,
} from "@ewatrade/utils/store-link"
import type { PrismaClient } from "../../generated/prisma/client"

export class StoreLinkConflictError extends Error {
  constructor() {
    super("That store link was just taken. Choose another link.")
    this.name = "StoreLinkConflictError"
  }
}

/** One durable budget per trusted network; no client-supplied identity. */
export async function checkStoreLinkAvailability(
  db: PrismaClient,
  value: string,
  network: string | null,
) {
  const slug = normalizeStoreLink(value)
  const now = new Date()
  const bucketDigest = createHash("sha256")
    .update(`store-link:${network ?? "unknown"}`)
    .digest("hex")
  await db.$transaction(
    async (tx) => {
      const bucket = await tx.accountPrivacyRateBucket.findUnique({
        where: { bucketDigest },
      })
      const active =
        bucket && now.getTime() - bucket.windowStartedAt.getTime() < 60_000
      if (active && bucket.sentCount >= 120)
        throw new Error("Too many link checks. Try again in a minute.")
      await tx.accountPrivacyRateBucket.upsert({
        where: { bucketDigest },
        create: { bucketDigest, windowStartedAt: now, sentCount: 1 },
        update: {
          windowStartedAt: active ? undefined : now,
          sentCount: active ? { increment: 1 } : 1,
        },
      })
    },
    { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
  )
  const candidates = [slug, ...storeLinkSuggestions(slug)]
  const taken = await db.tenant.findMany({
    where: { slug: { in: candidates } },
    select: { slug: true },
  })
  const unavailable = new Set(taken.map((t) => t.slug))
  return {
    slug,
    available: isValidStoreLink(slug) && !unavailable.has(slug),
    suggestions: candidates
      .slice(1)
      .filter((s) => isValidStoreLink(s) && !unavailable.has(s))
      .slice(0, 3),
  }
}
