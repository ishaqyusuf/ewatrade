import type { ReactNode } from "react"

export type VerifyEmailPresentationProps = {
  authEntryHref: "/login" | "/sign-up"
  email: string
  channel?: "email" | "whatsapp"
  mode: "login" | "sign-up"
  otp: ReactNode
  resend: ReactNode
  keypad: ReactNode
}
