"use client"

import { useQueryStates } from "nuqs"
import { parseAsStringLiteral } from "nuqs/server"

export function useStaffParams() {
  const [params, setParams] = useQueryStates({
    staffSheet: parseAsStringLiteral(["invite"]),
  })
  return {
    inviteOpen: params.staffSheet === "invite",
    setInviteOpen: (open: boolean) =>
      setParams(
        { staffSheet: open ? "invite" : null },
        { history: "replace", scroll: false },
      ),
  }
}
