"use client"

import { parseAsBoolean, useQueryStates } from "nuqs"

export const alertPreferencesParams = { alertPreferences: parseAsBoolean }

export function useAlertPreferencesParams() {
  const [{ alertPreferences }, setParams] = useQueryStates(
    alertPreferencesParams,
    { history: "push" },
  )
  return {
    isOpen: alertPreferences === true,
    open: () => setParams({ alertPreferences: true }),
    close: () => setParams({ alertPreferences: null }),
  }
}
