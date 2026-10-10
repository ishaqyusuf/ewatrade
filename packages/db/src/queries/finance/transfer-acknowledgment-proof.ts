import { parseExactDecimal } from "@ewatrade/utils/exact-decimal"
import { planStockTransferTransition } from "../inventory-transfer-quantity"
import { FinanceError } from "./rules"

/** Prove one saved stage without consulting a transfer's later terminal status. */
export function proveTransferAcknowledgment(input: {
  tenantId: string
  transferId: string
  operationId: string
  actorUserId: string
  operationReason: string | null
  operationDate: Date
  dispatchedAt: Date
  dispatchedQuantity: string
  transactionScale: number
  sourceBefore: string
  sourceAfter: string
  movementQuantity: string
  acknowledgment: {
    tenantId: string
    transferId: string
    operationId: string
    acknowledgedByUserId: string
    reason: string
    effectiveAt: Date
    kind: "RECEIVE" | "CANCEL"
    quantity: string
    remainingBefore: string
    remainingAfter: string
  }
}) {
  const saved = input.acknowledgment
  const fail = (): never => {
    throw new FinanceError(
      "CONFLICT",
      "Stock transfer acknowledgment does not match its operation and transit evidence.",
    )
  }
  if (
    saved.tenantId !== input.tenantId ||
    saved.transferId !== input.transferId ||
    saved.operationId !== input.operationId ||
    saved.acknowledgedByUserId !== input.actorUserId ||
    !saved.acknowledgedByUserId.trim() ||
    !saved.reason.trim() ||
    saved.reason !== input.operationReason ||
    !Number.isFinite(saved.effectiveAt.getTime()) ||
    !Number.isFinite(input.dispatchedAt.getTime()) ||
    saved.effectiveAt.getTime() !== input.operationDate.getTime() ||
    saved.effectiveAt < input.dispatchedAt ||
    (saved.kind !== "RECEIVE" && saved.kind !== "CANCEL")
  )
    fail()
  try {
    const plan = planStockTransferTransition({
      dispatchedQuantity: input.dispatchedQuantity,
      inTransitQuantity: saved.remainingBefore,
      quantity: saved.quantity,
      transactionScale: input.transactionScale,
      transition: saved.kind === "RECEIVE" ? "receive" : "cancel",
    })
    // Normalize all observed quantities through the same exact decimal parser.
    const normalize = (value: string) =>
      parseExactDecimal(value, {
        allowZero: true,
        maxScale: input.transactionScale,
      })
    if (
      plan.remainingBefore !== normalize(input.sourceBefore) ||
      plan.remainingAfter !== normalize(input.sourceAfter) ||
      plan.remainingAfter !== normalize(saved.remainingAfter) ||
      plan.quantity !== normalize(input.movementQuantity)
    )
      fail()
    return plan
  } catch {
    return fail()
  }
}
