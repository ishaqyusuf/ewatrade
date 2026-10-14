"use client"
import {
  AssistantDraftJobHandoffProvider,
  useAssistantDraftJobHandoff,
} from "@/hooks/use-assistant-draft-job-handoff"
import { useAssistantReceipt } from "@/hooks/use-assistant-receipt"
import { useQuickChatParam } from "@/hooks/use-quick-chat-param"
import { useTRPC } from "@/trpc/client"
import { simpleTransferStep } from "@ewatrade/assistant/general/contracts"
import { simpleExpenseStep } from "@ewatrade/assistant/general/contracts"
import { simpleMoneyInStep } from "@ewatrade/assistant/general/contracts"
import {
  type GeneralProposal,
  simpleSaleStep,
} from "@ewatrade/assistant/general/contracts"
import {
  generalAnswers,
  generalPlainText,
} from "@ewatrade/assistant/general/snapshot"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from "@ewatrade/ui"
import {
  ArrowDown01Icon,
  ArrowUpRight01Icon,
  PlusSignIcon,
  SparklesIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { Fragment, type ReactNode, useEffect, useState } from "react"
import { Streamdown } from "streamdown"
import { StickToBottom } from "use-stick-to-bottom"
import { AssistantComposer } from "./assistant-composer"
import { GeneralAnswerCard } from "./general-answer-card"
import { GeneralAttachComposer } from "./general-attachment-tray"
import { GeneralSentFile } from "./general-chat-photo"
import {
  GeneralOutcomeList,
  GeneralProposalCard,
  isGeneralOutcome,
} from "./general-proposal-card"
import { GeneralProposalEditor } from "./general-proposal-editor"
import { GeneralUnavailableProposals } from "./general-unavailable-proposals"
import { placeProposals } from "./proposal-placement"
import { useGeneralAssistant } from "./use-general-assistant"
import { useQuickChatUrl } from "./use-quick-chat-url"

export type GeneralAssistantVM = ReturnType<typeof useGeneralAssistant>

/** Standard dialog frame for the assistant: padded, rounded, normal text. */
export const GENERAL_DIALOG =
  "flex max-h-[85svh] max-w-lg flex-col gap-4 rounded-lg p-6 text-foreground shadow-lg"

const suggestions = [
  "How much did we sell today?",
  "Find a product",
  "Record a sale",
  "What can you do?",
]
const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-sm leading-relaxed">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc space-y-1 pl-5 text-sm">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal space-y-1 pl-5 text-sm">{children}</ol>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  // Record names are untrusted data; never render them as links or images.
  a: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  img: () => null,
}

/** Shared state flags for the page and widget layouts. */
export function generalChatFlags(vm: GeneralAssistantVM) {
  const enabled = vm.availability.data?.enabled === true
  return {
    enabled,
    disabled:
      !enabled ||
      vm.conversations.isPending ||
      vm.state.isError ||
      vm.pending ||
      vm.busy ||
      !!vm.runId,
    exhausted: !!vm.data && generalBudgetUsed(vm.data.allowance),
    currencyCode: vm.data?.currencyCode ?? "",
  }
}

export function generalChatTitle(vm: GeneralAssistantVM) {
  if (!vm.conversationId) return "New chat"
  return (
    vm.data?.conversation.title ??
    vm.conversations.data?.find((row) => row.id === vm.conversationId)?.title ??
    "New chat"
  )
}

export type GeneralPendingReview = {
  id: string
  conversationId: string
  conversationTitle: string | null
  title: string
  summary: string
  expiresAt: string
}

/**
 * Drafts waiting for review across every saved chat. Refreshed whenever the
 * open chat's drafts change (new draft, confirm, cancel or edit).
 */
export function useGeneralPendingReviews(vm: GeneralAssistantVM) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const enabled = vm.availability.data?.enabled === true
  const query = useQuery(
    trpc.assistant.pendingProposals.queryOptions(undefined, {
      enabled,
      retry: false,
      refetchInterval: 60_000,
    }),
  )
  const signature = vm.data?.proposals
    .map((proposal) => `${proposal.id}:${proposal.status}:${proposal.revision}`)
    .join("|")
  useEffect(() => {
    if (signature === undefined) return
    void queryClient.invalidateQueries({
      queryKey: trpc.assistant.pendingProposals.queryKey(),
    })
  }, [signature, queryClient, trpc])
  return (query.data ?? []) as GeneralPendingReview[]
}

/** Opens the chat holding a draft and scrolls the draft into view. */
export function useReviewFocus(vm: GeneralAssistantVM) {
  const [focusId, setFocusId] = useState<string | null>(null)
  return {
    focusId,
    clear: () => setFocusId(null),
    review: (pending: GeneralPendingReview) => {
      if (pending.conversationId !== vm.conversationId)
        vm.choose(pending.conversationId)
      setFocusId(pending.id)
    },
  }
}

/** Messages, drafts and notices of the open chat. */
export function GeneralThread({
  vm,
  compact = false,
  focusId = null,
  onFocused,
  contentClassName,
}: {
  vm: GeneralAssistantVM
  compact?: boolean
  focusId?: string | null
  onFocused?: () => void
  /** Width of the message column, e.g. a centred reading width on the page. */
  contentClassName?: string
}) {
  const openReceipt = useAssistantReceipt()
  const [editing, setEditing] = useState<GeneralProposal | null>(null)
  const jobHandoff = useAssistantDraftJobHandoff(
    editing?.payload.action === "staff_access"
      ? JSON.stringify([vm.conversationId, editing.id, editing.revision])
      : null,
  )
  const [highlight, setHighlight] = useState<string | null>(null)
  const { enabled, disabled, exhausted, currencyCode } = generalChatFlags(vm)
  const last = vm.chat.messages.at(-1)
  // Cards show under the reply that drafted them; see placeProposals.
  const times = new Map(
    (vm.data?.messages ?? []).flatMap((message) =>
      message.createdAt
        ? [[message.id, new Date(message.createdAt).getTime()] as const]
        : [],
    ),
  )
  const placed = placeProposals(
    vm.chat.messages,
    times,
    (vm.data?.proposals ?? []).filter(
      (p) =>
        (p.payload.action !== "sale_record" &&
          p.payload.action !== "money_in_record" &&
          p.payload.action !== "expense_record_simple" &&
          p.payload.action !== "money_transfer_simple") ||
        p.status !== "PENDING",
    ),
  )
  // A sale gathers details across turns; its latest choices/review belong at the end.
  placed.rest.push(
    ...(vm.data?.proposals ?? []).filter(
      (p) =>
        (p.payload.action === "sale_record" ||
          p.payload.action === "money_in_record" ||
          p.payload.action === "expense_record_simple" ||
          p.payload.action === "money_transfer_simple") &&
        p.status === "PENDING",
    ),
  )
  const proposalGroup = (
    proposals: GeneralProposal[] | undefined,
    heading = false,
  ) => {
    if (!proposals?.length) return null
    const outcomes = proposals.filter(isGeneralOutcome)
    const drafts = proposals.filter((proposal) => !isGeneralOutcome(proposal))
    return (
      <div className={cn("flex flex-col gap-3", !compact && "pl-10")}>
        {outcomes.length ? (
          <GeneralOutcomeList
            heading={heading}
            proposals={outcomes}
            currencyCode={currencyCode}
            onOpenReceipt={(proposal) =>
              proposal.receipt && openReceipt(proposal.receipt)
            }
          />
        ) : null}
        {drafts.map((proposal) => (
          <div
            key={proposal.id}
            id={`general-proposal-${proposal.id}`}
            className={cn(
              "rounded-lg transition-shadow duration-700",
              highlight === proposal.id && "ring-4 ring-primary/30",
            )}
          >
            {proposal.status === "PENDING" &&
            ((proposal.payload.action === "sale_record" &&
              simpleSaleStep(proposal.payload) !== "review") ||
              (proposal.payload.action === "money_in_record" &&
                simpleMoneyInStep(proposal.payload) !== "review") ||
              (proposal.payload.action === "expense_record_simple" &&
                simpleExpenseStep(proposal.payload) !== "review") ||
              (proposal.payload.action === "money_transfer_simple" &&
                simpleTransferStep(proposal.payload) !== "review")) ? (
              <div className="flex flex-wrap gap-2">
                {proposal.choices?.map((choice) => (
                  <Button
                    key={choice.text}
                    variant="outline"
                    size="sm"
                    disabled={disabled}
                    onClick={() =>
                      void vm.send(choice.label, {
                        proposalId: proposal.id,
                        revision: proposal.revision,
                        text: choice.text,
                      })
                    }
                  >
                    {choice.label}
                  </Button>
                ))}
              </div>
            ) : (
              <GeneralProposalCard
                proposal={proposal}
                currencyCode={currencyCode}
                disabled={disabled}
                onConfirm={() => void vm.confirm(proposal)}
                onCancel={() => void vm.cancel(proposal)}
                onEdit={() => setEditing(proposal)}
                onReply={(text, choice) => void vm.send(text, choice)}
              />
            )}
          </div>
        ))}
      </div>
    )
  }
  const focused = vm.data?.proposals.some((p) => p.id === focusId)
  useEffect(() => {
    if (!focusId || !focused) return
    document
      .getElementById(`general-proposal-${focusId}`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" })
    setHighlight(focusId)
    onFocused?.()
  }, [focusId, focused, onFocused])
  useEffect(() => {
    if (!highlight) return
    const timer = setTimeout(() => setHighlight(null), 1800)
    return () => clearTimeout(timer)
  }, [highlight])

  return (
    <>
      <StickToBottom
        className="relative min-h-0 min-w-0 flex-1 overflow-y-auto"
        initial="instant"
        resize="smooth"
        role="log"
      >
        <StickToBottom.Content
          className={cn(
            "flex flex-col gap-5 py-6",
            compact ? "px-4" : "px-4 sm:px-6",
            contentClassName,
          )}
        >
          {compact && !enabled ? (
            <div className="space-y-3 text-sm">
              <output className="block">
                {vm.availability.isPending
                  ? "Connecting to your assistant…"
                  : vm.availability.isError
                    ? "Couldn't connect to your assistant."
                    : "Chat is unavailable for this workspace right now."}
              </output>
              {!vm.availability.isPending ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void vm.availability.refetch()}
                >
                  Retry connection
                </Button>
              ) : null}
            </div>
          ) : null}
          {enabled && !vm.conversationId && vm.conversations.isPending ? (
            <output className="text-sm">Loading saved chats…</output>
          ) : enabled && !vm.conversationId && vm.conversations.isError ? (
            <div role="alert" className="flex items-center gap-3 text-sm">
              <p>We couldn't load your saved chats.</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void vm.conversations.refetch()}
              >
                Retry loading chats
              </Button>
            </div>
          ) : enabled && !vm.conversationId ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-muted-foreground">
                Ask about sales, orders, products and stock, or draft a
                customer, product, sale or payment. Nothing changes until you
                confirm.
              </p>
              {compact ? (
                vm.notice ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => void vm.newThread({ preserveDraft: true })}
                  >
                    Retry connection
                  </Button>
                ) : (
                  <output className="text-xs text-muted-foreground">
                    Preparing your chat…
                  </output>
                )
              ) : (
                <Button disabled={disabled} onClick={() => void vm.newThread()}>
                  Start a chat
                </Button>
              )}
            </div>
          ) : enabled && vm.state.isPending ? (
            <output className="text-sm">Loading this chat…</output>
          ) : null}
          {vm.state.isError ? (
            <div role="alert" className="flex items-center gap-3 text-sm">
              <p>
                This chat could not load. Try again or open another saved chat.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void vm.refresh().catch(() => {})}
              >
                Try again
              </Button>
            </div>
          ) : null}
          {vm.conversationId &&
          vm.data &&
          !vm.chat.messages.length &&
          !vm.busy ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-muted-foreground">
                Ask about sales, orders, products and stock, or draft a
                customer, sale or payment. Nothing changes until you confirm.
              </p>
              <GeneralSuggestions vm={vm} />
            </div>
          ) : null}
          {vm.chat.messages.map((message) => {
            const text = generalPlainText(message.parts)
            if (message.role === "user") {
              const files = message.parts.flatMap((part) =>
                part.type === "data-setup-attachment" ? [part.data] : [],
              )
              return (
                <Fragment key={message.id}>
                  <div className="flex flex-col items-end gap-1.5">
                    {files.map((file) => (
                      <GeneralSentFile key={file.attachmentId} file={file} />
                    ))}
                    {text ? (
                      <p className="min-w-0 max-w-[85%] whitespace-pre-wrap [overflow-wrap:anywhere] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                        {text}
                      </p>
                    ) : null}
                  </div>
                  {proposalGroup(placed.after.get(message.id))}
                </Fragment>
              )
            }
            const answers = generalAnswers(message.parts)
            return (
              <Fragment key={message.id}>
                <div className="flex gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                  >
                    <HugeiconsIcon icon={SparklesIcon} className="size-3.5" />
                  </span>
                  <div className="flex min-w-0 max-w-[85%] flex-col gap-2 text-foreground/85">
                    {text ? (
                      <Streamdown
                        className="space-y-2"
                        components={markdownComponents}
                        isAnimating={vm.busy && message.id === last?.id}
                      >
                        {text}
                      </Streamdown>
                    ) : null}
                    {answers.map((answer) => (
                      <GeneralAnswerCard key={answer.id} answer={answer} />
                    ))}
                  </div>
                </div>
                {proposalGroup(placed.after.get(message.id))}
              </Fragment>
            )
          })}
          {vm.chat.status === "submitted" ? (
            <p className="animate-pulse pl-10 text-xs text-muted-foreground">
              Thinking…
            </p>
          ) : null}
          {vm.state.data?.unavailableProposals?.length ? (
            <GeneralUnavailableProposals
              rows={vm.state.data.unavailableProposals}
            />
          ) : null}
          {proposalGroup(placed.rest, true)}
          {vm.notice || vm.chat.error ? (
            <p role="alert" className="text-sm text-destructive">
              {vm.notice ??
                "Reply interrupted. Check reply status before sending again."}
            </p>
          ) : null}
          {vm.runId && !vm.busy && (vm.notice || vm.chat.error) ? (
            <Button
              size="sm"
              variant="outline"
              className="self-start"
              disabled={vm.pending}
              onClick={() => void vm.recover()}
            >
              Check reply status
            </Button>
          ) : null}
          {exhausted && vm.data ? (
            <output className="block text-sm text-amber-700 dark:text-amber-400">
              This month’s reply budget is used up. Replies resume on{" "}
              {generalBudgetResets(vm.data.allowance)}. You can still confirm,
              edit or cancel drafts.
            </output>
          ) : null}
        </StickToBottom.Content>
      </StickToBottom>
      <AssistantDraftJobHandoffProvider value={jobHandoff.api}>
        <Dialog
          open={Boolean(editing) && !jobHandoff.covering}
          disablePointerDismissal={jobHandoff.covering}
          onOpenChange={(open) => {
            if (!open && !vm.pending && !jobHandoff.covering) setEditing(null)
          }}
        >
          {editing ? (
            <DialogContent
              className={GENERAL_DIALOG}
              keepMounted={editing.payload.action === "staff_access"}
              finalFocus={jobHandoff.covering ? false : undefined}
            >
              <DialogHeader className="pr-8">
                <DialogTitle className="text-lg leading-none font-semibold">
                  Edit draft
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  Save changes, then review the updated card before confirming.
                </DialogDescription>
              </DialogHeader>
              <GeneralProposalEditor
                key={`${editing.id}:${editing.revision}`}
                proposal={editing}
                currencyCode={currencyCode}
                disabled={disabled}
                onCancel={() => setEditing(null)}
                onSave={async (payload) => {
                  if (await vm.save(editing, payload)) setEditing(null)
                }}
              />
            </DialogContent>
          ) : null}
        </Dialog>
      </AssistantDraftJobHandoffProvider>
    </>
  )
}

/** The chat box bound to the open chat. */
export function GeneralComposer({
  vm,
  footer,
}: {
  vm: GeneralAssistantVM
  footer?: ReactNode
}) {
  const { enabled, disabled, exhausted } = generalChatFlags(vm)
  const off =
    !enabled ||
    (!vm.conversationId && !vm.blank) ||
    exhausted ||
    vm.state.isError
  const availability = vm.availability.data
  // An older API only says mediaEnabled.
  const media = availability?.media ?? {
    photos: true,
    files: availability?.mediaEnabled === true,
  }
  const props = {
    hasAttachments: vm.readyAttachments.length > 0,
    value: vm.draft,
    onChange: vm.setDraft,
    onSend: () => void vm.send(),
    onStop: () => void vm.chat.stop(),
    busy: vm.busy,
    blocked: disabled,
    disabled: off,
    placeholder:
      exhausted && vm.data
        ? `Replies resume on ${generalBudgetResets(vm.data.allowance)}`
        : "Ask anything",
    label: "Ask a question or say what to record",
    voiceConversationId: enabled ? vm.conversationId : null,
    footer,
  }
  // + shows only when a sent file can be stored and read.
  return vm.conversationId && enabled && media?.files ? (
    <GeneralAttachComposer
      key={`${vm.conversationId}:${vm.attachmentTrayKey}`}
      conversationId={vm.conversationId}
      photos={media.photos}
      onReadyChange={vm.setReadyAttachments}
      initialFiles={vm.initialFiles}
      onInitialFilesConsumed={vm.consumeInitialFiles}
      {...props}
    />
  ) : (
    <AssistantComposer
      {...props}
      attach={
        vm.blank && enabled && media?.files
          ? {
              accept: media.photos
                ? "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
                : "application/pdf",
              disabled,
              onFiles: (files) => void vm.beginWithFiles(files),
              chips: null,
            }
          : undefined
      }
    />
  )
}

/** Starter questions that fill the composer. */
export function GeneralSuggestions({
  vm,
  className,
}: {
  vm: GeneralAssistantVM
  className?: string
}) {
  const { disabled } = generalChatFlags(vm)
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {suggestions.map((suggestion) => (
        <Button
          key={suggestion}
          size="sm"
          variant="outline"
          className="rounded-[999px]"
          disabled={disabled}
          onClick={() => vm.setDraft(suggestion)}
        >
          {suggestion}
        </Button>
      ))}
    </div>
  )
}

type GeneralBudget = {
  remainingRequests: number
  remainingTokens: number
  resetsAt: string
  requestLimit?: number
}

/** Replies stop when either the message count or the token budget runs out. */
export function generalBudgetUsed(budget: GeneralBudget) {
  return budget.remainingRequests <= 0 || budget.remainingTokens <= 0
}

export function generalBudgetResets(budget: GeneralBudget) {
  return new Date(budget.resetsAt).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  })
}

/** Footer line; never shows messages left once the token budget is spent. */
export function generalBudgetLine(budget: GeneralBudget) {
  const resets = generalBudgetResets(budget)
  if (generalBudgetUsed(budget)) return `Reply budget used · resets ${resets}`
  return budget.requestLimit
    ? `${budget.remainingRequests} of ${budget.requestLimit} chat messages left · resets ${resets}`
    : `${budget.remainingRequests} messages left · resets ${resets}`
}

export function allowanceLine(vm: GeneralAssistantVM) {
  return vm.data ? generalBudgetLine(vm.data.allowance) : null
}

type SavedChat = NonNullable<
  GeneralAssistantVM["conversations"]["data"]
>[number]

/** Chats with a first question, plus the open one even while it is empty. */
function savedChats(vm: GeneralAssistantVM): SavedChat[] {
  return (vm.conversations.data ?? []).filter(
    (chat) => chat.title || chat.id === vm.conversationId,
  )
}

function groupChats(chats: SavedChat[], now = new Date()) {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const week = new Date(day)
  week.setDate(day.getDate() - 6)
  const groups: [string, SavedChat[]][] = [
    ["Today", []],
    ["This week", []],
    ["Earlier", []],
  ]
  for (const chat of chats) {
    const at = new Date(chat.updatedAt)
    groups[at >= day ? 0 : at >= week ? 1 : 2]?.[1].push(chat)
  }
  return groups.filter(([, rows]) => rows.length)
}

/** Vertical saved-chat list for the assistant page. */
export function GeneralChatList({
  vm,
  pendingChats,
  onChosen,
}: {
  vm: GeneralAssistantVM
  pendingChats: Set<string>
  /** Called after a chat is opened, e.g. to close the history dialog. */
  onChosen?: () => void
}) {
  const { disabled } = generalChatFlags(vm)
  return (
    <div className="flex flex-col gap-0.5">
      {groupChats(savedChats(vm)).map(([group, chats]) => (
        <section key={group} aria-label={group}>
          <h3 className="mt-3 mb-1 px-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase first:mt-1">
            {group}
          </h3>
          <ul className="flex flex-col gap-0.5">
            {chats.map((conversation) => (
              <li key={conversation.id}>
                <button
                  type="button"
                  disabled={disabled}
                  aria-current={conversation.id === vm.conversationId}
                  onClick={() => {
                    vm.choose(conversation.id)
                    onChosen?.()
                  }}
                  className={cn(
                    "w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-60",
                    conversation.id === vm.conversationId &&
                      "bg-muted font-medium",
                  )}
                >
                  <span className="block truncate">
                    {conversation.title ?? "New chat"}
                  </span>
                  {pendingChats.has(conversation.id) ? (
                    <span className="flex items-center gap-1.5 text-xs font-normal text-amber-700 dark:text-amber-400">
                      <span className="size-1.5 rounded-full bg-current" />
                      Needs review
                    </span>
                  ) : (
                    <span className="block text-xs font-normal text-muted-foreground">
                      {new Date(conversation.updatedAt).toLocaleDateString()}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** Chat title that opens the saved-chat list (widget and small screens). */
export function GeneralChatSwitcher({
  vm,
  pendingChats,
  pageLink = false,
}: {
  vm: GeneralAssistantVM
  pendingChats: Set<string>
  pageLink?: boolean
}) {
  const { disabled } = generalChatFlags(vm)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="min-w-0 max-w-full justify-start gap-1 px-2 font-semibold"
            aria-label="Saved chats"
          />
        }
      >
        <span className="truncate">{generalChatTitle(vm)}</span>
        <HugeiconsIcon icon={ArrowDown01Icon} className="size-4 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Saved chats</DropdownMenuLabel>
          {savedChats(vm).map((conversation) => (
            <DropdownMenuItem
              key={conversation.id}
              disabled={disabled}
              onClick={() => vm.choose(conversation.id)}
              className={cn(
                "flex flex-col items-start gap-0",
                conversation.id === vm.conversationId && "font-medium",
              )}
            >
              <span className="w-full truncate">
                {conversation.title ?? "New chat"}
              </span>
              <span
                className={cn(
                  "text-xs",
                  pendingChats.has(conversation.id)
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-muted-foreground",
                )}
              >
                {pendingChats.has(conversation.id)
                  ? "Needs review"
                  : new Date(conversation.updatedAt).toLocaleDateString()}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        {pageLink ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              render={
                <Link
                  href={
                    vm.conversationId
                      ? `/assistant/c/${encodeURIComponent(vm.conversationId)}`
                      : "/assistant"
                  }
                />
              }
            >
              <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-4" />
              Open the assistant page
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Amber bar for drafts waiting in any chat (widget and small screens). */
export function GeneralReviewStrip({
  pending,
  label = "Review",
  className,
  onReview,
}: {
  pending: GeneralPendingReview[]
  label?: string
  className?: string
  onReview: () => void
}) {
  if (!pending.length) return null
  return (
    <button
      type="button"
      onClick={onReview}
      className={cn(
        "flex w-full shrink-0 items-center justify-between gap-3 border-b bg-amber-50 px-4 py-2 text-left text-xs text-amber-800 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/60",
        className,
      )}
    >
      <span>
        {pending.length} draft{pending.length > 1 ? "s" : ""} need
        {pending.length > 1 ? "" : "s"} review
      </span>
      <span className="font-semibold">{label}</span>
    </button>
  )
}

/** Quick chat in the bottom-right widget: the same chats as the assistant page. */
export function GeneralChat({
  actions,
  active = true,
}: { actions?: ReactNode; active?: boolean }) {
  const [chatId] = useQuickChatParam()
  const vm = useGeneralAssistant({
    autoStart: true,
    initialConversationId: chatId,
  })
  useQuickChatUrl(vm, active)
  const { disabled } = generalChatFlags(vm)
  const pending = useGeneralPendingReviews(vm)
  const pendingChats = new Set(pending.map((row) => row.conversationId))
  const focus = useReviewFocus(vm)
  return (
    <section
      aria-label="Assistant"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
      <header className="flex shrink-0 items-center gap-1 border-b py-1.5 pr-2 pl-3">
        <HugeiconsIcon
          icon={SparklesIcon}
          className="size-4 shrink-0 text-primary"
        />
        <div className="min-w-0 flex-1">
          <GeneralChatSwitcher vm={vm} pendingChats={pendingChats} pageLink />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="New chat"
          title="New chat"
          disabled={disabled}
          onClick={() => void vm.newThread()}
        >
          <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
        </Button>
        {actions}
      </header>
      <GeneralReviewStrip
        pending={pending}
        onReview={() => pending[0] && focus.review(pending[0])}
      />
      <GeneralThread
        vm={vm}
        compact
        focusId={focus.focusId}
        onFocused={focus.clear}
      />
      <div className="shrink-0 px-3 pt-2 pb-3">
        <GeneralComposer
          vm={vm}
          footer={
            <p
              className={cn(
                "text-center",
                vm.data &&
                  generalBudgetUsed(vm.data.allowance) &&
                  "text-amber-700 dark:text-amber-400",
              )}
            >
              {allowanceLine(vm)}
            </p>
          }
        />
      </div>
    </section>
  )
}
