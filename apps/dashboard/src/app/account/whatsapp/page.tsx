import { ConnectWhatsApp } from "@/components/assistant-whatsapp/connect-whatsapp"
import { WhatsAppConnections } from "@/components/assistant-whatsapp/whatsapp-connections"
import { SignOut } from "@/components/dashboard/sign-out"
import { PageHeader } from "@/components/page-header"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import Link from "next/link"
import { redirect } from "next/navigation"

export const metadata = { title: "WhatsApp assistant | EwaTrade" }

/** Personal withdrawal remains reachable without a merchant-shell membership. */
export default async function WhatsAppAssistantAccountPage() {
  const session = await getServerSession()
  if (!session) redirect("/login?next=%2Faccount%2Fwhatsapp")
  const context = await getActiveTenant(session.user.id).catch(() => null)
  const store = context?.activeStore
  return (
    <main className="mx-auto grid w-full max-w-2xl gap-8 px-4 py-8">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="text-sm underline">
          Back to EwaTrade
        </Link>
        <SignOut appearance="button" />
      </div>
      <PageHeader
        eyebrow="Your account"
        title="WhatsApp assistant"
        description="Connect your own WhatsApp to the EwaTrade assistant and manage its business access."
      />
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
        <p className="border p-5 text-sm text-muted-foreground">
          An accessible business and Store are needed to connect WhatsApp. You
          can still remove any existing access below.
        </p>
      )}
      <WhatsAppConnections
        key={`${session.user.id}:${session.sessionId}`}
        actorUserId={session.user.id}
      />
      <Link href="/account/assistant-data" className="text-sm underline">
        Download your assistant data
      </Link>
    </main>
  )
}
