import { getDashboardLoginUrl } from "@/lib/auth-navigation"
import { redirect } from "next/navigation"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const params = await searchParams
  const url = new URL(getDashboardLoginUrl())
  if (params.next) url.searchParams.set("next", params.next)
  if (params.error) url.searchParams.set("error", params.error)
  redirect(url.toString())
}
