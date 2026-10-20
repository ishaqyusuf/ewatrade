import { useQueryState } from "nuqs"
import { createLoader, parseAsString } from "nuqs/server"

// Which store a settings page edits; no value means every store (business-wide).
const settingsStoreParams = {
  storeId: parseAsString,
}

export function useSettingsStoreParams() {
  const [storeId, setStoreId] = useQueryState(
    "storeId",
    settingsStoreParams.storeId.withOptions({ shallow: false }),
  )
  return { setStoreId, storeId }
}

export const loadSettingsStoreParams = createLoader(settingsStoreParams)
