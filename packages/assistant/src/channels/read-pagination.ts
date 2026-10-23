import { z } from "zod"
import {
  type GeneralReadContinuation,
  type GeneralReadRequest,
  nextGeneralReadRequest,
  parseGeneralReadContinuation,
} from "../general/read-continuation"

export const WHATSAPP_READ_PAGE_LIFETIME_MS = 10 * 60_000
const sourceId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)
export const whatsAppReadPageCommandSchema = z
  .object({
    kind: z.literal("read_page"),
    direction: z.enum(["next", "previous"]),
    sourceOutboxId: sourceId.optional(),
    replyToMessageId: z.string().min(1).max(256),
  })
  .strict()
export type WhatsAppReadPageCommand = z.infer<
  typeof whatsAppReadPageCommandSchema
>
export const whatsAppReadPageContentSchema = z
  .object({
    type: z.literal("read_page"),
    command: whatsAppReadPageCommandSchema,
  })
  .strict()

/** No scope, cursor, tool or write is accepted from a button. */
export function parseWhatsAppReadPageIntent(input: {
  text?: string
  quickActionId?: string
  replyToMessageId?: string
}) {
  if (input.quickActionId?.startsWith("wa-read:")) {
    const match = /^wa-read:([A-Za-z0-9_-]{1,128}):(next|previous)$/.exec(
      input.quickActionId,
    )
    const result = whatsAppReadPageCommandSchema.safeParse({
      kind: "read_page",
      sourceOutboxId: match?.[1],
      direction: match?.[2],
      replyToMessageId: input.replyToMessageId,
    })
    return match && result.success
      ? result.data
      : { kind: "invalid_read_page" as const }
  }
  const direction = /^(?:next|next page|next 5|more)$/i.test(
    input.text?.trim() ?? "",
  )
    ? "next"
    : /^(?:previous|previous page|previous 5|prev)$/i.test(
          input.text?.trim() ?? "",
        )
      ? "previous"
      : undefined
  if (!direction || !input.replyToMessageId) return null
  const result = whatsAppReadPageCommandSchema.safeParse({
    kind: "read_page",
    direction,
    replyToMessageId: input.replyToMessageId,
  })
  return result.success ? result.data : { kind: "invalid_read_page" as const }
}

/** Initial native paging is only the exact selected Orders read, never a write. */
export function whatsAppOrderReadContinuation(
  parts: unknown,
): GeneralReadContinuation | undefined {
  if (!Array.isArray(parts) || parts.length > 80) return
  const candidates = parts.flatMap((part: unknown) => {
    if (
      !part ||
      typeof part !== "object" ||
      !("type" in part) ||
      part.type !== "data-general-answer" ||
      !("data" in part) ||
      !part.data ||
      typeof part.data !== "object" ||
      !("continuation" in part.data)
    )
      return []
    const candidate = parseGeneralReadContinuation(part.data.continuation)
    return candidate?.tool === "readOrders" ? [candidate] : []
  })
  return candidates.length === 1 ? candidates[0] : undefined
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => `${JSON.stringify(key)}:${stable(v)}`)
      .join(",")}}`
  return JSON.stringify(value) ?? "null"
}
export function previousWhatsAppReadRequest(
  current: GeneralReadContinuation,
  earlier: readonly GeneralReadContinuation[],
): GeneralReadRequest | undefined {
  if (current.tool !== "readOrders") return
  const currentRequest = stable({ tool: current.tool, input: current.input })
  const prior = earlier.find(
    (candidate) =>
      candidate.tool === current.tool &&
      stable(nextGeneralReadRequest(candidate)) === currentRequest,
  )
  return prior?.tool === "readOrders"
    ? { tool: prior.tool, input: prior.input }
    : undefined
}
export function whatsAppReadPageButtons(
  outboxId: string,
  continuation: GeneralReadContinuation,
  hasPrevious: boolean,
) {
  if (
    !sourceId.safeParse(outboxId).success ||
    continuation.tool !== "readOrders"
  )
    return []
  return [
    ...(continuation.nextCursor
      ? [{ id: `wa-read:${outboxId}:next`, title: "Next page" }]
      : []),
    ...(hasPrevious
      ? [{ id: `wa-read:${outboxId}:previous`, title: "Previous page" }]
      : []),
  ]
}
