import { EmailPreferencesForm } from "@/components/growth/email-preferences-form"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Email preferences — EwaTrade",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

/** No-login page from the footer of every lifecycle email (signed token). */
export default async function EmailPreferencesPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; unsubscribe?: string }>
}) {
  const params = await searchParams
  const token = typeof params.token === "string" ? params.token : ""
  return (
    <main className="mx-auto grid w-full max-w-lg gap-6 px-4 py-10">
      <div className="grid gap-1">
        <p className="text-sm font-semibold">EwaTrade</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Email preferences
        </h1>
        <p className="text-sm text-muted-foreground">
          Login codes, receipts and plan-limit notices always arrive.
        </p>
      </div>
      {token ? (
        <EmailPreferencesForm
          token={token}
          unsubscribeIntent={params.unsubscribe === "1"}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Open this page from the link in one of our emails, or sign in and go
          to Settings → Notifications.
        </p>
      )}
    </main>
  )
}
