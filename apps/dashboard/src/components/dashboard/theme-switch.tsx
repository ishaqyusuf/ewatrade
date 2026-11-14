"use client"

import { cn } from "@/utils"
import { ComputerIcon, Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun03Icon },
  { value: "dark", label: "Dark", icon: Moon02Icon },
  { value: "system", label: "System", icon: ComputerIcon },
] as const

/** Appearance: Light, Dark or System, as three 44px segments. */
export function ThemeSwitch() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const current = mounted ? (theme ?? "system") : null

  return (
    <fieldset
      aria-label="Appearance"
      className="m-0 grid min-w-0 grid-cols-3 gap-1 rounded-[10px] border-0 bg-muted p-1"
    >
      {OPTIONS.map((option) => {
        const checked = current === option.value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={checked}
            onClick={() => setTheme(option.value)}
            className={cn(
              "flex h-9 items-center justify-center gap-1.5 rounded-[8px] text-sm font-medium outline-none",
              checked
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <HugeiconsIcon icon={option.icon} className="size-4" />
            {option.label}
          </button>
        )
      })}
    </fieldset>
  )
}
