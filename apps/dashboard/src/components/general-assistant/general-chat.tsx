"use client"
import type {
  GeneralProposal,
  GeneralReceipt,
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
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
  cn,
} from "@ewatrade/ui"
import {
  ArrowUp02Icon,
  SparklesIcon,
  StopIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Streamdown } from "streamdown"
import { StickToBottom } from "use-stick-to-bottom"
import { GeneralProposalCard } from "./general-proposal-card"
import { GeneralProposalEditor } from "./general-proposal-editor"
import { useGeneralAssistant } from "./use-general-assistant"

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

/** Persistent everyday chat: read business facts and confirm reviewed drafts. */
export function GeneralChat() {
  const vm = useGeneralAssistant()
  const router = useRouter()
  const [editing, setEditing] = useState<GeneralProposal | null>(null)
  const disabled = vm.state.isError || vm.pending || vm.busy || !!vm.runId
  const exhausted =
    !!vm.data &&
    (vm.data.allowance.remainingRequests <= 0 ||
      vm.data.allowance.remainingTokens <= 0)
  const currencyCode = vm.data?.currencyCode ?? ""
  const openReceipt = (receipt: GeneralReceipt) => {
    // The directory has no detail route; filter it to the saved customer.
    if (receipt.kind === "customer")
      router.push(
        `/customers?customerQuery=${encodeURIComponent(receipt.detail)}`,
      )
    else if (receipt.kind === "product")
      router.push(
        `/catalog?catalogDetail=${encodeURIComponent(receipt.recordId)}`,
      )
    // Order details open as a sheet on the sales page.
    else
      router.push(
        `/sales?orderSheet=details&orderId=${encodeURIComponent(receipt.orderId ?? receipt.recordId)}`,
      )
  }
  if (vm.availability.isPending)
    return <output className="text-sm">Loading your assistant…</output>
  if (vm.availability.isError)
    return (
      <div className="flex items-center gap-3 text-sm">
        <p>We couldn't check the assistant.</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void vm.availability.refetch()}
        >
          Retry
        </Button>
      </div>
    )
  if (!vm.availability.data?.enabled) return null
  const last = vm.chat.messages.at(-1)
  return (
    <section
      aria-label="Ask ẸwáTrade"
      className="grid min-h-[34rem] overflow-hidden rounded-lg border md:h-[min(720px,calc(100svh-14rem))] md:grid-cols-[220px_minmax(0,1fr)]"
    >
      <nav
        aria-label="Saved chats"
        className="flex flex-col gap-2 border-b bg-muted/20 p-3 md:border-r md:border-b-0"
      >
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => void vm.newThread()}
        >
          New chat
        </Button>
        <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-y-auto">
          {vm.conversations.data?.map((conversation) => (
            <li key={conversation.id} className="shrink-0">
              <button
                type="button"
                disabled={disabled}
                aria-current={conversation.id === vm.conversationId}
                onClick={() => vm.choose(conversation.id)}
                className={cn(
                  "w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-60",
                  conversation.id === vm.conversationId &&
                    "bg-muted font-medium",
                )}
              >
                <span className="block truncate">
                  {conversation.title ?? "Ask ẸwáTrade"}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {new Date(conversation.updatedAt).toLocaleDateString()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex min-h-0 flex-col">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3 sm:px-6">
          <div>
            <h2 className="text-base font-semibold">Ask ẸwáTrade</h2>
            {vm.data ? (
              <p className="text-xs text-muted-foreground">
                {vm.data.businessName} · {vm.data.storeName}
              </p>
            ) : null}
          </div>
          {vm.data ? (
            <p className="text-xs text-muted-foreground">
              {vm.data.allowance.remainingRequests} requests left · resets{" "}
              {new Date(vm.data.allowance.resetsAt).toLocaleDateString()}
            </p>
          ) : null}
        </header>
        <StickToBottom
          className="relative min-h-0 flex-1 overflow-y-auto"
          initial="instant"
          resize="smooth"
          role="log"
        >
          <StickToBottom.Content className="flex flex-col gap-5 px-4 py-6 sm:px-6">
            {!vm.conversationId ? (
              <div className="flex flex-col items-start gap-3">
                <p className="text-sm text-muted-foreground">
                  Ask about sales, orders, products and stock, or draft a
                  customer, product, sale or payment. Nothing changes until you
                  confirm.
                </p>
                <Button disabled={disabled} onClick={() => void vm.newThread()}>
                  Start a chat
                </Button>
              </div>
            ) : vm.state.isPending ? (
              <output className="text-sm">Loading this chat…</output>
            ) : null}
            {vm.state.isError ? (
              <div role="alert" className="flex items-center gap-3 text-sm">
                <p>This chat could not load in your current Store.</p>
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
              <div className="flex flex-wrap gap-2">
                {suggestions.map((suggestion) => (
                  <Button
                    key={suggestion}
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => vm.setDraft(suggestion)}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            ) : null}
            {vm.chat.messages.map((message) => {
              const text = generalPlainText(message.parts)
              if (message.role === "user")
                return (
                  <div key={message.id} className="flex justify-end">
                    <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                      {text}
                    </p>
                  </div>
                )
              const answers = generalAnswers(message.parts)
              return (
                <div key={message.id} className="flex gap-3">
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
                      <div
                        key={answer.id}
                        className="rounded-lg border px-4 py-3"
                      >
                        <p className="text-xs text-muted-foreground">
                          {answer.title}
                        </p>
                        <p className="text-xl font-semibold tabular-nums">
                          {answer.value}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {answer.scope} · as of{" "}
                          {new Date(answer.asOf).toLocaleString()}
                        </p>
                        <p className="mt-2 text-sm">{answer.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
            {vm.chat.status === "submitted" ? (
              <p className="animate-pulse pl-10 text-xs text-muted-foreground">
                Thinking…
              </p>
            ) : null}
            {vm.data?.proposals.length ? (
              <div className="flex flex-col gap-3 pl-10">
                {vm.data.proposals.map((proposal) => (
                  <GeneralProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    currencyCode={currencyCode}
                    disabled={disabled}
                    onConfirm={() => void vm.confirm(proposal)}
                    onCancel={() => void vm.cancel(proposal)}
                    onEdit={() => setEditing(proposal)}
                    onOpenReceipt={() =>
                      proposal.receipt && openReceipt(proposal.receipt)
                    }
                  />
                ))}
              </div>
            ) : null}
            {exhausted ? (
              <output className="block text-sm text-muted-foreground">
                Monthly allowance used. You can still review and confirm saved
                drafts.
              </output>
            ) : null}
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
          </StickToBottom.Content>
        </StickToBottom>
        <form
          className="border-t px-4 py-3 sm:px-6"
          onSubmit={(event) => {
            event.preventDefault()
            void vm.send()
          }}
        >
          <InputGroup>
            <InputGroupTextarea
              aria-label="Ask about your business"
              placeholder="Ask about your business…"
              rows={2}
              maxLength={8000}
              value={vm.draft}
              disabled={!vm.conversationId || exhausted || vm.state.isError}
              onChange={(event) => vm.setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  void vm.send()
                }
              }}
            />
            <InputGroupAddon align="block-end" className="justify-end">
              {vm.busy ? (
                <InputGroupButton
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  aria-label="Stop"
                  onClick={() => void vm.chat.stop()}
                >
                  <HugeiconsIcon icon={StopIcon} className="size-4" />
                </InputGroupButton>
              ) : (
                <InputGroupButton
                  type="submit"
                  size="icon-sm"
                  variant="default"
                  aria-label="Send"
                  disabled={
                    disabled ||
                    exhausted ||
                    !vm.conversationId ||
                    !vm.draft.trim()
                  }
                >
                  <HugeiconsIcon icon={ArrowUp02Icon} className="size-4" />
                </InputGroupButton>
              )}
            </InputGroupAddon>
          </InputGroup>
        </form>
      </div>
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open && !vm.pending) setEditing(null)
        }}
      >
        {editing ? (
          <DialogContent className="max-w-[455px]">
            <DialogHeader className="mb-4 pr-8">
              <DialogTitle className="text-lg font-semibold">
                Edit draft
              </DialogTitle>
              <DialogDescription>
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
    </section>
  )
}
