import { AssistantLinkReview } from "@/components/general-assistant/assistant-link-review"
import { getServerSession } from "@/lib/session"
import {
  assistantReviewPath,
  assistantReviewShortLocatorSchema,
} from "@ewatrade/assistant/channels/review-links"
import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
  title: "Review your draft — EwaTrade",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

/** GET only opens the existing signed-in review; it never approves or redirects off-site. */
export default async function ShortAssistantReviewPage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params
  const parsed = assistantReviewShortLocatorSchema.safeParse(`r_${handle}`)
  const locator = parsed.success ? parsed.data : ""
  const session = await getServerSession()
  if (!session) {
    const next = assistantReviewPath(locator) ?? "/assistant-review"
    redirect(`/login?next=${encodeURIComponent(next)}`)
  }
  return <AssistantLinkReview initialToken={locator} />
}
