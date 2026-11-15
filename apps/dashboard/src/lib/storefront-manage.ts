import "server-only"

import { prisma } from "@ewatrade/db"
import { buildInternalTenantHostname } from "@ewatrade/utils"

export type StorefrontState = "none" | "draft" | "live" | "paused"

export type StorefrontSummary = {
  state: StorefrontState
  /** The platform address customers use (slug subdomain). */
  url: string
  storeName: string | null
  /** When the live design was published (ISO). */
  publishedAt: string | null
  /** Saved Studio changes that are not live yet. */
  unpublishedChanges: boolean
  /** Items the owner hid from the online store in this Store. */
  hiddenItems: number
  /** Website orders and service requests waiting for a reply. */
  toReview: number
  domains: Array<{
    id: string
    hostname: string
    status: string
    isPrimary: boolean
  }>
}

export function storefrontUrl(slug: string) {
  return `https://${buildInternalTenantHostname({
    tenantSlug: slug,
    surface: "storefront",
    platformDomain: process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com",
  })}`
}

/**
 * Online store page reads, Owner/Admin only (the page checks the role).
 * One round trip for the site, domains and requests, then one count for the
 * site's Store: 5 SQL statements (4 without domains). Mirrors the public
 * loader's rule: live means a published primary Site with an active release
 * in an active Store.
 */
export async function getStorefrontSummary(input: {
  tenantId: string
  tenantSlug: string
  storeIds: readonly string[]
  domainsEnabled: boolean
}): Promise<StorefrontSummary> {
  const [site, domains, orders, services] = await Promise.all([
    prisma.site.findFirst({
      where: { tenantId: input.tenantId, isPrimary: true },
      select: {
        status: true,
        storeId: true,
        draftRevision: true,
        store: { select: { name: true, status: true } },
        activeRelease: { select: { draftRevision: true, createdAt: true } },
      },
    }),
    input.domainsEnabled
      ? prisma.domainConnection.findMany({
          where: { tenantId: input.tenantId, status: { not: "DISCONNECTED" } },
          select: { id: true, hostname: true, status: true, isPrimary: true },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
          take: 5,
        })
      : Promise.resolve([]),
    prisma.storefrontOrderRequest.count({
      where: {
        tenantId: input.tenantId,
        storeId: { in: [...input.storeIds] },
        status: "SUBMITTED",
      },
    }),
    prisma.storefrontServiceRequestContext.count({
      where: {
        tenantId: input.tenantId,
        serviceRequest: {
          storeId: { in: [...input.storeIds] },
          status: "SUBMITTED",
        },
      },
    }),
  ])
  const hiddenItems = site
    ? await prisma.catalogStorefrontPolicy.count({
        where: {
          tenantId: input.tenantId,
          storeId: site.storeId,
          unavailable: true,
          catalogItem: { archivedAt: null },
        },
      })
    : 0
  const live =
    site?.status === "PUBLISHED" &&
    site.activeRelease !== null &&
    site.store.status === "ACTIVE"
  const state: StorefrontState = !site
    ? "none"
    : live
      ? "live"
      : site.activeRelease && site.status === "PUBLISHED"
        ? "paused"
        : "draft"
  return {
    state,
    url: storefrontUrl(input.tenantSlug),
    storeName: site?.store.name ?? null,
    publishedAt: site?.activeRelease?.createdAt.toISOString() ?? null,
    unpublishedChanges:
      !!site?.activeRelease &&
      site.draftRevision > site.activeRelease.draftRevision,
    hiddenItems,
    toReview: orders + services,
    domains: domains.map((domain) => ({ ...domain, status: domain.status })),
  }
}
