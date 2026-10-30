"use client"

import {
  usePageFabSlotMode,
  useQuickAssistantRequests,
} from "@/components/page-fab/fab-slot"
import { loadSheetCode } from "@/components/sheets/load-sheet-code"
import { useQuickChatParam } from "@/hooks/use-quick-chat-param"
import { Button, cn } from "@ewatrade/ui"
import { BubbleChatIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import dynamic from "next/dynamic"
import { usePathname } from "next/navigation"
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react"
import {
  QuickAssistantFrame,
  QuickAssistantMinimize,
} from "./quick-assistant-frame"

const QuickAssistantPanel = dynamic(
  () =>
    loadSheetCode(
      () =>
        import("./quick-assistant-panel").then(
          (mod) => mod.QuickAssistantPanel,
        ),
      QuickAssistantCodeFrame,
    ),
  { ssr: false },
)

/** Lost panel code recovers in the same dialog with its existing Minimize. */
function QuickAssistantCodeFrame({
  children,
  opened,
  onMinimize,
}: { children: ReactNode; opened: boolean; onMinimize: () => void }) {
  return (
    <QuickAssistantFrame opened={opened} onMinimize={onMinimize}>
      <div className="flex justify-end px-2 pt-2">
        <QuickAssistantMinimize onMinimize={onMinimize} />
      </div>
      <div className="px-4">{children}</div>
    </QuickAssistantFrame>
  )
}

/** The shell keys this owner by actor/business/Store, clearing transient chats on scope changes. */
export function QuickAssistant() {
  const [opened, setOpened] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [chatId, setChatId] = useQuickChatParam()
  const minimize = useCallback(() => {
    setOpened(false)
    // The open chat leaves the URL; reopening puts it back.
    void setChatId(null)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }, [setChatId])
  const open = useCallback(() => {
    setInitialized(true)
    setOpened(true)
  }, [])
  useQuickAssistantRequests(open)
  const pageFab = usePageFabSlotMode()
  // The assistant page is the full version of this chat.
  const pathname = usePathname()
  const onAssistantPage =
    pathname === "/assistant" || pathname.startsWith("/assistant/")
  // A link with ?chatId= opens the widget on that chat.
  const lastChatId = useRef<string | null>(null)
  useEffect(() => {
    if (chatId === lastChatId.current) return
    lastChatId.current = chatId
    if (chatId && !onAssistantPage) open()
  }, [chatId, onAssistantPage, open])
  if (onAssistantPage) return null

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
        title="Assistant"
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
