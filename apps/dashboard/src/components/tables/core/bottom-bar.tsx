"use client"

import { Button } from "@ewatrade/ui"
import { motion } from "framer-motion"
import { type ReactNode, useEffect } from "react"
import { Portal } from "./portal"

export interface BottomBarProps {
  selectedCount: number
  onDeselect: () => void
  children: ReactNode
}

// Escape belongs to these first: typing, menus, dialogs and sheets.
const ESCAPE_OWNERS =
  "input, textarea, select, [contenteditable='true'], [role='dialog'], [role='alertdialog'], [role='menu'], [role='listbox']"

/**
 * Fixed, portal-mounted selection actions that stay usable on narrow screens.
 * Inverted (foreground colour as background) so it reads as a temporary mode
 * rather than page chrome. Escape deselects when nothing else claims the key.
 */
export function BottomBar({
  selectedCount,
  onDeselect,
  children,
}: BottomBarProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return
      const target = event.target
      if (target instanceof Element && target.closest(ESCAPE_OWNERS)) return
      onDeselect()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onDeselect])

  return (
    <Portal>
      <motion.div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex h-12 justify-center px-3 sm:bottom-6 sm:px-4"
        initial={{ y: 80 }}
        animate={{ y: 0 }}
        exit={{ y: 80 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <div className="pointer-events-auto flex h-12 w-full min-w-0 max-w-[calc(100vw-1.5rem)] flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-lg bg-foreground pr-1.5 pl-4 text-background shadow-lg sm:w-auto sm:min-w-[360px] sm:flex-nowrap [&_.text-muted-foreground]:text-background/70">
          <span className="shrink-0 text-sm font-medium tabular-nums">
            {selectedCount} selected
          </span>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-keyshortcuts="Escape"
              className="text-background/75 hover:bg-background/15 hover:text-background focus-visible:ring-background/40 dark:hover:bg-background/15"
              onClick={onDeselect}
            >
              Deselect all
              <span
                aria-hidden="true"
                className="ml-1 hidden rounded border border-background/35 px-1 text-[11px] leading-4 opacity-80 sm:inline"
              >
                Esc
              </span>
            </Button>
            {children}
          </div>
        </div>
      </motion.div>
    </Portal>
  )
}
