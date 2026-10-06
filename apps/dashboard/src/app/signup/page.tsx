import { SignupFlow } from "@ewatrade/onboarding/components/signup/signup-flow"
import { getMarketingUrl } from "@ewatrade/onboarding/lib/signup-navigation"
import { redirect } from "next/navigation"

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ access_token?: string }>
}) {
  const { access_token } = await searchParams
  if (!access_token?.trim()) redirect(`${getMarketingUrl()}/#early-access`)
  return <SignupFlow />
}
