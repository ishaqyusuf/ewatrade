import { z } from "zod"
import {
  generalAnswerSchema,
  generalProposalSchema,
  generalStoredPartSchema,
} from "./contracts"
/** Platform-free GENERAL thread model shared by the dashboard and mobile. */
const textPart = z.object({
  type: z.literal("text"),
  text: z.string().max(16000),
})
export const generalSnapshotSchema = z.object({
  conversation: z.object({ id: z.string(), title: z.string().nullable() }),
  messages: z
    .array(
      z.object({
        id: z.string(),
        role: z.enum(["user", "assistant", "system"]),
        parts: z.array(generalStoredPartSchema),
        createdAt: z.coerce.date().optional(),
      }),
    )
    .max(40),
  proposals: z.array(generalProposalSchema).max(60),
  activeRunId: z.string().nullable(),
  allowance: z.object({
    remainingRequests: z.number(),
    remainingTokens: z.number(),
    resetsAt: z.string(),
  }),
  businessName: z.string(),
  storeName: z.string(),
  currencyCode: z.string(),
})
export type GeneralSnapshot = z.infer<typeof generalSnapshotSchema>
export function readGeneralSnapshot(value: unknown) {
  const parsed = generalSnapshotSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
export function generalPlainText(parts: unknown) {
  if (!Array.isArray(parts)) return ""
  return parts
    .flatMap((p) => {
      const parsed = textPart.safeParse(p)
      return parsed.success ? [parsed.data.text] : []
    })
    .join("\n")
}
export function generalAnswers(parts: unknown) {
  if (!Array.isArray(parts)) return []
  return parts.flatMap((part) => {
    if (
      !part ||
      typeof part !== "object" ||
      part.type !== "data-general-answer"
    )
      return []
    const parsed = generalAnswerSchema.safeParse(part.data)
    return parsed.success ? [parsed.data] : []
  })
}
/** Explicit projection: only text/records, never approval credentials or stream parts. */
export function generalSavedSnapshot(data: GeneralSnapshot): GeneralSnapshot {
  return {
    ...data,
    activeRunId: null,
    proposals: data.proposals.map(
      ({ approvalToken: _, ...proposal }) => proposal,
    ),
  }
}
