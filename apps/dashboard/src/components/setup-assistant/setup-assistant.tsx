"use client"

import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useTRPC } from "@/trpc/client"
import type { SetupAssistantDataParts } from "@ewatrade/assistant/setup/messages"
import { Button, Sheet } from "@ewatrade/ui"
import { SparklesIcon, TaskDone01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { UIMessage } from "ai"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { SetupChat } from "./setup-chat"
import { SetupDraftPanel } from "./setup-draft-panel"
import type { SetupDraftEntity } from "./setup-format"
import type { SetupPrerequisiteState } from "./setup-prerequisites"

type SetupChatMessage = UIMessage<never, SetupAssistantDataParts>

type SetupFollowUpState = {
  open: number
  needsDetails: number
  readyToConfirm: number
  waitingToAdd: number
  failed: number
  committed: number
  balancesPending: number
}

/**
 * Post-onboarding entry. The API decides availability (flag, role, Store);
 * whenever the assistant is unavailable or skipped, the ordinary launchpad shows.
 */
export function SetupAssistant({
  hasCatalogItems,
  requested,
  offerSetup,
  fallback,
}: {
  hasCatalogItems: boolean
  /** Explicit `?setup=assistant` entry, e.g. after adding a first item by hand. */
  requested: boolean
  /**
   * Whether to offer a setup that has not started yet (the launchpad still has
   * steps). Setups already started always show their progress.
   */
  offerSetup: boolean
  fallback: ReactNode
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const state = useQuery(trpc.setupAssistant.state.queryOptions())
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.setupAssistant.state.queryKey(),
    })
  const start = useMutation(
    trpc.setupAssistant.start.mutationOptions({ onSuccess: refresh }),
  )
  const begin = useMutation(
    trpc.setupAssistant.begin.mutationOptions({ onSuccess: refresh }),
  )
  const skip = useMutation(
    trpc.setupAssistant.skip.mutationOptions({ onSuccess: refresh }),
  )
  const finish = useMutation(
    trpc.setupAssistant.finish.mutationOptions({ onSuccess: refresh }),
  )
  const started = useRef(false)
  const data = state.data
  const conversation = data?.enabled ? data.conversation : null
  const shouldStart =
    data?.enabled === true &&
    !data.conversation &&
    ((!hasCatalogItems && offerSetup) || requested)

  useEffect(() => {
    if (!shouldStart || started.current) return
    started.current = true
    start.mutate()
  }, [shouldStart, start])

  // The launchpad shows while availability loads, so a disabled assistant
  // never changes the Overview; only an explicit entry waits on a skeleton.
  if (state.isPending) return requested ? <SetupSkeleton /> : fallback
  if (!data?.enabled) return fallback
  if (!conversation && !requested && (hasCatalogItems || !offerSetup))
    return !offerSetup ? (
      fallback
    ) : (
      <>
        <ResumeBanner
          pending={start.isPending}
          onResume={() => start.mutate()}
        />
        {fallback}
      </>
    )
  if (!conversation) return <SetupSkeleton />
  // Optional so an older API without the field still shows the banner.
  const followUp: SetupFollowUpState | undefined =
    "followUp" in data ? data.followUp : undefined
  if (
    conversation.status === "SKIPPED" ||
    conversation.status === "COMPLETED"
  ) {
    const unfinished =
      (followUp?.open ?? 0) > 0 || (followUp?.balancesPending ?? 0) > 0
    return (
      <>
        {(conversation.status === "SKIPPED" && offerSetup) ||
        unfinished ||
        requested ? (
          <ResumeBanner
            followUp={followUp}
            pending={begin.isPending}
            onResume={() => begin.mutate()}
          />
        ) : null}
        {fallback}
      </>
    )
  }
  if (conversation.status !== "OFFERED" && conversation.status !== "ACTIVE")
    return fallback

  return (
    <SetupWorkspace
      conversationId={conversation.id}
      status={conversation.status}
      messages={data.messages as unknown as SetupChatMessage[]}
      entities={(data.draft?.entities ?? []) as SetupDraftEntity[]}
      currencyCode={data.currencyCode}
      prerequisites={data.prerequisites}
      hasAdded={(followUp?.committed ?? 0) > 0}
      offerPending={begin.isPending || skip.isPending || finish.isPending}
      onBegin={() => begin.mutate()}
      onSkip={() => skip.mutate()}
      onFinish={() => finish.mutate()}
    />
  )
}

function SetupSkeleton() {
  return (
    <output
      aria-label="Loading the setup assistant"
      className="block h-[min(640px,calc(100dvh-12rem))] animate-pulse rounded-xl border border-border bg-muted/30"
    />
  )
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`
}

/** What the launchpad says about an unfinished or finished setup. */
function resumeCopy(followUp?: SetupFollowUpState) {
  if (!followUp || (followUp.committed === 0 && followUp.open === 0))
    return {
      text: "Prefer to describe your business instead? The setup assistant can build your list for you.",
      action: "Set up with AI",
    }
  const notes: string[] = []
  if (followUp.needsDetails)
    notes.push(`${plural(followUp.needsDetails, "record")} still need details`)
  const ready = followUp.readyToConfirm + followUp.waitingToAdd
  if (ready) notes.push(`${plural(ready, "record")} ready to add`)
  if (followUp.failed) notes.push(`${plural(followUp.failed, "record")} to fix`)
  if (followUp.balancesPending)
    notes.push(
      `${plural(followUp.balancesPending, "customer balance")} waiting to be recorded`,
    )
  return notes.length
    ? {
        text: `Your setup list has ${notes.join(", ")}.`,
        action: "Continue setup",
      }
    : {
        text: "Want to add more products, services or customers? The setup assistant can help.",
        action: "Add more with AI",
      }
}

function ResumeBanner({
  followUp,
  pending,
  onResume,
}: {
  followUp?: SetupFollowUpState
  pending: boolean
  onResume: () => void
}) {
  const copy = resumeCopy(followUp)
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-4 py-3">
      <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
        <HugeiconsIcon icon={SparklesIcon} className="size-4" />
      </span>
      <p className="min-w-0 flex-1 text-sm text-muted-foreground">
        {copy.text}
      </p>
      <Button type="button" size="sm" disabled={pending} onClick={onResume}>
        {copy.action}
      </Button>
    </div>
  )
}

function SetupWorkspace({
  conversationId,
  status,
  messages,
  entities,
  currencyCode,
  prerequisites,
  hasAdded,
  offerPending,
  onBegin,
  onSkip,
  onFinish,
}: {
  conversationId: string
  status: "OFFERED" | "ACTIVE"
  messages: SetupChatMessage[]
  entities: SetupDraftEntity[]
  currencyCode: string
  prerequisites?: SetupPrerequisiteState
  /** Once records are in the business, leaving is "done for now", not a skip. */
  hasAdded: boolean
  offerPending: boolean
  onBegin: () => void
  onSkip: () => void
  onFinish: () => void
}) {
  const [listOpen, setListOpen] = useState(false)
  const count = entities.filter((entity) => entity.state !== "SKIPPED").length
  const panel = (
    <SetupDraftPanel
      conversationId={conversationId}
      entities={entities}
      currencyCode={currencyCode}
      prerequisites={prerequisites}
    />
  )

  return (
    <section
      aria-label="Setup assistant"
      className="flex h-[min(720px,calc(100dvh-11rem))] min-h-[480px] overflow-hidden rounded-xl border border-border bg-background"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1 basis-52">
            <h2 className="text-sm font-semibold text-foreground">
              Set up your business
            </h2>
            <p className="hidden text-xs text-muted-foreground sm:block">
              Describe your business in your own words, in any language.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {status === "ACTIVE" ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="lg:hidden"
                  onClick={() => setListOpen(true)}
                >
                  <HugeiconsIcon icon={TaskDone01Icon} className="size-4" />
                  Setup list{count > 0 ? ` (${count})` : ""}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={offerPending}
                  onClick={hasAdded ? onFinish : onSkip}
                >
                  {hasAdded ? "Done for now" : "Skip for now"}
                </Button>
              </>
            ) : null}
          </div>
        </header>
        <SetupChat
          conversationId={conversationId}
          status={status}
          initialMessages={messages}
          offerPending={offerPending}
          onBegin={onBegin}
          onSkip={onSkip}
        />
      </div>
      {status === "ACTIVE" ? (
        <aside
          aria-label="Setup list"
          className="hidden w-[380px] shrink-0 flex-col border-l border-border lg:flex"
        >
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">
              Setup list
            </h2>
            <p className="text-xs text-muted-foreground">
              Check and confirm each record.
            </p>
          </div>
          {panel}
        </aside>
      ) : null}
      <Sheet open={listOpen} onOpenChange={setListOpen}>
        <SheetFrame
          title="Setup list"
          description="Check and confirm each record."
          contentClassName="flex flex-col overflow-hidden px-0 pb-0"
        >
          {panel}
        </SheetFrame>
      </Sheet>
    </section>
  )
}
