import {
  StockEffectiveTimeError,
  parseStockEffectiveTime,
} from "@ewatrade/assistant/general/stock-effective-time"
import { TRPCError } from "@trpc/server"

export function generalStockEffectiveTime(value: string | undefined) {
  if (value === undefined) return undefined
  try {
    return parseStockEffectiveTime(value)
  } catch (cause) {
    if (cause instanceof StockEffectiveTimeError)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: cause.message,
        cause,
      })
    throw cause
  }
}
