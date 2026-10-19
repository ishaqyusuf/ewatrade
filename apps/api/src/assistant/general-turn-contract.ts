import type { GeneralDataParts } from "@ewatrade/assistant/general/contracts"
import { SETUP_ATTACHMENT_PART } from "@ewatrade/assistant/setup/attachments"
import type { UIMessage, UIMessageChunk } from "ai"
import { z } from "zod"

export type GeneralUIMessage = UIMessage<never, GeneralDataParts>
export const generalTurnInputSchema = z
  .object({
    conversationId: z.string().min(1).max(128),
    requestId: z.string().min(8).max(120),
    saleChoice: z
      .object({
        proposalId: z.string().min(1).max(128),
        revision: z.number().int().positive(),
        text: z.string().min(1).max(300),
      })
      .strict()
      .optional(),
    message: z
      .object({
        id: z.string().min(1).max(80),
        role: z.literal("user"),
        parts: z
          .array(
            z.union([
              z
                .object({
                  type: z.literal("text"),
                  text: z.string().min(1).max(8000),
                })
                .strict(),
              // A photo or PDF uploaded to this chat (e.g. a receipt).
              z
                .object({
                  type: z.literal(SETUP_ATTACHMENT_PART),
                  data: z
                    .object({ attachmentId: z.string().min(1).max(64) })
                    .strict(),
                })
                .strict(),
            ]),
          )
          .min(1)
          .max(8),
      })
      .strict(),
  })
  .strict()

export type GeneralTurnInput = z.infer<typeof generalTurnInputSchema>
export class GeneralTurnError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "GeneralTurnError"
  }
}
export type GeneralTurnCompletion = {
  runId: string
  status: "COMPLETED" | "FAILED"
  persisted: boolean
  assistantMessageId: string | null
  errorCode?: string
}
export type GeneralTurn = {
  runId: string
  stream: ReadableStream<UIMessageChunk>
  /** Consume stream first. This resolves only after durable finalization was checked. */
  completion: Promise<GeneralTurnCompletion>
}
