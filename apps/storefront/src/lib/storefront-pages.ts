import "server-only"

import { prisma } from "@ewatrade/db"
import {
  getStorefrontCustomerSession,
  listLinkableStorefrontRequests,
  listStorefrontCustomerOrders,
  listStorefrontCustomerServiceRequests,
  maskStorefrontIdentifier,
  storefrontReceiptToken,
} from "@ewatrade/db/queries"
import {
  type CatalogQuery,
  catalogQuerySchema,
} from "@ewatrade/storefront-contracts/resources"
import type {
  AccountView,
  StorefrontCustomerView,
} from "@ewatrade/storefront-templates/commerce-studio"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { cache } from "react"
import { customerSessionToken, receiptSecret } from "./storefront-commerce"
import { loadFactoryStorefront } from "./storefront-factory"

export const loadStorefrontPage = cache(
  async (
    after?: string,
    category?: string,
    item?: string,
    q?: string,
    availability?: CatalogQuery["availability"],
    sort?: CatalogQuery["sort"],
  ) => {
    const query = catalogQuerySchema.safeParse({
      after,
      category,
      item,
      q,
      availability,
      sort,
    })
    if (!query.success) notFound()
    const host = (await headers()).get("host") ?? ""
    const result = await loadFactoryStorefront(prisma, host, query.data)
    if (item && !result.storefront?.highlightedItem) notFound()
    return { ...result, host }
  },
)

export const loadCustomerSession = cache(async () => {
  const host = (await headers()).get("host") ?? ""
  return getStorefrontCustomerSession(prisma, {
    host,
    token: await customerSessionToken(),
  })
})

export function customerView(
  session: Awaited<ReturnType<typeof loadCustomerSession>>,
): StorefrontCustomerView {
  if (!session) return { signedIn: false }
  const channel = session.customer.emailNormalized ? "email" : "whatsapp"
  const identifier =
    session.customer.emailNormalized ?? session.customer.phoneE164 ?? ""
  return {
    signedIn: true,
    channel,
    label: maskStorefrontIdentifier(channel, identifier),
  }
}

/** Verified history for this business only, with receipt links for each request. */
export async function signedInAccount(
  session: NonNullable<Awaited<ReturnType<typeof loadCustomerSession>>>,
): Promise<AccountView> {
  const [orders, services, linkable] = await Promise.all([
    listStorefrontCustomerOrders(prisma, {
      tenantId: session.tenantId,
      customerId: session.customer.id,
    }),
    listStorefrontCustomerServiceRequests(prisma, {
      tenantId: session.tenantId,
      customerId: session.customer.id,
    }),
    listLinkableStorefrontRequests(prisma, {
      tenantId: session.tenantId,
      customerId: session.customer.id,
    }),
  ])
  const serviceIds = await prisma.storefrontServiceRequestContext.findMany({
    where: { id: { in: services.map((entry) => entry.id) } },
    select: { id: true, serviceRequestId: true },
  })
  const secret = receiptSecret()
  const view = customerView(session)
  return {
    signedIn: true,
    label: view?.label ?? "",
    channel: view?.channel ?? "email",
    history: [
      ...orders.map((entry) => ({
        key: `o-${entry.id}`,
        reference: entry.reference,
        kind: "order" as const,
        stage: entry.stage,
        createdAt: entry.createdAt,
        summary: entry.summary,
        href: `/receipt/${storefrontReceiptToken("order", entry.id, secret)}`,
      })),
      ...services.map((entry) => ({
        key: `s-${entry.id}`,
        reference: entry.reference,
        kind: "service" as const,
        stage: entry.status,
        createdAt: entry.createdAt,
        summary: entry.summary,
        href: `/receipt/${storefrontReceiptToken(
          "service",
          serviceIds.find((row) => row.id === entry.id)?.serviceRequestId ?? "",
          secret,
        )}`,
      })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    linkable: linkable.map((entry) => ({
      reference: entry.reference,
      kind: entry.kind,
      createdAt: entry.createdAt.toISOString(),
    })),
  }
}
