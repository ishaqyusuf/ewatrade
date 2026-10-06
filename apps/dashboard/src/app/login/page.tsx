import { LoginForm } from "@/components/auth/login-form"
import { QaLoginEntry } from "@/components/qa/qa-login-entry"
import { isQaAcceleratorClientMode } from "@ewatrade/utils/qa-accelerator"
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
  const qaEnabled =
    process.env.QA_ACCELERATOR_ENABLED === "true" &&
    isQaAcceleratorClientMode(process.env.APP_ENV ?? process.env.NODE_ENV)
  if (qaEnabled)
    return (
      <QaLoginEntry
        next={next}
        initialError={error}
        marketingUrl={marketingUrl}
      />
    )
  return (
    <LoginForm next={next} initialError={error} marketingUrl={marketingUrl} />
  )
}
