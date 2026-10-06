import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

type Target =
  RouterOutputs["finance"]["bankStatements"]["resolveCorrectionSource"]["target"]
export type BankOwnedCorrectionTarget = {
  kind: "SUPPLIER" | "PURCHASE_PAYMENT"
  id: string
  ownerId: string
  supplierId: string
  entryKind: string
  amountMinor: string
  effectiveAt: Date
  description: string
  reversed: boolean
  latestEffectiveAt: Date
}

/** Preserve owning command identity, separately from the selected bank journal. */
export function bankOwnedCorrectionTarget(
  target: Target,
): BankOwnedCorrectionTarget | null {
  if (target.kind === "SUPPLIER")
    return {
      kind: "SUPPLIER",
      id: target.supplierEntryId,
      ownerId: target.supplierId,
      supplierId: target.supplierId,
      entryKind: target.entryKind,
      amountMinor: target.amountMinor,
      effectiveAt: target.effectiveAt,
      description: target.description,
      reversed: Boolean(target.reversal),
      latestEffectiveAt: target.effectiveAt,
    }
  if (
    target.kind === "PURCHASE" &&
    target.payment &&
    target.payment.id === target.paymentId
  )
    return {
      kind: "PURCHASE_PAYMENT",
      id: target.payment.id,
      ownerId: target.billId,
      supplierId: target.payment.supplierId,
      entryKind: "PURCHASE_PAYMENT",
      amountMinor: target.payment.amountMinor,
      effectiveAt: target.payment.effectiveAt,
      description: target.payment.description,
      reversed: target.payment.reversed,
      latestEffectiveAt: target.payment.latestEffectiveAt,
    }
  return null
}
