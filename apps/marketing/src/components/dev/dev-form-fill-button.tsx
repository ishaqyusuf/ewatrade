"use client"

import { Button } from "@ewatrade/ui"

type DevFormFillButtonProps = {
  onFill: () => void
  label?: string
}

/**
 * Floating "Fill form" button visible only in dev mode.
 * Renders in the bottom-right corner, fixed position.
 */
export function DevFormFillButton({
  onFill,
  label = "Fill form",
}: DevFormFillButtonProps) {
  if (process.env.NODE_ENV !== "development") return null

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <button
        type="button"
        onClick={onFill}
        className="flex items-center gap-2 rounded-full border border-amber-400/60 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800 shadow-lg ring-1 ring-amber-300/40 transition-all duration-200 hover:bg-amber-100 hover:shadow-xl active:scale-95"
      >
        <span className="size-2 rounded-full bg-amber-500" />
        {label}
        <span className="rounded bg-amber-200 px-1 py-0.5 text-[10px] font-bold text-amber-700">
          DEV
        </span>
      </button>
    </div>
  )
}
