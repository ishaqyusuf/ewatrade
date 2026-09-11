import type {
  RouterInputs,
  RouterOutputs,
} from "@ewatrade/api/trpc/routers/_app"
import {
  parseExactDecimal,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"

export type CustodyBalance =
  RouterOutputs["inventory"]["balanceReport"]["rows"][number]
export type CloseoutCreateInput = RouterInputs["inventory"]["createCloseout"]
export type CloseoutContentProps = {
  attendantName?: string
  onComplete?: () => void
  presentation?: "screen" | "sheet"
}
export type CloseoutLine = {
  balance: CustodyBalance
  value: string
  declaredQuantity: string | null
  variance: string | null
  error: string | null
}
export type CloseoutReview = {
  lines: CloseoutLine[]
  reason: string
  createInput: Omit<CloseoutCreateInput, "clientOperationId" | "schemaVersion">
  businessId: string
}
export function closeoutLines(
  rows: CustodyBalance[],
  values: Record<string, string>,
): CloseoutLine[] {
  return rows.map((balance) => {
    const value = values[balance.balanceSourceId] ?? balance.onHandQuantity
    try {
      const declaredQuantity = parseExactDecimal(value, {
        maxScale: balance.inventoryUnitTransactionScale,
      })
      return {
        balance,
        value,
        declaredQuantity,
        variance: subtractExactDecimals(
          declaredQuantity,
          balance.onHandQuantity,
        ),
        error: null,
      }
    } catch {
      return {
        balance,
        value,
        declaredQuantity: null,
        variance: null,
        error:
          balance.inventoryUnitTransactionScale === 0
            ? "Enter a non-negative whole quantity."
            : `Enter a non-negative quantity with up to ${balance.inventoryUnitTransactionScale} decimal places.`,
      }
    }
  })
}
