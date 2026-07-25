"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

export type DomainSheetMode = "buy" | "connect" | "details" | "progress"

export function useDomainParams() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode = searchParams.get("domainMode") as DomainSheetMode | null
  const domainId = searchParams.get("domainId")
  const domainOrderId = searchParams.get("domainOrderId")
  const step = searchParams.get("domainStep") ?? "search"

  function setParams(
    values: {
      domainId?: string | null
      domainMode?: DomainSheetMode | null
      domainOrderId?: string | null
      domainStep?: string | null
    } | null,
  ) {
    const next = new URLSearchParams(searchParams.toString())

    if (values === null) {
      for (const key of [
        "domainId",
        "domainMode",
        "domainOrderId",
        "domainStep",
      ]) {
        next.delete(key)
      }
    } else {
      for (const [key, value] of Object.entries(values)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
    }

    const query = next.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    })
  }

  return { domainId, domainOrderId, mode, setParams, step }
}
