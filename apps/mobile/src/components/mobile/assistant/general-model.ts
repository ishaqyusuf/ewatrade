import {
  type GeneralReceipt,
  generalAnswerSchema,
  generalProposalSchema,
  generalStoredPartSchema,
} from "@ewatrade/assistant/general/contracts"
import { z } from "zod"
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
const cacheSchema = z.object({
  scope: z.string(),
  savedAt: z.number(),
  data: generalSnapshotSchema,
})
export function readGeneralCache(
  raw: string | null,
  scope: string,
  now = Date.now(),
) {
  if (!raw || raw.length > 512_000) return null
  try {
    const parsed = cacheSchema.safeParse(JSON.parse(raw))
    if (
      !parsed.success ||
      parsed.data.scope !== scope ||
      now - parsed.data.savedAt > 24 * 60 * 60 * 1000 ||
      parsed.data.savedAt > now + 60_000
    )
      return null
    return { ...parsed.data, data: generalSavedSnapshot(parsed.data.data) }
  } catch {
    return null
  }
}
export function generalReceiptRoute(receipt: GeneralReceipt) {
  if (receipt.kind === "customer")
    return {
      pathname: "/customer-ledger/[customerId]" as const,
      params: { customerId: receipt.recordId },
    }
  if (receipt.kind === "product")
    return {
      pathname: "/catalog-item/[catalogItemId]" as const,
      params: { catalogItemId: receipt.recordId },
    }
  return {
    pathname: "/order/[orderId]" as const,
    params: { orderId: receipt.orderId ?? receipt.recordId },
  }
}
