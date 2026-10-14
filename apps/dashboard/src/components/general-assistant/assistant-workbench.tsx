"use client"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ewatrade/ui"
import {
  Clock01Icon,
  MoreHorizontalIcon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { AssistantLinks } from "./assistant-links"
import {
  GENERAL_DIALOG,
  GeneralChatList,
  GeneralComposer,
  type GeneralPendingReview,
  GeneralSuggestions,
  GeneralThread,
  generalChatFlags,
  generalChatTitle,
  useGeneralPendingReviews,
  useReviewFocus,
} from "./general-chat"
import { useGeneralAssistant } from "./use-general-assistant"

/** Reading width shared by the welcome, the thread and the composer. */
const COLUMN = "mx-auto w-full max-w-[720px]"

/**
 * The assistant page: one focused chat. Saved chats sit on the left on very
 * large screens; below that they open from the top-right menu. Drafts,
 * product chat, setup and the allowance are quiet links under the composer.
 * The bottom-right widget is the quick version of the same chat.
 */
export function AssistantWorkbench() {
  const routeId = useParams<{ id?: string }>().id ?? null
  // `?chatId=` (the widget's chat) or the older `?chat=` handover link.
  const search = useSearchParams()
  const legacy = search.get("chatId") ?? search.get("chat")
  const routeTarget = routeId ?? legacy
  const vm = useGeneralAssistant({
    initialConversationId: routeTarget,
    blankStart: true,
  })
  const router = useRouter()
  const { enabled, disabled } = generalChatFlags(vm)
  const pending = useGeneralPendingReviews(vm)
  const pendingChats = new Set(pending.map((row) => row.conversationId))
  const focus = useReviewFocus(vm)
  const [historyOpen, setHistoryOpen] = useState(false)
  const review = (row: GeneralPendingReview) => focus.review(row)
  // A new chat is /assistant; its first message creates the conversation.
  const newChat = () => {
    setHistoryOpen(false)
    router.push("/assistant", { scroll: false })
  }

  // The URL names the open chat: /assistant is a blank new chat and
  // /assistant/c/<id> a saved one. Opening a chat moves the URL; Back/Forward
  // or a pasted link opens the chat it names.
  const shown = useRef<string | null>(routeId)
  useEffect(() => {
    const id = vm.conversationId
    if (id && id === vm.uploadStartedConversation) return
    if (id === shown.current) return
    shown.current = id
    if (!id || id === routeId) return
    const href = `/assistant/c/${encodeURIComponent(id)}`
    // A blank chat's first message (or a ?chat= link) takes over its URL.
    if (!routeId && (id === vm.startedConversationId || legacy))
      router.replace(href, { scroll: false })
    else router.push(href, { scroll: false })
  }, [
    vm.conversationId,
    vm.startedConversationId,
    vm.uploadStartedConversation,
    routeId,
    legacy,
    router,
  ])
  const routeSeen = useRef<string | null | undefined>(undefined)
  const routeWanted = useRef<{ id: string | null } | null>(null)
  useEffect(() => {
    if (routeTarget !== routeSeen.current) {
      routeSeen.current = routeTarget
      routeWanted.current = { id: routeTarget }
    }
    const wanted = routeWanted.current
    if (!wanted) return
    if (wanted.id === vm.conversationId) {
      routeWanted.current = null
      return
    }
    // A reply in progress keeps its chat; the URL's chat opens after it.
    if (vm.busy || vm.runId || vm.pending) return
    routeWanted.current = null
    shown.current = wanted.id
    if (wanted.id) vm.choose(wanted.id)
    else vm.clearThread()
  }, [
    routeTarget,
    vm.conversationId,
    vm.busy,
    vm.runId,
    vm.pending,
    vm.choose,
    vm.clearThread,
  ])

  // A loaded chat with nothing in it yet opens on the welcome, composer first.
  const fresh =
    enabled &&
    (vm.blank ||
      !!vm.uploadStartedConversation ||
      (!!vm.conversationId && !!vm.data)) &&
    !vm.chat.messages.length &&
    !vm.busy
  const links = <AssistantLinks pending={pending} onReview={review} />

  return (
    // Edge to edge under the shell header, like the design: no card frame.
    // -mb-4 cancels the shell's bottom padding so only the columns scroll.
    <div className="-mx-4 -mb-4 flex flex-1 flex-col md:-mx-8">
      <h1 className="sr-only">AI assistant</h1>
      <div className="grid h-[calc(100svh-70px)] min-h-[32rem] overflow-hidden xl:grid-cols-[236px_minmax(0,1fr)]">
        <nav
          aria-label="Saved chats"
          className="hidden min-h-0 flex-col gap-2 overflow-y-auto border-r bg-muted/20 p-3 xl:flex"
        >
          <Button size="sm" disabled={!enabled || disabled} onClick={newChat}>
            <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
            New chat
          </Button>
          <GeneralChatList vm={vm} pendingChats={pendingChats} />
        </nav>
        <section
          aria-label="Assistant"
          className="flex min-h-0 min-w-0 flex-col"
        >
          <header className="flex shrink-0 items-center justify-between gap-2 px-4 py-2.5 sm:px-6">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">
                {generalChatTitle(vm)}
              </h2>
              {vm.data ? (
                <p className="truncate text-xs text-muted-foreground">
                  {[...new Set([vm.data.businessName, vm.data.storeName])].join(
                    " · ",
                  )}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {vm.chat.messages.length ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!enabled || disabled}
                  onClick={newChat}
                >
                  <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
                  New
                </Button>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="xl:hidden"
                      aria-label="Assistant menu"
                    />
                  }
                >
                  <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => setHistoryOpen(true)}>
                    <HugeiconsIcon icon={Clock01Icon} className="size-4" />
                    Chat history
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!enabled || disabled}
                    onClick={newChat}
                  >
                    <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
                    New chat
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
            <div className="flex flex-col gap-4 p-6">
              <p className="text-sm text-muted-foreground">
                Chat isn't available for your role or this Store. You can still
                add products and continue setup.
              </p>
              {links}
            </div>
          ) : fresh ? (
            <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto px-4 pb-16 sm:px-6">
              <div className={`${COLUMN} flex flex-col gap-4`}>
                <h2 className="text-center text-2xl font-semibold tracking-tight">
                  What would you like to do?
                </h2>
                <p className="text-center text-sm text-muted-foreground">
                  Ask about sales, orders, products and stock, or tell me what
                  to record. Nothing changes until you confirm.
                </p>
                <GeneralComposer vm={vm} />
                <GeneralSuggestions vm={vm} className="justify-center" />
                {links}
              </div>
            </div>
          ) : (
            <>
              <GeneralThread
                vm={vm}
                focusId={focus.focusId}
                onFocused={focus.clear}
                contentClassName={COLUMN}
              />
              <div className="shrink-0 px-4 pb-3 sm:px-6">
                <div className={`${COLUMN} flex flex-col gap-1.5`}>
                  <GeneralComposer vm={vm} />
                  {links}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className={GENERAL_DIALOG}>
          <DialogHeader className="pr-8">
            <DialogTitle className="text-lg leading-none font-semibold">
              Chat history
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Your saved chats in this Store, newest first.
            </DialogDescription>
          </DialogHeader>
          <Button
            size="sm"
            className="self-start"
            disabled={!enabled || disabled}
            onClick={newChat}
          >
            <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
            New chat
          </Button>
          <div className="-mx-2 min-h-0 overflow-x-hidden overflow-y-auto">
            <GeneralChatList
              vm={vm}
              pendingChats={pendingChats}
              onChosen={() => setHistoryOpen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
