import { LoginForm } from "@/components/auth/login-form"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Sign in — EwaTrade",
  robots: { index: false, follow: false },
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const { next, error } = await searchParams
  const marketingUrl =
    process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://ewatrade.com"
  return (
    <LoginForm next={next} initialError={error} marketingUrl={marketingUrl} />
  )
}
