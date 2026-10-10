import { appLockSecondsUntil } from "@/lib/app-lock-messages"
import { useEffect, useState } from "react"

/** Whole seconds left on an App lock lockout, ticking once a second. */
export function useAppLockCountdown(lockedUntil: string | null | undefined) {
  const [seconds, setSeconds] = useState(() => appLockSecondsUntil(lockedUntil))

  useEffect(() => {
    setSeconds(appLockSecondsUntil(lockedUntil))
    if (!appLockSecondsUntil(lockedUntil)) return

    const interval = setInterval(() => {
      const next = appLockSecondsUntil(lockedUntil)
      setSeconds(next)
      if (!next) clearInterval(interval)
    }, 1000)
    return () => clearInterval(interval)
  }, [lockedUntil])

  return seconds
}
