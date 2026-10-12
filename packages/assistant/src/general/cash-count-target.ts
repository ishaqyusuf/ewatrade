import { z } from "zod"
import { generalCashCountReadInput, generalDayCloseInput } from "./cash-count"
export const cashCountTargetSchema = generalCashCountReadInput
  .extend({ kind: z.literal("finance_cash_count") })
  .strict()
export const dayCloseTargetSchema = generalDayCloseInput
  .extend({ kind: z.literal("finance_day_close") })
  .strict()
export type CashCountTarget = z.infer<typeof cashCountTargetSchema>
export type DayCloseTarget = z.infer<typeof dayCloseTargetSchema>
