"use client"

import {
  usePageFabSlotMode,
  useQuickAssistantRequests,
} from "@/components/page-fab/fab-slot"
import { Button, cn } from "@ewatrade/ui"
import { BubbleChatIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import dynamic from "next/dynamic"
import { useCallback, useRef, useState } from "react"

const QuickAssistantPanel = dynamic(
  () =>
    import("./quick-assistant-panel").then((mod) => mod.QuickAssistantPanel),
  { ssr: false },
)

/** The shell keys this owner by actor/business/Store, clearing transient chats on scope changes. */
export function QuickAssistant() {
  const [opened, setOpened] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const minimize = useCallback(() => {
    setOpened(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }, [])
  const open = useCallback(() => {
    setInitialized(true)
    setOpened(true)
  }, [])
  useQuickAssistantRequests(open)
  const pageFab = usePageFabSlotMode()

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        size="icon"
        className={cn(
          "fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 size-14 rounded-[50%] shadow-lg md:right-6",
          pageFab === "replace" && "max-sm:hidden",
          // Sits 12px above a page's + button.
          pageFab === "stack" &&
            "max-sm:bottom-[calc(max(1rem,env(safe-area-inset-bottom))_+_4.25rem)]",
        )}
        aria-label="Open quick assistant"
        aria-haspopup="dialog"
        aria-expanded={opened}
        aria-controls={initialized ? "quick-assistant-panel" : undefined}
        title="Ask EwaTrade"
        onClick={() => (opened ? minimize() : open())}
      >
        <HugeiconsIcon icon={BubbleChatIcon} className="size-6" />
      </Button>
      {initialized ? (
        <QuickAssistantPanel opened={opened} onMinimize={minimize} />
      ) : null}
    </>
  )
}
