import { ReceiptApprovalReview } from "@/components/general-assistant/receipt-approval-review"
import { getServerSession } from "@/lib/session"
import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
  title: "Approve a receipt — EwaTrade",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

/** A cashier's receipt sent for approval (Workshop 19l). GET never saves. */
export default async function ReceiptApprovalPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: value } = await params
  const id = /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : ""
  const session = await getServerSession()
  if (!session) {
    const next = id ? `/receipt-approval/${id}` : "/"
    redirect(`/login?next=${encodeURIComponent(next)}`)
  }
  return <ReceiptApprovalReview id={id} />
}
