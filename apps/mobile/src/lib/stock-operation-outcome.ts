import {
  type OperationFailure,
  classifyOperationFailure,
} from "./operation-failure"

export type StockOperationFailure = OperationFailure

/** Preserve the stock contract while sharing structured mutation classification. */
export function classifyStockOperationFailure(
  error: unknown,
  options: { previousOutcomeUnknown?: boolean } = {},
): StockOperationFailure {
  return classifyOperationFailure(error, options)
}
