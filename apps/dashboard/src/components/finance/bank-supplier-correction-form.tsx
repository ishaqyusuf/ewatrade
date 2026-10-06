"use client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { FinanceBankOwnedCorrectionForm } from "./bank-owned-correction-form"
import { bankOwnedCorrectionTarget } from "./bank-owned-correction-target"
import type { FinanceBook } from "./types"
type SupplierTarget = Extract<
  RouterOutputs["finance"]["bankStatements"]["resolveCorrectionSource"]["target"],
  { kind: "SUPPLIER" }
>
export function FinanceBankSupplierCorrectionForm({
  target,
  ...props
}: {
  book: FinanceBook
  accountId: string
  entryId: string
  target: SupplierTarget
  onBack: () => void
}) {
  const original = bankOwnedCorrectionTarget(target)
  return original ? (
    <FinanceBankOwnedCorrectionForm {...props} target={original} />
  ) : (
    <p>The original supplier correction is unavailable.</p>
  )
}
