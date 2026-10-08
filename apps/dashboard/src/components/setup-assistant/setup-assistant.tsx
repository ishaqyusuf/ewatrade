"use client"

import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useSetupAssistantParams } from "@/hooks/use-setup-assistant-params"
import { useTRPC } from "@/trpc/client"
import type { SetupAssistantDataParts } from "@ewatrade/assistant/setup/messages"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Sheet,
} from "@ewatrade/ui"
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
 * Post-onboarding entry. The API decides availability (flag, role, Store). The
 * Overview shows a banner beside the ordinary launchpad; the chat and setup list
 * open in a modal (`?setup=assistant`, also from search and the banner).
 */
export function SetupAssistant({
  hasCatalogItems,
  offerSetup,
  fallback,
}: {
  hasCatalogItems: boolean
  /**
   * Whether to offer a setup that has not started yet (the launchpad still has
   * steps). Setups already started always show their progress.
   */
  offerSetup: boolean
  fallback: ReactNode
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { setupOpen, setSetupOpen } = useSetupAssistantParams()
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
  const reopened = useRef(false)
  const visited = useRef<string | null>(null)
  const data = state.data
  const conversation = data?.enabled ? data.conversation : null
  // A business with nothing in its catalog is offered setup once, opened for
  // it; the modal can start a setup any time after that.
  const firstOffer =
    data?.enabled === true &&
    !data.conversation &&
    !hasCatalogItems &&
    offerSetup
  const shouldStart =
    data?.enabled === true && !data.conversation && (firstOffer || setupOpen)

  useEffect(() => {
    if (!shouldStart || started.current) return
    started.current = true
    start.mutate(undefined, { onSuccess: () => setSetupOpen(true) })
  }, [shouldStart, start, setSetupOpen])

  // Opening a skipped or finished setup (e.g. from search) reopens it.
  const closed =
    conversation?.status === "SKIPPED" || conversation?.status === "COMPLETED"
  useEffect(() => {
    if (!setupOpen || !closed || reopened.current) return
    reopened.current = true
    begin.mutate()
  }, [setupOpen, closed, begin])

  // Chat only: a setup still waiting on the old offer step opens straight in,
  // and each new visit (not a reload; the server checks) gets a fresh welcome
  // when the owner opens the modal.
  const conversationId = conversation?.id ?? null
  const conversationStatus = conversation?.status ?? null
  useEffect(() => {
    if (!setupOpen || !conversationId || visited.current === conversationId)
      return
    if (conversationStatus === "OFFERED") {
      visited.current = conversationId
      begin.mutate()
    } else if (conversationStatus === "ACTIVE") {
      visited.current = conversationId
      visit.mutate({ conversationId })
    }
  }, [setupOpen, conversationId, conversationStatus, begin, visit])

  // The launchpad shows while availability loads, so a disabled assistant
  // never changes the Overview.
  if (state.isPending || !data?.enabled) return fallback
  // Optional so an older API without the field stays typing-only.
  const mediaEnabled = "mediaEnabled" in data && data.mediaEnabled === true
  // Optional so an older API without the field still shows the banner.
  const followUp: SetupFollowUpState | undefined =
    "followUp" in data ? data.followUp : undefined
  const areas: SetupAreaState[] =
    "areas" in data ? (data.areas as SetupAreaState[]) : []
  const live =
    conversation?.status === "OFFERED" || conversation?.status === "ACTIVE"
      ? conversation
      : null
  const close = () => setSetupOpen(false)

  return (
    <>
      <ResumeBanner
        mediaEnabled={mediaEnabled}
        followUp={conversation ? followUp : undefined}
        areas={conversation ? areas : []}
        pending={start.isPending || begin.isPending}
        onResume={() => setSetupOpen(true)}
      />
      {fallback}
      <Dialog
        open={setupOpen}
        onOpenChange={(open) => {
          if (!open) close()
        }}
      >
        {setupOpen ? (
          <DialogContent className="flex h-[min(760px,calc(100svh-4rem))] max-w-[1120px] flex-col overflow-hidden p-0">
            {live ? (
              <SetupWorkspace
                conversationId={live.id}
                status={live.status as "OFFERED" | "ACTIVE"}
                messages={data.messages as unknown as SetupChatMessage[]}
                entities={(data.draft?.entities ?? []) as SetupDraftEntity[]}
                attachments={
                  // Optional so an older API without the field still renders.
                  "attachments" in data
                    ? (data.attachments as SetupAttachmentName[])
                    : []
                }
                currencyCode={data.currencyCode}
                prerequisites={data.prerequisites}
                mediaEnabled={mediaEnabled}
                hasAdded={(followUp?.committed ?? 0) > 0}
                pending={begin.isPending || skip.isPending || finish.isPending}
                onSkip={() => skip.mutate(undefined, { onSuccess: close })}
                onFinish={() => finish.mutate(undefined, { onSuccess: close })}
              />
            ) : (
              <SetupSkeleton />
            )}
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  )
}

function SetupSkeleton() {
  return (
    <>
      <DialogTitle className="sr-only">Set up your business</DialogTitle>
      <output
        aria-label="Loading the setup assistant"
        className="block flex-1 animate-pulse bg-muted/30"
      />
    </>
  )
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`
}

/** What the launchpad says about an unfinished or finished setup. */
function resumeCopy(
  followUp?: SetupFollowUpState,
  areas: SetupAreaState[] = [],
  mediaEnabled = false,
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
          text: mediaEnabled
            ? "Prefer to describe your business instead? The setup assistant can build your list for you, by chat, voice note or a photo of your price list."
            : "Prefer to describe your business instead? The setup assistant can build your list for you, by chat.",
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
  mediaEnabled,
  pending,
  onResume,
}: {
  followUp?: SetupFollowUpState
  areas?: SetupAreaState[]
  mediaEnabled: boolean
  pending: boolean
  onResume: () => void
}) {
  const copy = resumeCopy(followUp, areas, mediaEnabled)
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
  mediaEnabled,
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
  /** Photos, files and voice notes; when off, the owner only types. */
  mediaEnabled: boolean
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
      className="flex min-h-0 flex-1 overflow-hidden bg-background"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Room on the right for the modal's close button. */}
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border py-3 pr-14 pl-4 sm:pl-6">
          <div className="min-w-0 flex-1 basis-52">
            <DialogTitle className="text-sm font-semibold text-foreground">
              Set up your business
            </DialogTitle>
            <DialogDescription className="hidden text-xs text-muted-foreground sm:block">
              Describe your business in your own words, in any language.
            </DialogDescription>
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
          mediaEnabled={mediaEnabled}
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
