"use client"
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@ewatrade/ui"
import { PlusSignIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { AssistantRail } from "./assistant-rail"
import {
  GeneralChatList,
  GeneralChatSwitcher,
  GeneralComposer,
  type GeneralPendingReview,
  GeneralReviewStrip,
  GeneralThread,
  generalChatFlags,
  generalChatTitle,
  useGeneralPendingReviews,
  useReviewFocus,
} from "./general-chat"
import { useGeneralAssistant } from "./use-general-assistant"

/**
 * The assistant page: saved chats, the open chat and a rail of what is
 * waiting (drafts to review, products, setup, allowance). The bottom-right
 * widget is the quick version of the same chat.
 */
export function AssistantWorkbench() {
  const vm = useGeneralAssistant()
  const { enabled, disabled } = generalChatFlags(vm)
  const pending = useGeneralPendingReviews(vm)
  const pendingChats = new Set(pending.map((row) => row.conversationId))
  const focus = useReviewFocus(vm)
  const [railOpen, setRailOpen] = useState(false)
  const review = (row: GeneralPendingReview) => {
    setRailOpen(false)
    focus.review(row)
  }

  // `?chat=` opens a chat handed over from the widget.
  const requested = useSearchParams().get("chat")
  const handled = useRef(false)
  const known = vm.conversations.data?.some((row) => row.id === requested)
  useEffect(() => {
    if (handled.current || !requested || !known) return
    handled.current = true
    if (vm.conversationId !== requested) vm.choose(requested)
  }, [requested, known, vm.conversationId, vm.choose])

  const rail = (
    <AssistantRail
      pending={pending}
      onReview={review}
      onLeave={() => setRailOpen(false)}
    />
  )

  return (
    <div className="flex flex-1 flex-col py-4">
      <h1 className="sr-only">AI assistant</h1>
      <div className="grid h-[calc(100svh-7.5rem)] min-h-[32rem] overflow-hidden rounded-lg border md:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_300px]">
        <nav
          aria-label="Saved chats"
          className="hidden min-h-0 flex-col gap-2 overflow-y-auto border-r bg-muted/20 p-3 md:flex"
        >
          <Button
            size="sm"
            disabled={!enabled || disabled}
            onClick={() => void vm.newThread()}
          >
            <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
            New chat
          </Button>
          <GeneralChatList vm={vm} pendingChats={pendingChats} />
        </nav>
        <section
          aria-label="Ask ẸwáTrade"
          className="flex min-h-0 min-w-0 flex-col"
        >
          <GeneralReviewStrip
            pending={pending}
            label="View"
            className="xl:hidden"
            onReview={() => setRailOpen(true)}
          />
          <header className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2.5 sm:px-6">
            <div className="min-w-0">
              <h2 className="hidden truncate text-sm font-semibold md:block">
                {generalChatTitle(vm)}
              </h2>
              <div className="-ml-2 md:hidden">
                <GeneralChatSwitcher vm={vm} pendingChats={pendingChats} />
              </div>
              {vm.data ? (
                <p className="truncate text-xs text-muted-foreground">
                  {vm.data.businessName} · {vm.data.storeName}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                className="xl:hidden"
                onClick={() => setRailOpen(true)}
              >
                {pending.length ? `Waiting (${pending.length})` : "Overview"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!enabled || disabled}
                onClick={() => void vm.newThread()}
              >
                <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
                New
              </Button>
            </div>
          </header>
          {vm.availability.isPending ? (
            <output className="p-6 text-sm">Loading your assistant…</output>
          ) : vm.availability.isError ? (
            <div className="flex items-center gap-3 p-6 text-sm">
              <p>We couldn't check the assistant.</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void vm.availability.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : !enabled ? (
            <p className="p-6 text-sm text-muted-foreground">
              Chat isn't available for your role or this Store. You can still
              add products and continue setup from the panel.
            </p>
          ) : (
            <>
              <GeneralThread
                vm={vm}
                focusId={focus.focusId}
                onFocused={focus.clear}
              />
              <div className="shrink-0 border-t px-4 pt-3 pb-3 sm:px-6">
                <GeneralComposer vm={vm} />
              </div>
            </>
          )}
        </section>
        <aside
          aria-label="Waiting on you"
          className="hidden min-h-0 overflow-y-auto border-l bg-muted/20 xl:block"
        >
          {rail}
        </aside>
      </div>
      <Sheet open={railOpen} onOpenChange={setRailOpen}>
        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-sm">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle>Waiting on you</SheetTitle>
            <SheetDescription>
              Drafts to review, products, setup and your AI allowance.
            </SheetDescription>
          </SheetHeader>
          {rail}
        </SheetContent>
      </Sheet>
    </div>
  )
}
