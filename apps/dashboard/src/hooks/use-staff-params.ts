"use client"

import { useQueryStates } from "nuqs"
import { parseAsString, parseAsStringLiteral } from "nuqs/server"

export function useStaffParams() {
  const [params, setParams] = useQueryStates({
    staffSheet: parseAsStringLiteral(["invite", "access"]),
    staffUser: parseAsString,
  })
  return {
    accessUserId: params.staffSheet === "access" ? params.staffUser : null,
    setAccessUserId: (userId: string | null) =>
      setParams(
        { staffSheet: userId ? "access" : null, staffUser: userId },
        { history: "replace", scroll: false },
      ),
    inviteOpen: params.staffSheet === "invite",
    setInviteOpen: (open: boolean) =>
      setParams(
        { staffSheet: open ? "invite" : null, staffUser: null },
        { history: "replace", scroll: false },
      ),
  }
}
