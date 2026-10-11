import type { FinanceBook, Prisma } from "../../../generated/prisma/client"
import type { ProductReturnValuationEvidence } from "./product-return-evidence"
import { FinanceError } from "./rules"

type Evidence = { book: FinanceBook; productReturn: ProductReturnValuationEvidence }
const recorded = new WeakMap<object, Evidence & { tx: Prisma.TransactionClient }>()

/** Only valuation of a consumed locked-source token may register this handoff. */
export function rememberRecordedProductReturn(result: object, tx: Prisma.TransactionClient, evidence: Evidence) {
  recorded.set(result, { tx, ...evidence })
}

/** One command, one transaction, one use; never a serialized client input. */
export function consumeRecordedProductReturn(result: object, tx: Prisma.TransactionClient, source: { tenantId: string; productReturnId: string }) {
  const saved = recorded.get(result)
  recorded.delete(result)
  if (!saved || saved.tx !== tx || saved.productReturn.id !== source.productReturnId || saved.productReturn.tenantId !== source.tenantId)
    throw new FinanceError("CONFLICT", "Recorded return evidence belongs to another transaction or return.")
  return saved
}
