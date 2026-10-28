import "server-only"

import { prisma } from "@ewatrade/db"
import {
  findVerifiedStorefrontRequest,
  getStorefrontCustomerSession,
  listLinkableStorefrontRequests,
  listStorefrontCustomerOrders,
  listStorefrontCustomerServiceRequests,
  loadStorefrontContextForHost,
  maskStorefrontIdentifier,
  storefrontReceiptToken,
} from "@ewatrade/db/queries"
import { storefrontCustomerScopeFromContext } from "@ewatrade/db/storefront-customer-scope"
import type {
  AccountView,
  StorefrontCustomerView,
} from "@ewatrade/storefront-contracts/customer"
import {
  type CatalogQuery,
  catalogQuerySchema,
} from "@ewatrade/storefront-contracts/resources"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { cache } from "react"
import { customerSessionToken, receiptSecret } from "./storefront-commerce"
import { loadFactoryStorefront } from "./storefront-factory"

const loadRequestContext = cache(async () => {
  const host = (await headers()).get("host") ?? ""
  return { host, context: await loadStorefrontContextForHost(prisma, host) }
})

const loadCachedStorefrontPage = cache(
  async (
    after?: string,
    category?: string,
    item?: string,
    q?: string,
    availability?: CatalogQuery["availability"],
    sort?: CatalogQuery["sort"],
    pageKey = "home",
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
    const { host, context } = await loadRequestContext()
    const result = await loadFactoryStorefront(prisma, host, query.data, {
      context,
      pageKey,
      catalog: ["shell", "about", "account", "checkout", "receipt"].includes(
        pageKey,
      )
        ? "none"
        : item
          ? "detail"
          : undefined,
    })
    if (item && !result.storefront?.highlightedItem) notFound()
    return { ...result, host }
  },
)

export function loadStorefrontPage(
  after?: string,
  category?: string,
  item?: string,
  q?: string,
  availability?: CatalogQuery["availability"],
  sort?: CatalogQuery["sort"],
  pageKey = "home",
) {
  return loadCachedStorefrontPage(
    after,
    category,
    item,
    q,
    availability,
    sort,
    pageKey,
  )
}

export function loadStorefrontFrame(
  pageKey: "shell" | "about" | "account" | "checkout" | "receipt",
) {
  return loadStorefrontPage(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    pageKey,
  )
}

export const loadCustomerSession = cache(async () => {
  const host = (await headers()).get("host") ?? ""
  return getStorefrontCustomerSession(
    prisma,
    { host, token: await customerSessionToken() },
    async () =>
      storefrontCustomerScopeFromContext((await loadRequestContext()).context),
  )
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
    name: session.customer.displayName,
    email: session.customer.emailNormalized,
    phone: session.customer.phoneE164,
  }
}

/**
 * Verified history for this business only, with receipt links for each request.
 * `reference` is guest-recovery intent carried through login; only a request from
 * the session's verified WhatsApp number in this Store resolves to a link.
 */
export async function signedInAccount(
  session: NonNullable<Awaited<ReturnType<typeof loadCustomerSession>>>,
  reference?: string,
): Promise<AccountView> {
  const [orders, services, linkable, found] = await Promise.all([
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
    reference
      ? findVerifiedStorefrontRequest(prisma, {
          tenantId: session.tenantId,
          storeId: session.storeId,
          customerId: session.customer.id,
          reference,
        })
      : null,
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
    lookup: reference
      ? {
          reference,
          href: found
            ? `/receipt/${storefrontReceiptToken(found.kind, found.requestId, secret)}`
            : null,
        }
      : null,
  }
}
