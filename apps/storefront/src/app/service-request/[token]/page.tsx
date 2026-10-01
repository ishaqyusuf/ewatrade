import { prisma } from "@ewatrade/db"
import { CatalogError, getPublicServiceRequestForm } from "@ewatrade/db/queries"
import { notFound, redirect } from "next/navigation"

import { findPublishedEntryForLegacyServiceForm } from "@/lib/legacy-service-intake"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ token: string }> }

// A legacy form token is scoped to its Store before forwarding to the
// conversation entry. This page no longer exposes a direct write action.
export default async function Page({ params }: Props) {
  const { token } = await params
  let form: Awaited<ReturnType<typeof getPublicServiceRequestForm>>
  try {
    form = await getPublicServiceRequestForm(prisma, { formToken: token })
  } catch (error) {
    if (error instanceof CatalogError) notFound()
    throw error
  }
  const entry = await findPublishedEntryForLegacyServiceForm(
    prisma,
    form.formId,
  )
  if (!entry) notFound()
  redirect(`/r/${encodeURIComponent(entry.publicToken)}`)
}
