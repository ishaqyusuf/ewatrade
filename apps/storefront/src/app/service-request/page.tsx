import { randomUUID } from "node:crypto"
import { StorefrontServiceRequest } from "@/components/storefront/storefront-service-request"
import { prisma } from "@ewatrade/db"
import {
  getStorefrontServiceIntake,
  isStorefrontServiceIntakeAllowed,
} from "@ewatrade/db/queries"
import { serviceOfferingIdsSchema } from "@ewatrade/storefront-contracts/actions"
import { headers } from "next/headers"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"
export const metadata = {
  title: "Request a quote | ẸwáTrade",
  robots: { index: false, follow: false },
}

export default async function ServiceRequestPage({
  searchParams,
}: {
  searchParams: Promise<{
    item?: string
    serviceOfferingId?: string | string[]
  }>
}) {
  const query = await searchParams
  const host = (await headers()).get("host") ?? ""
  if (query.item && !/^[A-Za-z0-9_-]{1,128}$/.test(query.item)) notFound()
  const current = await getStorefrontServiceIntake(prisma, host, query.item)
  if (!current) notFound()
  const hints =
    query.serviceOfferingId === undefined
      ? []
      : Array.isArray(query.serviceOfferingId)
        ? query.serviceOfferingId
        : [query.serviceOfferingId]
  if (hints.length && !serviceOfferingIdsSchema.safeParse(hints).success)
    notFound()
  const selected = hints.map((id) =>
    current.form.offerings.find(
      (option) =>
        option.id === id &&
        (!query.item || option.catalogItemId === query.item),
    ),
  )
  if (selected.some((option) => !option)) notFound()
  const initialOffering =
    selected[0] ??
    current.form.offerings.find(
      (option) => option.catalogItemId === query.item,
    ) ??
    current.form.offerings[0]
  if (
    selected.some(
      (option) => option?.catalogItemId !== initialOffering?.catalogItemId,
    )
  )
    notFound()
  if (!initialOffering) notFound()
  const allowed = await isStorefrontServiceIntakeAllowed(prisma, current.site)
  return (
    <StorefrontServiceRequest
      businessName={current.businessName}
      storefrontOrigin={`https://${host}`}
      form={current.form}
      initialOfferingId={initialOffering.id}
      initialOfferingIds={hints.length ? hints : [initialOffering.id]}
      clientRequestId={randomUUID()}
      whatsAppPhone={current.whatsAppPhone}
      available={allowed}
    />
  )
}
