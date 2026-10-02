"use client"

import { useState } from "react"

/** Keep a failed URL dismissal visible in the still-open sheet. */
export function useSheetDismissal(close: () => Promise<unknown>) {
  const [closeError, setCloseError] = useState<string | null>(null)
  async function requestClose() {
    setCloseError(null)
    try {
      await close()
    } catch (failure) {
      setCloseError(
        failure instanceof Error
          ? failure.message
          : "This sheet could not be closed. Try again.",
      )
    }
  }
  return { closeError, requestClose }
}
