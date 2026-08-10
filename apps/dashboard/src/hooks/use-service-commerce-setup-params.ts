import { useQueryState } from "nuqs"
import { createLoader, parseAsString } from "nuqs/server"

const serviceCommerceSetupParams = {
  storeId: parseAsString,
}

export function useServiceCommerceSetupParams() {
  const [storeId, setStoreId] = useQueryState(
    "storeId",
    serviceCommerceSetupParams.storeId,
  )
  return { setStoreId, storeId }
}

export const loadServiceCommerceSetupParams = createLoader(
  serviceCommerceSetupParams,
)
