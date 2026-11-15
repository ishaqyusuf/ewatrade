import { AccountLink, AccountPage } from "@/components/account/account-page"
import { AssistantDataDownload } from "@/components/account/assistant-data-download"
import { getServerSession } from "@/lib/session"
import { redirect } from "next/navigation"

export const metadata = { title: "Your assistant data | EwaTrade" }

export default async function AssistantDataAccountPage() {
  const session = await getServerSession()
  if (!session) redirect("/login?next=%2Faccount%2Fassistant-data")
  return (
    <AccountPage
      title="Your assistant data"
      links={
        <>
          <AccountLink href="/account/whatsapp">WhatsApp assistant</AccountLink>
          <AccountLink href="/account/telegram">Telegram assistant</AccountLink>
        </>
      }
    >
      <AssistantDataDownload key={`${session.user.id}:${session.sessionId}`} />
    </AccountPage>
  )
}
