import { AccountLink, AccountPage } from "@/components/account/account-page"
import { ConnectTelegram } from "@/components/assistant-telegram/connect-telegram"
import { TelegramConnections } from "@/components/assistant-telegram/telegram-connections"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { redirect } from "next/navigation"

export const metadata = { title: "Telegram assistant | EwaTrade" }

export default async function TelegramAssistantAccountPage() {
  const session = await getServerSession()
  if (!session) redirect("/login?next=%2Faccount%2Ftelegram")
  const context = await getActiveTenant(session.user.id).catch(() => null)
  const store = context?.activeStore
  const sessionKey = `${session.user.id}:${session.sessionId}`

  return (
    <AccountPage
      title="Telegram assistant"
      links={
        <>
          <AccountLink href="/">Back to EwaTrade</AccountLink>
          <AccountLink href="/account/assistant-data">
            Download your assistant data
          </AccountLink>
        </>
      }
    >
      {context && store ? (
        <ConnectTelegram
          key={`${sessionKey}:${context.tenant.id}:${store.id}`}
          scope={{
            actorUserId: session.user.id,
            tenantId: context.tenant.id,
            storeId: store.id,
            businessName: context.tenant.name,
            storeName: store.name,
          }}
        />
      ) : (
        <p className="rounded-[var(--ui-radius-surface)] border border-border bg-card p-5 text-muted-foreground">
          Choose a business in EwaTrade to connect Telegram.
        </p>
      )}
      <TelegramConnections key={sessionKey} actorUserId={session.user.id} />
    </AccountPage>
  )
}
