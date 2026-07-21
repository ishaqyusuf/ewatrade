"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

const STAFF_SHEET_PARAM = "staffSheet"

export function useStaffParams() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const inviteOpen = searchParams.get(STAFF_SHEET_PARAM) === "invite"

  function setInviteOpen(open: boolean) {
    const next = new URLSearchParams(searchParams.toString())

    if (open) next.set(STAFF_SHEET_PARAM, "invite")
    else next.delete(STAFF_SHEET_PARAM)

    const query = next.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  return { inviteOpen, setInviteOpen }
}
