import { LoginForm } from "@/components/auth/login-form"

export function QaLoginEntry(props: {
  next?: string
  initialError?: string
  marketingUrl: string
}) {
  return <LoginForm {...props} />
}
