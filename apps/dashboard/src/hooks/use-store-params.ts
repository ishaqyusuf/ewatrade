"use client"

import { useQueryStates } from "nuqs"
import { parseAsString, parseAsStringLiteral } from "nuqs/server"

/** Stores page sheets: `storeSheet=create` (Add store), `storeDetail=<id>`. */
export function useStoreParams() {
  const [params, setParams] = useQueryStates({
    storeSheet: parseAsStringLiteral(["create"]),
    storeDetail: parseAsString,
  })
  return {
    createOpen: params.storeSheet === "create",
    detailId: params.storeDetail,
    setCreateOpen: (open: boolean) =>
      setParams(
        { storeSheet: open ? "create" : null, storeDetail: null },
        { history: "replace", scroll: false },
      ),
    setDetailId: (storeId: string | null) =>
      setParams(
        { storeDetail: storeId, storeSheet: null },
        { history: "replace", scroll: false },
      ),
  }
}
