import { AccountLink, AccountPage } from "@/components/account/account-page"
import { ConnectWhatsApp } from "@/components/assistant-whatsapp/connect-whatsapp"
import { WhatsAppConnections } from "@/components/assistant-whatsapp/whatsapp-connections"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { redirect } from "next/navigation"

export const metadata = { title: "WhatsApp assistant | EwaTrade" }

/** Personal withdrawal remains reachable without a merchant-shell membership. */
export default async function WhatsAppAssistantAccountPage() {
  const session = await getServerSession()
  if (!session) redirect("/login?next=%2Faccount%2Fwhatsapp")
  const context = await getActiveTenant(session.user.id).catch(() => null)
  const store = context?.activeStore
  return (
    <AccountPage
      title="WhatsApp assistant"
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
        <ConnectWhatsApp
          key={`${session.user.id}:${session.sessionId}:${context.tenant.id}:${store.id}`}
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
          Choose a business in EwaTrade to connect WhatsApp.
        </p>
      )}
      <WhatsAppConnections
        key={`${session.user.id}:${session.sessionId}`}
        actorUserId={session.user.id}
      />
    </AccountPage>
  )
}
