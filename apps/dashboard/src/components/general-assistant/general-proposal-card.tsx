"use client"
import { capabilityForAction } from "@ewatrade/assistant/capabilities/manifest"
import {
  type GeneralProposal,
  generalActionSummary,
} from "@ewatrade/assistant/general/contracts"
import { productCreatePicture } from "@ewatrade/assistant/general/product-create"
import { Badge, Button, cn } from "@ewatrade/ui"
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  Clock01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useState } from "react"
import { GeneralChatPhotoThumb } from "./general-chat-photo"
import { GeneralProductPicture } from "./general-product-picture"

const statusLabel: Record<GeneralProposal["status"], string> = {
  PENDING: "Needs your review",
  EXECUTING: "Saving",
  COMPLETED: "Done",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  FAILED: "Failed",
}

/** Saved, cancelled and failed proposals: listed, not shown as cards. */
export function isGeneralOutcome(proposal: GeneralProposal) {
  return (
    !!proposal.receipt ||
    proposal.status === "COMPLETED" ||
    proposal.status === "CANCELLED" ||
    proposal.status === "FAILED"
  )
}

function reviewLines(proposal: GeneralProposal, currencyCode: string) {
  const product =
    proposal.payload.action === "product_create" ? proposal.payload : null
  // The picture shows as an image, so its text line is not repeated.
  const picture = product ? productCreatePicture(product) : null
  return (
    proposal.review ?? [generalActionSummary(proposal.payload, currencyCode)]
  )
    .flatMap((line) => line.split("\n"))
    .filter((line) => line !== picture)
}

/** "Total: ₦4,800.00" → ["Total", "₦4,800.00"]; item lines have no label. */
function reviewPair(line: string) {
  const at = line.indexOf(": ")
  return at > 0 ? [line.slice(0, at), line.slice(at + 2)] : null
}

// Short pairs read as a label/value row; longer review copy (purchase and
// stock explanations) stays one wrapping line so nothing is squeezed.
const PAIR_LABEL_MAX = 40
const PAIR_VALUE_MAX = 40
// Long drafts (e.g. a ten-line purchase receipt) open on their first lines;
// the rest is one click away, and Edit shows everything.
const COLLAPSE_AFTER = 8
const PREVIEW_LINES = 6

/** A file going onto an order shows as the photo itself. */
function filedAttachment(proposal: GeneralProposal) {
  return proposal.payload.action === "order_attachment_add"
    ? proposal.payload.attachmentId
    : null
}

function ReviewLines({
  lines,
  folded = false,
}: {
  lines: string[]
  /** Folded previews clip each long line to two rows. */
  folded?: boolean
}) {
  return (
    <ul className="min-w-0 flex-1 space-y-1 text-sm">
      {lines.map((line, index) => {
        const pair = reviewPair(line)
        const [label = "", value = ""] = pair ?? []
        const total = !!pair && /^total\b/i.test(label)
        const row =
          !!pair &&
          label.length <= PAIR_LABEL_MAX &&
          value.length <= PAIR_VALUE_MAX
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: review lines have no ids
          <li
            key={index}
            className={folded && !row ? "line-clamp-2" : undefined}
          >
            {row ? (
              <span
                className={cn(
                  "flex justify-between gap-4",
                  total && "font-semibold",
                )}
              >
                <span
                  className={cn("min-w-0", !total && "text-muted-foreground")}
                >
                  {label}
                </span>
                <span className="max-w-[60%] text-right tabular-nums">
                  {value}
                </span>
              </span>
            ) : pair ? (
              <>
                <span className="text-muted-foreground">{label}:</span> {value}
              </>
            ) : (
              line
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** A draft that still needs the owner: review, then Confirm, Edit or Cancel. */
export function GeneralProposalCard({
  proposal,
  currencyCode,
  disabled,
  onConfirm,
  onCancel,
  onEdit,
}: {
  proposal: GeneralProposal
  currencyCode: string
  disabled: boolean
  onConfirm: () => void
  onCancel: () => void
  onEdit: () => void
}) {
  const title = capabilityForAction(proposal.payload.action).title
  const filed = filedAttachment(proposal)
  const product =
    proposal.payload.action === "product_create" ? proposal.payload : null
  const lines = reviewLines(proposal, currencyCode)
  const [showAll, setShowAll] = useState(false)
  const long = lines.length > COLLAPSE_AFTER
  const lapsed = new Date(proposal.expiresAt).getTime() <= Date.now()
  const pending = proposal.status === "PENDING" && !lapsed
  // Expired drafts stay editable; saving issues a fresh approval.
  const renewable =
    proposal.status === "EXPIRED" || (proposal.status === "PENDING" && lapsed)
  return (
    <section
      aria-label={title}
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-lg border border-l-[3px] bg-card px-4 py-3 [overflow-wrap:anywhere]",
        renewable ? "border-l-amber-500" : "border-l-primary",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {renewable ? (
          <Badge
            variant="outline"
            className="border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400"
          >
            <HugeiconsIcon icon={Clock01Icon} />
            {statusLabel.EXPIRED}
          </Badge>
        ) : (
          <Badge variant={pending ? "default" : "secondary"}>
            {statusLabel[proposal.status]}
          </Badge>
        )}
      </div>
      <div className="flex min-w-0 gap-3">
        {product ? (
          <GeneralProductPicture
            payload={product}
            onAdd={pending || renewable ? onEdit : undefined}
          />
        ) : filed ? (
          <GeneralChatPhotoThumb attachmentId={filed} />
        ) : null}
        <ReviewLines
          lines={long && !showAll ? lines.slice(0, PREVIEW_LINES) : lines}
          folded={long && !showAll}
        />
      </div>
      {long ? (
        <Button
          size="sm"
          variant="ghost"
          className="-mt-1 self-start px-2"
          aria-expanded={showAll}
          onClick={() => setShowAll((value) => !value)}
        >
          {showAll ? "Show fewer lines" : `Show all ${lines.length} lines`}
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            className={cn(
              "size-3.5 transition-transform",
              showAll && "rotate-180",
            )}
          />
        </Button>
      ) : null}
      {pending || renewable ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex flex-wrap gap-2">
            {pending ? (
              <Button
                size="sm"
                disabled={disabled || !proposal.approvalToken}
                onClick={onConfirm}
              >
                Confirm
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={onEdit}
            >
              {pending ? "Edit" : "Edit and review again"}
            </Button>
            {pending ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={onCancel}
              >
                Cancel draft
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {pending
              ? `Nothing changes until you confirm · expires ${new Date(
                  proposal.expiresAt,
                ).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : "Approval expired. Edit to review a fresh draft."}
          </p>
        </div>
      ) : null}
    </section>
  )
}

/** Saved, cancelled and failed drafts of this chat as one compact list. */
export function GeneralOutcomeList({
  proposals,
  currencyCode,
  onOpenReceipt,
}: {
  proposals: GeneralProposal[]
  currencyCode: string
  onOpenReceipt: (proposal: GeneralProposal) => void
}) {
  const [shown, setShown] = useState<ReadonlySet<string>>(new Set())
  const saved = proposals.filter(
    (proposal) => proposal.receipt || proposal.status === "COMPLETED",
  ).length
  const cancelled = proposals.filter(
    (proposal) => !proposal.receipt && proposal.status === "CANCELLED",
  ).length
  const failed = proposals.length - saved - cancelled
  const toggle = (id: string) =>
    setShown((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  return (
    <section
      aria-label="Results in this chat"
      className="min-w-0 overflow-hidden rounded-lg border [overflow-wrap:anywhere]"
    >
      <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
        <span>In this chat</span>
        <span>
          {[
            saved ? `${saved} saved` : null,
            cancelled ? `${cancelled} cancelled` : null,
            failed ? `${failed} failed` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      <ul className="divide-y">
        {proposals.map((proposal) => {
          const { receipt } = proposal
          if (receipt) {
            const filed = filedAttachment(proposal)
            return (
              <li
                key={proposal.id}
                id={`general-proposal-${proposal.id}`}
                className="flex min-h-11 items-center gap-3 py-2 pr-2 pl-4"
              >
                <span
                  role="img"
                  aria-label="Done"
                  className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                >
                  <HugeiconsIcon icon={Tick02Icon} className="size-3" />
                </span>
                {filed ? (
                  <GeneralChatPhotoThumb
                    attachmentId={filed}
                    className="size-8"
                  />
                ) : null}
                <p className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium">{receipt.title}</span>
                  <span className="text-muted-foreground">
                    {receipt.detail}
                  </span>
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Open ${receipt.title}`}
                  onClick={() => onOpenReceipt(proposal)}
                >
                  Open
                  <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" />
                </Button>
              </li>
            )
          }
          const title = capabilityForAction(proposal.payload.action).title
          const lines = reviewLines(proposal, currencyCode)
          const summary =
            lines.find((line) => /^total\b/i.test(line)) ?? lines[0]
          const open = shown.has(proposal.id)
          const status = statusLabel[proposal.status]
          const done = proposal.status === "COMPLETED"
          return (
            <li key={proposal.id} id={`general-proposal-${proposal.id}`}>
              <div className="flex min-h-11 items-center gap-3 py-2 pr-2 pl-4">
                <span
                  role="img"
                  aria-label={status}
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full",
                    done
                      ? "bg-primary/10 text-primary"
                      : proposal.status === "FAILED"
                        ? "bg-muted text-destructive"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  <HugeiconsIcon
                    icon={done ? Tick02Icon : Cancel01Icon}
                    className="size-3"
                  />
                </span>
                <p className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 text-sm text-muted-foreground">
                  <span className={cn(done && "font-medium text-foreground")}>
                    {title}
                  </span>
                  <span>
                    {status}
                    {summary ? ` · ${summary}` : null}
                  </span>
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-expanded={open}
                  onClick={() => toggle(proposal.id)}
                >
                  {open ? "Hide" : "Details"}
                </Button>
              </div>
              {open ? (
                <ul className="space-y-0.5 pr-4 pb-3 pl-12 text-xs text-muted-foreground">
                  {lines.map((line, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: review lines have no ids
                    <li key={index}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
