import { prisma } from "@ewatrade/db"
import {
  CustomerChannelsError,
  getPublicCustomerEntryPoint,
} from "@ewatrade/db/queries"
import { notFound, redirect } from "next/navigation"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ token: string }> }

// Old printed Product links remain valid, but intake now happens behind the
// current Store Conversation Terms and content-safety boundary.
export default async function CustomerRequestPage({ params }: Props) {
  const { token } = await params
  try {
    await getPublicCustomerEntryPoint(prisma, { publicToken: token })
  } catch (error) {
    if (error instanceof CustomerChannelsError) notFound()
    throw error
  }
  redirect(`/r/${encodeURIComponent(token)}`)
}
