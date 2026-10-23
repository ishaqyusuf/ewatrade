import { redirect } from "next/navigation"

/** Keep existing shared links while requests now live in the Services workspace. */
export default async function ServiceRequestsRoutePage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") params.set(key, value)
  }
  params.set("serviceTab", "requests")
  redirect(`/services?${params}`)
}
