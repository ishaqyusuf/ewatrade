"use client"
import { capabilityForAction } from "@ewatrade/assistant/capabilities/manifest"
import {
  type GeneralProposal,
  generalActionSummary,
} from "@ewatrade/assistant/general/contracts"
import { productCreatePicture } from "@ewatrade/assistant/general/product-create"
import { Badge, Button } from "@ewatrade/ui"
import { GeneralProductPicture } from "./general-product-picture"

const statusLabel: Record<GeneralProposal["status"], string> = {
  PENDING: "Needs your review",
  EXECUTING: "Saving",
  COMPLETED: "Done",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  FAILED: "Failed",
}

export function GeneralProposalCard({
  proposal,
  currencyCode,
  disabled,
  onConfirm,
  onCancel,
  onEdit,
  onOpenReceipt,
}: {
  proposal: GeneralProposal
  currencyCode: string
  disabled: boolean
  onConfirm: () => void
  onCancel: () => void
  onEdit: () => void
  onOpenReceipt: () => void
}) {
  const { receipt } = proposal
  const title = capabilityForAction(proposal.payload.action).title
  if (receipt)
    return (
      <section
        aria-label={receipt.title}
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium">{receipt.title}</p>
          <p className="text-sm text-muted-foreground">{receipt.detail}</p>
        </div>
        <Button size="sm" variant="outline" onClick={onOpenReceipt}>
          Open
        </Button>
      </section>
    )
  const product =
    proposal.payload.action === "product_create" ? proposal.payload : null
  // The picture shows as an image, so its text line is not repeated.
  const picture = product ? productCreatePicture(product) : null
  const lines = (
    proposal.review ?? [generalActionSummary(proposal.payload, currencyCode)]
  )
    .flatMap((line) => line.split("\n"))
    .filter((line) => line !== picture)
  const lapsed = new Date(proposal.expiresAt).getTime() <= Date.now()
  const pending = proposal.status === "PENDING" && !lapsed
  // Expired drafts stay editable; saving issues a fresh approval.
  const renewable =
    proposal.status === "EXPIRED" || (proposal.status === "PENDING" && lapsed)
  return (
    <section
      aria-label={title}
      className="flex min-w-0 flex-col gap-3 rounded-lg border px-4 py-3 [overflow-wrap:anywhere]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge variant={pending ? "default" : "secondary"}>
          {renewable ? statusLabel.EXPIRED : statusLabel[proposal.status]}
        </Badge>
      </div>
      <div className="flex min-w-0 gap-3">
        {product ? (
          <GeneralProductPicture
            payload={product}
            onAdd={pending || renewable ? onEdit : undefined}
          />
        ) : null}
        <ul className="min-w-0 flex-1 space-y-1 text-sm">
          {lines.map((line, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: review lines have no ids
            <li key={index}>{line}</li>
          ))}
        </ul>
      </div>
      {pending ? (
        <p className="text-xs text-muted-foreground">
          Nothing changes until you confirm. Expires{" "}
          {new Date(proposal.expiresAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
          .
        </p>
      ) : renewable ? (
        <p className="text-xs text-muted-foreground">
          Approval expired. Edit to review a fresh draft.
        </p>
      ) : null}
      {pending || renewable ? (
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
            Edit
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
      ) : null}
    </section>
  )
}
