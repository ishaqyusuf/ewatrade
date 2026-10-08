import { GreenTillAuthScreen } from "@/components/mobile/green-till/auth-screen"
import type { LoginPresentationProps } from "@/components/mobile/login/login-presentation"

export function ClassicLoginScreen({
  actions,
  children,
  footer,
}: LoginPresentationProps) {
  return (
    <GreenTillAuthScreen
      eyebrow="Welcome back"
      title="Sign in to your business"
      subtitle="Use your email. We’ll send a 6-digit code."
      actions={actions}
      testID="green-gate-login"
    >
      {children}
      {footer}
    </GreenTillAuthScreen>
  )
}
