import { AuthLink, AuthShell } from "@/components/auth/auth-shell"
import { SignOut } from "@/components/dashboard/sign-out"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "No store access — EwaTrade",
  robots: { index: false, follow: false },
}

export default function AccessUnavailablePage() {
  return (
    <AuthShell
      title="No store access"
      description="Ask your business owner to give you access to a store."
      footer={
        <p className="flex flex-wrap justify-center gap-x-4 gap-y-2">
          <AuthLink href="/account/whatsapp">WhatsApp assistant</AuthLink>
          <AuthLink href="/account/telegram">Telegram assistant</AuthLink>
        </p>
      }
    >
      <SignOut appearance="button" />
    </AuthShell>
  )
}
