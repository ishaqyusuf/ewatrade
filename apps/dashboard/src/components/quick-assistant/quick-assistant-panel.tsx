"use client"

import { WorkspaceError } from "@/components/dashboard/workspace-error"
import { Button, cn } from "@ewatrade/ui"
import {
  ArrowExpand01Icon,
  MinusSignIcon,
  SparklesIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { ErrorBoundary } from "next/dist/client/components/error-boundary"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { QuickAssistantContent } from "./quick-assistant-content"

export function QuickAssistantPanel({
  opened,
  onMinimize,
}: { opened: boolean; onMinimize: () => void }) {
  const panelRef = useRef<HTMLDialogElement>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!opened) return
    // Focus the panel immediately, even while capability queries are loading.
    panelRef.current?.focus()
    const onEscape = (event: KeyboardEvent) => {
      const nestedOverlay = document.querySelector(
        '[role="dialog"][data-open], [role="alertdialog"][data-open], [role="menu"][data-open], [role="dialog"][data-state="open"], [role="menu"][data-state="open"]',
      )
      if (event.key === "Escape" && !event.defaultPrevented && !nestedOverlay) {
        event.preventDefault()
        onMinimize()
      }
    }
    document.addEventListener("keydown", onEscape)
    return () => document.removeEventListener("keydown", onEscape)
  }, [opened, onMinimize])

  return createPortal(
    <dialog
      ref={panelRef}
      id="quick-assistant-panel"
      open={opened}
      hidden={!opened}
      tabIndex={-1}
      aria-label="Quick assistant"
      aria-modal="false"
      className={cn(
        "fixed top-auto left-auto right-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-40 m-0 flex h-[min(700px,calc(100dvh-86px-env(safe-area-inset-bottom)))] w-[calc(100vw-1rem)] max-w-none flex-col overflow-hidden rounded-2xl border bg-background p-0 text-foreground shadow-2xl outline-none sm:right-4 sm:bottom-4 sm:w-[min(560px,calc(100vw-2rem))]",
        expanded &&
          "sm:h-[calc(100dvh-102px)] sm:w-[min(1000px,calc(100vw-2rem))]",
        !opened && "hidden",
      )}
    >
      <header className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
        <HugeiconsIcon icon={SparklesIcon} className="size-4 text-primary" />
        <h2 className="min-w-0 flex-1 text-sm font-semibold">
          EwaTrade assistant
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={expanded ? "Restore chat size" : "Expand chat"}
          aria-pressed={expanded}
          title={expanded ? "Restore chat size" : "Expand chat"}
          onClick={() => setExpanded((value) => !value)}
        >
          <HugeiconsIcon icon={ArrowExpand01Icon} className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Minimize quick assistant"
          title="Minimize"
          onClick={onMinimize}
        >
          <HugeiconsIcon icon={MinusSignIcon} className="size-4" />
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        <ErrorBoundary errorComponent={WorkspaceError}>
          <QuickAssistantContent />
        </ErrorBoundary>
      </div>
    </dialog>,
    document.body,
  )
}
