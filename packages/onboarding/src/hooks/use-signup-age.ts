"use client"

import { useEffect, useState } from "react"
import {
  type EligibleAgeBand,
  clearSignupAge,
  readSignupAge,
  saveSignupAge,
} from "../lib/signup-age"

export function useSignupAge() {
  const [ageBand, setAgeBand] = useState<EligibleAgeBand | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function restore() {
      try {
        const token =
          new URLSearchParams(window.location.search)
            .get("access_token")
            ?.trim() ?? ""
        const age = await readSignupAge(window.sessionStorage, token)
        if (!cancelled) setAgeBand(age)
      } catch {
        // Restricted storage falls back to the age question.
      } finally {
        if (!cancelled) setReady(true)
      }
    }
    void restore()
    return () => {
      cancelled = true
    }
  }, [])

  async function confirmAge(age: EligibleAgeBand) {
    try {
      const token =
        new URLSearchParams(window.location.search)
          .get("access_token")
          ?.trim() ?? ""
      await saveSignupAge(window.sessionStorage, token, age)
    } catch {
      // Keep signup usable when session storage is unavailable.
    }
    setAgeBand(age)
  }

  function clearAge() {
    try {
      clearSignupAge(window.sessionStorage)
    } catch {
      /* Storage may be unavailable. */
    }
  }

  return { ageBand, ready, confirmAge, clearAge }
}
