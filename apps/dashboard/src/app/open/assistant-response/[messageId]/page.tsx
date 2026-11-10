import { AssistantResponseLink } from "@/components/general-assistant/assistant-response-link"
import { getServerSession } from "@/lib/session"
import {
  assistantResponseMessageId,
  assistantResponsePath,
} from "@ewatrade/assistant/channels/conversation-links"
import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
  title: "Your saved response — EwaTrade",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

export default async function AssistantResponsePage({
  params,
}: { params: Promise<{ messageId: string }> }) {
  const parsed = assistantResponseMessageId.safeParse((await params).messageId)
  if (!parsed.success) notFound()
  if (!(await getServerSession()))
    redirect(
      `/login?next=${encodeURIComponent(assistantResponsePath(parsed.data))}`,
    )
  return <AssistantResponseLink messageId={parsed.data} />
}
