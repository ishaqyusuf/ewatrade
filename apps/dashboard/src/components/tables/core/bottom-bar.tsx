"use client"

import { Button } from "@ewatrade/ui"
import { motion } from "framer-motion"
import type { ReactNode } from "react"
import { Portal } from "./portal"

export interface BottomBarProps {
  selectedCount: number
  onDeselect: () => void
  children: ReactNode
}

/** Fixed, portal-mounted selection actions that stay usable on narrow screens. */
export function BottomBar({
  selectedCount,
  onDeselect,
  children,
}: BottomBarProps) {
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
        <div className="pointer-events-auto relative h-12 w-full min-w-0 max-w-[calc(100vw-1.5rem)] sm:w-auto sm:min-w-[400px]">
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 backdrop-blur-lg bg-[rgba(247,247,247,0.85)] dark:bg-[rgba(19,19,19,0.7)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          />
          <div className="relative flex h-12 flex-wrap items-center justify-between gap-x-2 gap-y-1 pl-4 pr-2 sm:flex-nowrap">
            <span className="shrink-0 text-sm">{selectedCount} selected</span>
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-none text-muted-foreground"
                onClick={onDeselect}
              >
                Deselect all
              </Button>
              {children}
            </div>
          </div>
        </div>
      </motion.div>
    </Portal>
  )
}
