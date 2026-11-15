import { AuthLink, AuthShell } from "@/components/auth/auth-shell"
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
  const signIn = (
    <AuthLink href="/login?next=%2Fsettings%2Fnotifications">
      Sign in to change your emails
    </AuthLink>
  )
  if (!token)
    return (
      <AuthShell
        title="Email preferences"
        description="Open the link at the bottom of any EwaTrade email."
        footer={signIn}
      />
    )
  return (
    <AuthShell
      title="Email preferences"
      description="Login codes and receipts always arrive."
      footer={signIn}
    >
      <EmailPreferencesForm
        token={token}
        unsubscribeIntent={params.unsubscribe === "1"}
      />
    </AuthShell>
  )
}
