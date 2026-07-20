"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

export type ServiceSheetMode =
  | "intake"
  | "job"
  | "quote"
  | "request"
  | "settings"

const MODES = new Set<ServiceSheetMode>([
  "intake",
  "job",
  "quote",
  "request",
  "settings",
])

export function useServiceWorkParams() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const sheetValue = searchParams.get("serviceSheet")
  const sheet =
    sheetValue && MODES.has(sheetValue as ServiceSheetMode)
      ? (sheetValue as ServiceSheetMode)
      : null

  function setParams(
    values: {
      jobId?: string | null
      requestId?: string | null
      serviceQuery?: string | null
      serviceSheet?: ServiceSheetMode | null
    } | null,
  ) {
    const next = new URLSearchParams(searchParams.toString())
    if (values === null) {
      next.delete("jobId")
      next.delete("requestId")
      next.delete("serviceSheet")
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

  return {
    jobId: searchParams.get("jobId"),
    query: searchParams.get("serviceQuery") ?? "",
    requestId: searchParams.get("requestId"),
    setParams,
    sheet,
  }
}
