import { GreenTillAuthScreen } from "@/components/mobile/green-till/auth-screen"
import type { LoginPresentationProps } from "@/components/mobile/login/login-presentation"

export function ClassicLoginScreen({
  actions,
  children,
  footer,
  subtitle = "Use your email. We’ll send a 6-digit code.",
}: LoginPresentationProps) {
  return (
    <GreenTillAuthScreen
      eyebrow="Welcome back"
      title="Sign in to your business"
      subtitle={subtitle}
      actions={actions}
      testID="green-gate-login"
    >
      {children}
      {footer}
    </GreenTillAuthScreen>
  )
}
