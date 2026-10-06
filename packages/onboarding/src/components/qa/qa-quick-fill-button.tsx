"use client"

import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ewatrade/ui"
import { useState } from "react"

export type QaQuickFillOption = {
  id: string
  label: string
  onFill: () => void
  onUndo?: () => void
  canUndo?: boolean
  disabled?: boolean
}

type QaQuickFillButtonProps = {
  canUndo?: boolean
  label?: string
  onFill: () => void
  onUndo?: () => void
  qaDomain?: string | null
  visible?: boolean
  options?: QaQuickFillOption[]
}

export function QaQuickFillButton({
  canUndo,
  label = "Quick Fill",
  onFill,
  onUndo,
  qaDomain,
  visible = true,
  options,
}: QaQuickFillButtonProps) {
  const [lastTarget, setLastTarget] = useState<string | null>(null)
  const target = options?.find((option) => option.id === lastTarget)
  if (!visible) return null

  const fillButton = (
    <Button
      aria-label={`${label} using ${qaDomain ?? "the active QA Domain"}`}
      onClick={options ? undefined : onFill}
      type="button"
    >
      {label}
      <Badge variant="secondary">QA</Badge>
    </Button>
  )

  return (
    <div className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-2xl border border-primary/20 bg-background/95 p-1.5 shadow-xl backdrop-blur">
      {(options ? target?.canUndo && target.onUndo : canUndo && onUndo) ? (
        <Button
          variant="ghost"
          onClick={options ? target?.onUndo : onUndo}
          type="button"
        >
          {options ? `Undo ${target?.label}` : "Undo"}
        </Button>
      ) : null}
      {options ? (
        <DropdownMenu>
          <DropdownMenuTrigger render={fillButton} />
          <DropdownMenuContent side="top" align="end">
            <DropdownMenuGroup>
              {options.map((option) => (
                <DropdownMenuItem
                  key={option.id}
                  disabled={option.disabled}
                  onClick={() => {
                    setLastTarget(option.id)
                    option.onFill()
                  }}
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        fillButton
      )}
    </div>
  )
}
