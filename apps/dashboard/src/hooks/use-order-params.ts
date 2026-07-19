"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

export function useOrderParams() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const query = searchParams.get("orderQuery") ?? ""
  const sheet = searchParams.get("orderSheet") === "create" ? "create" : null

  function setParams(
    values: {
      orderQuery?: string | null
      orderSheet?: "create" | null
    } | null,
  ) {
    const next = new URLSearchParams(searchParams.toString())
    if (values === null) {
      next.delete("orderSheet")
    } else {
      for (const [key, value] of Object.entries(values)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
    }
    const nextQuery = next.toString()
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
      scroll: false,
    })
  }

  return { query, setParams, sheet }
}
