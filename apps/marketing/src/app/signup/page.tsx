import { getDashboardSignupUrl } from "@ewatrade/onboarding/lib/signup-navigation"
import { redirect } from "next/navigation"

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ access_token?: string }>
}) {
  const { access_token } = await searchParams
  redirect(getDashboardSignupUrl(access_token?.trim()))
}
