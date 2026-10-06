"use client"

import { useQueryStates } from "nuqs"
import { parseAsStringLiteral } from "nuqs/server"

export function useStoreParams() {
  const [params, setParams] = useQueryStates({
    storeSheet: parseAsStringLiteral(["create"]),
  })
  return {
    createOpen: params.storeSheet === "create",
    setCreateOpen: (open: boolean) =>
      setParams(
        { storeSheet: open ? "create" : null },
        { history: "replace", scroll: false },
      ),
  }
}
