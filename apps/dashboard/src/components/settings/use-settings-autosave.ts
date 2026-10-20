"use client"

import { toast } from "@ewatrade/ui"
import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Switches, choices and selects on settings pages save as soon as they change.
 * `saved(key)` shows a short "Saved" mark beside that control; `confirm` adds a
 * toast, with Undo when the caller can put the old value back.
 */
export function useSettingsAutosave() {
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const confirm = useCallback(
    (key: string, message = "Saved.", undo?: () => void) => {
      setSavedKey(key)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setSavedKey(null), 2400)
      toast(
        message,
        undo ? { action: { label: "Undo", onClick: undo } } : undefined,
      )
    },
    [],
  )

  return {
    confirm,
    saved: (key: string) => savedKey === key,
  }
}
