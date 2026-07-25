"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

export function useDomainFilterParams() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const query = searchParams.get("domainQuery") ?? ""
  const statuses = (searchParams.get("domainStatuses") ?? "")
    .split(",")
    .filter(Boolean)

  function setFilters(values: {
    domainQuery?: string | null
    domainStatuses?: string[] | null
  }) {
    const next = new URLSearchParams(searchParams.toString())

    if (values.domainQuery !== undefined) {
      if (values.domainQuery) next.set("domainQuery", values.domainQuery)
      else next.delete("domainQuery")
    }
    if (values.domainStatuses !== undefined) {
      if (values.domainStatuses?.length) {
        next.set("domainStatuses", values.domainStatuses.join(","))
      } else {
        next.delete("domainStatuses")
      }
    }

    const queryString = next.toString()
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
      scroll: false,
    })
  }

  return { query, setFilters, statuses }
}
