import { PasswordRecoveryForm } from "@/components/auth/password-recovery-form"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Forgot password — EwaTrade",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

export default function ForgotPasswordPage() {
  return <PasswordRecoveryForm mode="request" />
}
