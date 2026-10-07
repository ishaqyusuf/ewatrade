"use client"

import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useTRPC } from "@/trpc/client"
import type { SetupAssistantDataParts } from "@ewatrade/assistant/setup/messages"
import { Button, Sheet } from "@ewatrade/ui"
import { SparklesIcon, TaskDone01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { UIMessage } from "ai"
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"
import { SetupChat } from "./setup-chat"
import { SetupDraftPanel } from "./setup-draft-panel"
import type { SetupAttachmentName, SetupDraftEntity } from "./setup-format"
import type { SetupPrerequisiteState } from "./setup-prerequisites"

type SetupChatMessage = UIMessage<never, SetupAssistantDataParts>

type SetupAreaState = {
  area: string
  label: string
  status: "DONE" | "SKIPPED" | "STARTED" | "OPEN"
  records: number
}

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
  const visit = useMutation(
    trpc.setupAssistant.visit.mutationOptions({
      onSuccess: (result) => {
        if (result.appended) void refresh()
      },
    }),
  )
  const started = useRef(false)
  const visited = useRef<string | null>(null)
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

  // Chat only: a setup still waiting on the old offer step opens straight in,
  // and each new visit (not a reload; the server checks) gets a fresh welcome.
  const conversationId = conversation?.id ?? null
  const conversationStatus = conversation?.status ?? null
  useEffect(() => {
    if (!conversationId || visited.current === conversationId) return
    if (conversationStatus === "OFFERED") {
      visited.current = conversationId
      begin.mutate()
    } else if (conversationStatus === "ACTIVE") {
      visited.current = conversationId
      visit.mutate({ conversationId })
    }
  }, [conversationId, conversationStatus, begin, visit])

  // The launchpad shows while availability loads, so a disabled assistant
  // never changes the Overview; only an explicit entry waits on a skeleton.
  if (state.isPending) return requested ? <SetupSkeleton /> : fallback
  if (!data?.enabled) return fallback
  // The assistant stays reachable for every owner, not only before the
  // first Catalog item.
  if (!conversation && !requested && (hasCatalogItems || !offerSetup))
    return (
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
  const areas: SetupAreaState[] =
    "areas" in data ? (data.areas as SetupAreaState[]) : []
  if (
    conversation.status === "SKIPPED" ||
    conversation.status === "COMPLETED"
  ) {
    return (
      <>
        <ResumeBanner
          followUp={followUp}
          areas={areas}
          pending={begin.isPending}
          onResume={() => begin.mutate()}
        />
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
      attachments={
        // Optional so an older API without the field still renders.
        "attachments" in data ? (data.attachments as SetupAttachmentName[]) : []
      }
      currencyCode={data.currencyCode}
      prerequisites={data.prerequisites}
      hasAdded={(followUp?.committed ?? 0) > 0}
      pending={begin.isPending || skip.isPending || finish.isPending}
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
function resumeCopy(
  followUp?: SetupFollowUpState,
  areas: SetupAreaState[] = [],
) {
  const openAreas = areas.filter(
    (entry) => entry.status === "OPEN" || entry.status === "STARTED",
  )
  const started = areas.some((entry) => entry.status !== "OPEN")
  if (!followUp || (followUp.committed === 0 && followUp.open === 0))
    return started && openAreas.length
      ? {
          text: `Still to set up: ${openAreas.map((entry) => entry.label).join("; ")}. Nothing is compulsory.`,
          action: "Continue setup",
        }
      : {
          text: "Prefer to describe your business instead? The setup assistant can build your list for you, by chat, voice note or a photo of your price list.",
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
  areas,
  pending,
  onResume,
}: {
  followUp?: SetupFollowUpState
  areas?: SetupAreaState[]
  pending: boolean
  onResume: () => void
}) {
  const copy = resumeCopy(followUp, areas)
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
  attachments,
  currencyCode,
  prerequisites,
  hasAdded,
  pending,
  onSkip,
  onFinish,
}: {
  conversationId: string
  status: "OFFERED" | "ACTIVE"
  messages: SetupChatMessage[]
  entities: SetupDraftEntity[]
  attachments: SetupAttachmentName[]
  currencyCode: string
  prerequisites?: SetupPrerequisiteState
  /** Once records are in the business, leaving is "done for now", not a skip. */
  hasAdded: boolean
  pending: boolean
  onSkip: () => void
  onFinish: () => void
}) {
  const [listOpen, setListOpen] = useState(false)
  const count = entities.filter((entity) => entity.state !== "SKIPPED").length
  const attachmentNames = useMemo(
    () => new Map(attachments.map((attachment) => [attachment.id, attachment])),
    [attachments],
  )
  const panel = (
    <SetupDraftPanel
      conversationId={conversationId}
      entities={entities}
      attachments={attachmentNames}
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
                  disabled={pending}
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
