import { prisma } from "@ewatrade/db"
import {
  countPublicStorefrontOfferings,
  getScopedStorefrontDesignPreview,
  resolveStorefrontHostAuthority,
} from "@ewatrade/db/queries"
import { catalogQuerySchema } from "@ewatrade/storefront-contracts/resources"
import { publicStorefrontResources } from "@ewatrade/storefront-runtime/projection"
import {
  commerceStudioManifest,
  defaultComposition,
} from "@ewatrade/storefront-templates"
import { StorefrontTemplate } from "@ewatrade/storefront-templates/render"
import { isLocalStorefrontPreviewHost } from "@ewatrade/utils"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import "@ewatrade/storefront-templates/styles.css"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
  title: "QA template preview",
  robots: { index: false, follow: false },
}

type Props = {
  searchParams: Promise<{ page?: string; item?: string; category?: string }>
}

/**
 * Local-development QA only: renders an existing QA business's current public
 * projection through Commerce studio without saving, publishing or writing anything.
 * Requires all four local runtime markers and a canonical local storefront host.
 */
export default async function QaTemplatePreview({ searchParams }: Props) {
  const host = (await headers()).get("host") ?? ""
  if (!isLocalStorefrontPreviewHost(host, process.env)) notFound()
  const authority = await resolveStorefrontHostAuthority(prisma, host)
  if (!authority?.localQaPreview) notFound()
  const tenant = await prisma.tenant.findFirst({
    where: { slug: authority.slug, dataClassification: "QA", isActive: true },
    select: {
      id: true,
      stores: {
        where: { status: "ACTIVE" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 1,
        select: { id: true },
      },
    },
  })
  const store = tenant?.stores[0]
  if (!tenant || !store) notFound()
  const params = await searchParams
  const query = catalogQuerySchema.safeParse({
    item: params.item,
    category: params.category,
  })
  if (!query.success) notFound()
  const projection = await getScopedStorefrontDesignPreview(
    prisma,
    { tenantId: tenant.id, storeId: store.id },
    query.data,
  )
  if (!projection) notFound()
  const offeringCounts = await countPublicStorefrontOfferings(prisma, {
    tenantId: tenant.id,
    storeId: store.id,
    storefrontItems: projection.storefrontItems ?? null,
  })
  const { resources, capabilities } = publicStorefrontResources({
    ...projection,
    offeringCounts,
  })
  const composition = defaultComposition(commerceStudioManifest)
  const pageKey = ["home", "shop", "services", "about"].includes(
    params.page ?? "",
  )
    ? (params.page as string)
    : "home"
  return (
    <>
      <p
        role="note"
        style={{
          margin: 0,
          padding: "6px 12px",
          background: "#3b2f12",
          color: "#fff6dd",
          fontSize: 13,
          textAlign: "center",
        }}
      >
        QA template preview · {projection.name} · read-only, nothing is saved or
        sent
      </p>
      <StorefrontTemplate
        snapshot={{
          mode: "preview",
          locale: "en-NG",
          currencyCode: projection.currencyCode,
          composition,
          resources,
          capabilities,
        }}
        domain={host}
        customerChatOrigin="https://chat.invalid"
        pageKey={pageKey}
        draftPreview
      />
    </>
  )
}
