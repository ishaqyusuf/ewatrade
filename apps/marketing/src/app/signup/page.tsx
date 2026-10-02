import { SignupFlow } from "@/components/signup/signup-flow"
import { redirect } from "next/navigation"

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ access_token?: string }>
}) {
  const { access_token } = await searchParams
  if (!access_token?.trim()) redirect("/#early-access")
  return <SignupFlow />
}
