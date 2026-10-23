import { randomUUID } from "node:crypto"
import type { PrismaClient } from "@ewatrade/db"
import { prisma } from "@ewatrade/db/client"
import {
  loadLiveStorefrontForHost,
  siteContentHash,
} from "@ewatrade/db/queries"
import { versionAvailable } from "@ewatrade/storefront-contracts/availability"
import { STOREFRONT_RUNTIME_VERSION } from "@ewatrade/storefront-contracts/manifest"
import { publicStorefrontResources } from "@ewatrade/storefront-runtime/projection"
import { loadStorefront } from "@ewatrade/storefront-runtime/server"
import { templateRegistry } from "@ewatrade/storefront-templates"
import { getStorefrontDomain } from "@ewatrade/utils"

const consumer = "storefront_release"
const maxAttempts = 3

/**
 * Durable source health check, using the ordinary host/plan/catalog authorities.
 * This does not fetch the deployed HTTP host or claim TLS/delivery was verified.
 * Public renders are uncached, so there is no shared page cache to invalidate.
 */
export async function runStorefrontReleaseChecks(db: PrismaClient = prisma) {
  const now = new Date()
  const due = {
    consumer,
    OR: [
      {
        status: "PENDING" as const,
        nextAttemptAt: { lte: now },
        attemptCount: { lt: maxAttempts },
      },
      { status: "CLAIMED" as const, claimExpiresAt: { lte: now } },
    ],
  }
  const rows = await db.businessActivityOutbox.findMany({
    where: due,
    orderBy: { nextAttemptAt: "asc" },
    take: 10,
    select: {
      id: true,
      tenantId: true,
      attemptCount: true,
      event: { select: { sourceId: true, storeId: true, payload: true } },
    },
  })
  for (const row of rows) {
    if (row.attemptCount >= maxAttempts) {
      await db.businessActivityOutbox.updateMany({
        where: { ...due, id: row.id, tenantId: row.tenantId },
        data: {
          status: "FAILED",
          failureCode: "SOURCE_CHECK_FAILED",
          claimId: null,
          claimExpiresAt: null,
        },
      })
      continue
    }
    const claimId = randomUUID()
    const claimed = await db.businessActivityOutbox.updateMany({
      where: { ...due, id: row.id, tenantId: row.tenantId },
      data: {
        status: "CLAIMED",
        claimId,
        claimExpiresAt: new Date(Date.now() + 120_000),
        attemptCount: { increment: 1 },
      },
    })
    if (!claimed.count) continue
    const owned = {
      id: row.id,
      tenantId: row.tenantId,
      status: "CLAIMED" as const,
      claimId,
    }
    try {
      const payload = row.event.payload
      const releaseId =
        payload &&
        typeof payload === "object" &&
        !Array.isArray(payload) &&
        typeof payload.releaseId === "string"
          ? payload.releaseId
          : null
      const tenant = await db.tenant.findUnique({
        where: { id: row.tenantId },
        select: { slug: true },
      })
      const host = tenant
        ? `${tenant.slug}.${getStorefrontDomain(process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com")}`
        : ""
      const value = host ? await loadLiveStorefrontForHost(db, host) : null
      let result = "PUBLIC_SOURCE_UNAVAILABLE"
      if (
        value &&
        value.site.siteId === row.event.sourceId &&
        value.site.storeId === row.event.storeId
      ) {
        const release = value.site.release
        if (release.id !== releaseId) result = "SUPERSEDED"
        else {
          const entry = templateRegistry.find(
            (entry) =>
              entry.manifest.key === release.templateKey &&
              entry.manifest.version === release.templateVersion &&
              entry.status.registration === "runtime-registered" &&
              entry.status.qualification === "qualified" &&
              versionAvailable(entry, "render"),
          )
          if (
            !entry ||
            release.runtimeVersion !== STOREFRONT_RUNTIME_VERSION ||
            release.contentHash !== siteContentHash(release.composition)
          )
            result = "DESIGN_UNAVAILABLE"
          else {
            const load = await loadStorefront({
              registry: templateRegistry,
              resolveSite: async () => ({
                scope: {
                  tenantId: row.tenantId,
                  siteId: value.site.siteId,
                  storeId: value.site.storeId,
                  releaseId: release.id,
                  mode: "live" as const,
                  currencyCode: value.storefront.currencyCode,
                  locale: "en-NG",
                },
                composition: release.composition,
              }),
              loadResources: async () =>
                publicStorefrontResources(value.storefront),
            })
            result =
              load.status === "ready" &&
              load.manifest.key === release.templateKey &&
              load.manifest.version === release.templateVersion
                ? "SOURCE_READY_HTTP_UNVERIFIED"
                : "DESIGN_UNAVAILABLE"
          }
        }
      }
      await db.businessActivityOutbox.updateMany({
        where: owned,
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          failureCode: result,
          claimId: null,
          claimExpiresAt: null,
        },
      })
    } catch {
      // Bounded retry, with no provider errors/content copied into audit records.
      await db.businessActivityOutbox.updateMany({
        where: owned,
        data: {
          status: row.attemptCount + 1 >= maxAttempts ? "FAILED" : "PENDING",
          failureCode: "SOURCE_CHECK_FAILED",
          claimId: null,
          claimExpiresAt: null,
          nextAttemptAt: new Date(Date.now() + 60_000),
        },
      })
    }
  }
  return { considered: rows.length }
}
