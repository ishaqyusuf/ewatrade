import { z } from "zod"
const id = z.string().trim().min(1).max(128)
export const purchaseRecognitionReverseAction = z
  .object({
    action: z.literal("purchase_recognition_reverse"),
    bookId: id,
    recognitionId: id,
    eventId: id,
    effectiveAt: z.iso.datetime(),
    reason: z.string().trim().min(1).max(400),
    bookkeepingOnly: z.literal(true),
  })
  .strict()
export const purchaseRecognitionReversalDraftInstructions =
  " When purchase_recognition_reverse is available, resolve the exact original agreement and purchase fact through readPurchaseRecognition. Ask whether the merchant means invoice or ownership, the correction date and reason, and require explicit bookkeepingOnly=true. Select the exact returned original eventId, never an omitted or guessed source or a reversal event. Review reverses the whole original agreed amount and accounts; do not accept replacement goods, amounts or accounts. Correct later dependent facts first. Invoice correction requires recorded payments reversed and consumed advances released first; do not do these automatically. Physical receipt correction requires a supplier return/credit source and cannot be performed by this bookkeeping action. Explain that the original agreement and costs remain in history, no money is refunded/recovered/transferred and no physical stock moves. Clarify ambiguous facts before drafting."
