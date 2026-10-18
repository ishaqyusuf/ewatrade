import { createHash } from "node:crypto"
import { withQaWorkspaceSuffix } from "@ewatrade/utils"
import {
  isValidStoreLink,
  normalizeStoreLink,
  storeLinkSuggestions,
} from "@ewatrade/utils/store-link"
import type { PrismaClient } from "../../generated/prisma/client"
import { configuredQaDomainForEmail } from "./qa-maintenance"

export class StoreLinkConflictError extends Error {
  constructor() {
    super("That store link was just taken. Choose another link.")
    this.name = "StoreLinkConflictError"
  }
}

export class StoreLinkRateLimitError extends Error {
  constructor() {
    super("Too many link checks. Try again in a minute.")
    this.name = "StoreLinkRateLimitError"
  }
}
export function storeLinkHostnames(slugs: string[]) {
  const domains = new Set(
    [
      process.env.NEXT_PUBLIC_PLATFORM_DOMAIN,
      process.env.PLATFORM_DOMAIN,
      "ewatrade.com",
    ]
      .filter((v): v is string => Boolean(v))
      .map(
        (v) =>
          v
            .replace(/^https?:\/\//, "")
            .split("/")[0]
            ?.split(":")[0],
      )
      .filter(Boolean),
  )
  return slugs.flatMap((slug) =>
    [...domains].map((domain) => `${slug}.${domain}`),
  )
}
/** One atomic budget per trusted network/minute; public checks never write draft data. */
export async function checkStoreLinkAvailability(
  db: PrismaClient,
  value: string,
  network: string | null,
  emailDomain?: string,
) {
  const slug = withQaWorkspaceSuffix(
    normalizeStoreLink(value),
    Boolean(
      emailDomain && configuredQaDomainForEmail(`link-check@${emailDomain}`),
    ),
    40,
  )
  const now = new Date()
  const bucketDigest = createHash("sha256")
    .update(
      `store-link:${network ?? "unknown"}:${Math.floor(now.getTime() / 60_000)}`,
    )
    .digest("hex")
  const bucket = await db.accountPrivacyRateBucket.upsert({
    where: { bucketDigest },
    create: { bucketDigest, windowStartedAt: now, sentCount: 1 },
    update: { sentCount: { increment: 1 } },
    select: { sentCount: true },
  })
  if (bucket.sentCount > 600) throw new StoreLinkRateLimitError()
  const candidates = [
    slug,
    ...storeLinkSuggestions(slug).map((s) =>
      withQaWorkspaceSuffix(
        s,
        Boolean(
          emailDomain &&
            configuredQaDomainForEmail(`link-check@${emailDomain}`),
        ),
        40,
      ),
    ),
  ]
  const [taken, hosts] = await Promise.all([
    db.tenant.findMany({
      where: { slug: { in: candidates } },
      select: { slug: true },
    }),
    db.tenantHostname.findMany({
      where: { hostname: { in: storeLinkHostnames(candidates) } },
      select: { hostname: true },
    }),
  ])
  const unavailable = new Set(taken.map((t) => t.slug))
  const unavailableHosts = new Set(hosts.map((h) => h.hostname))
  const available = (s: string) =>
    isValidStoreLink(s) &&
    !unavailable.has(s) &&
    !storeLinkHostnames([s]).some((host) => unavailableHosts.has(host))
  return {
    slug,
    available: available(slug),
    suggestions: candidates.slice(1).filter(available).slice(0, 3),
  }
}
