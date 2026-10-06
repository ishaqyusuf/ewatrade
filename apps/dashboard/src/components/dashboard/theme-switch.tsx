"use client"

import { SelectControl } from "@ewatrade/ui"
import { ComputerIcon, Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

export function ThemeSwitch() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return <div className="h-6 w-28" />
  const icon =
    theme === "system"
      ? ComputerIcon
      : resolvedTheme === "dark"
        ? Moon02Icon
        : Sun03Icon
  return (
    <div className="relative flex w-28 items-center">
      <HugeiconsIcon
        icon={icon}
        strokeWidth={2}
        className="pointer-events-none absolute left-2 size-3.5"
      />
      <SelectControl
        aria-label="Theme"
        value={theme ?? "system"}
        onValueChange={setTheme}
        className="h-6 border-0 bg-transparent py-0.5 pl-7 pr-2 text-xs"
        options={[
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
          { value: "system", label: "System" },
        ]}
      />
    </div>
  )
}
