import { AssistantDataDownload } from "@/components/account/assistant-data-download"
import { SignOut } from "@/components/dashboard/sign-out"
import { PageHeader } from "@/components/page-header"
import { getServerSession } from "@/lib/session"
import Link from "next/link"
import { redirect } from "next/navigation"

export const metadata = { title: "Your assistant data | EwaTrade" }

export default async function AssistantDataAccountPage() {
  const session = await getServerSession()
  if (!session) redirect("/login?next=%2Faccount%2Fassistant-data")
  return (
    <main className="mx-auto grid w-full max-w-2xl gap-8 px-4 py-8">
      <div className="flex items-center justify-between gap-4">
        <Link href="/account/whatsapp" className="text-sm underline">
          WhatsApp assistant
        </Link>
        <SignOut appearance="button" />
      </div>
      <PageHeader
        eyebrow="Your account"
        title="Your assistant data"
        description="Access a copy of your private assistant history."
      />
      <AssistantDataDownload key={`${session.user.id}:${session.sessionId}`} />
    </main>
  )
}
