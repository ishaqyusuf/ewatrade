import { ledgerWhen } from "@/components/mobile/orders/orders-ledger-model"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

export type OrderChangeOptionsData = RouterOutputs["orders"]["changeOptions"]
export type OrderChangeApproval = NonNullable<
  OrderChangeOptionsData["approvals"]["return"]
>
export type OrderChangeApprovalKind = OrderChangeApproval["kind"]

const ACTION: Record<OrderChangeApprovalKind, string> = {
  return: "return items",
  refund: "give a refund",
}

/** Whether recording this return needs an Owner/Admin's approval first. */
export function returnNeedsApproval(
  options: Pick<OrderChangeOptionsData, "returnLine"> | null,
  input: { withMoney: boolean; cashBack: boolean },
) {
  if (!options) return false
  const line = options.returnLine
  return (
    line.ask ||
    (input.withMoney && line.money.ask) ||
    (input.withMoney && input.cashBack && line.cashBack.ask)
  )
}

/** The Change menu line under Return items / Refund for this person. */
export function approvalMenuMeta(
  approval: OrderChangeApproval | null,
  fallback: string,
  now = new Date(),
) {
  if (!approval) return fallback
  if (approval.status === "pending")
    return `Waiting for approval · asked ${ledgerWhen(approval.requestedAt, now)}`
  if (approval.status === "approved")
    return `Approved by ${approval.decidedBy ?? "an owner"} · record it now`
  if (approval.status === "rejected")
    return `Not approved by ${approval.decidedBy ?? "an owner"} · ask again`
  return fallback
}

export type ApprovalBanner = {
  key: string
  tone: "primary" | "success" | "destructive" | "warning"
  icon: "ShieldCheck" | "CheckCircle2" | "XCircle" | "Hourglass"
  title: string
  message: string
  actionLabel: string
  target:
    | { view: "review"; approvalId: string }
    | { view: "approval"; kind: OrderChangeApprovalKind }
}

/**
 * Banners on the order: approvers see each waiting request; the requester
 * sees their own request's state.
 */
export function orderApprovalBanners(
  options: Pick<OrderChangeOptionsData, "approvals"> | null,
): ApprovalBanner[] {
  if (!options) return []
  const banners: ApprovalBanner[] = options.approvals.pending.map(
    (approval) => ({
      key: `review:${approval.id}`,
      tone: "warning",
      icon: "Hourglass",
      title: `${approval.requestedBy ?? "A team member"} asks to ${ACTION[approval.kind]}`,
      message: `${approval.summary}. Reason: ${approval.reason}`,
      actionLabel: "Review",
      target: { view: "review", approvalId: approval.id },
    }),
  )
  for (const approval of [options.approvals.return, options.approvals.refund]) {
    if (!approval) continue
    const base = { key: `mine:${approval.id}`, message: approval.summary }
    if (approval.status === "pending")
      banners.push({
        ...base,
        tone: "primary",
        icon: "ShieldCheck",
        title: "Waiting for an owner or admin",
        actionLabel: "Open",
        target: { view: "approval", kind: approval.kind },
      })
    else if (approval.status === "approved")
      banners.push({
        ...base,
        tone: "success",
        icon: "CheckCircle2",
        title: `Approved by ${approval.decidedBy ?? "an owner"}`,
        message: `${approval.summary}. Record it before the end of today.`,
        actionLabel:
          approval.kind === "return" ? "Record return" : "Record refund",
        target: { view: "approval", kind: approval.kind },
      })
    else if (approval.status === "rejected")
      banners.push({
        ...base,
        tone: "destructive",
        icon: "XCircle",
        title: `Not approved by ${approval.decidedBy ?? "an owner"}`,
        message: approval.decisionNote
          ? `“${approval.decisionNote}” · ${approval.summary}`
          : approval.summary,
        actionLabel: "Open",
        target: { view: "approval", kind: approval.kind },
      })
  }
  return banners
}

/** Keep polling while a decision is outstanding on this order. */
export function hasOpenApproval(
  options: Pick<OrderChangeOptionsData, "approvals"> | null | undefined,
) {
  if (!options) return false
  return (
    options.approvals.pending.length > 0 ||
    options.approvals.return?.status === "pending" ||
    options.approvals.refund?.status === "pending"
  )
}
