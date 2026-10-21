import { AssistantLinkReview } from "@/components/general-assistant/assistant-link-review"
import { getServerSession } from "@/lib/session"
import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
  title: "Review your draft — EwaTrade",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

/** A focused review, without the Assistant chat or dashboard shell. GET never saves. */
export default async function AssistantReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>
}) {
  const { token: value } = await searchParams
  const token = typeof value === "string" && value.length <= 2048 ? value : ""
  const session = await getServerSession()
  if (!session) {
    const next = `/assistant-review${token ? `?token=${encodeURIComponent(token)}` : ""}`
    redirect(`/login?next=${encodeURIComponent(next)}`)
  }
  return <AssistantLinkReview initialToken={token} />
}
