import { ConnectTelegram } from "@/components/assistant-telegram/connect-telegram"
import { TelegramConnections } from "@/components/assistant-telegram/telegram-connections"
import { SignOut } from "@/components/dashboard/sign-out"
import { PageHeader } from "@/components/page-header"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import Link from "next/link"
import { redirect } from "next/navigation"

export const metadata = { title: "Telegram assistant | EwaTrade" }

export default async function TelegramAssistantAccountPage() {
  const session = await getServerSession()
  if (!session) redirect("/login?next=%2Faccount%2Ftelegram")
  const context = await getActiveTenant(session.user.id).catch(() => null)
  const store = context?.activeStore
  const sessionKey = `${session.user.id}:${session.sessionId}`

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
        title="Telegram assistant"
        description="Connect Telegram to your EwaTrade assistant and manage its business access."
      />
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
        <p className="border p-5 text-sm text-muted-foreground">
          Choose an accessible business and Store in EwaTrade to connect
          Telegram.
        </p>
      )}
      <TelegramConnections key={sessionKey} actorUserId={session.user.id} />
      <Link href="/account/assistant-data" className="text-sm underline">
        Download your assistant data
      </Link>
    </main>
  )
}
