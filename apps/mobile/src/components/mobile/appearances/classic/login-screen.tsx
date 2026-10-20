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
      actions={actions}
      spacing="grouped"
      testID="green-gate-login"
    >
      {children}
      {footer}
    </GreenTillAuthScreen>
  )
}
