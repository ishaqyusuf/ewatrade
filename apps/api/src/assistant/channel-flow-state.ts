import { createHash } from "node:crypto"
import type { WhatsAppFlowKind } from "@ewatrade/assistant/channels/flows"
import { z } from "zod"

export const NATIVE_FLOW_KIND = "whatsapp_business_flow_v1"
export const NATIVE_FLOW_TTL_MS = 15 * 60_000
export const nativeFlowDigest = (token: string) =>
  createHash("sha256").update(token).digest("hex")
export const nativeFlowCommand = (
  text: string | undefined,
): Exclude<WhatsAppFlowKind, "registration"> | null => {
  switch (text?.trim().toLowerCase()) {
    case "record sale":
    case "sale form":
      return "sale"
    case "add customer":
    case "customer form":
      return "customer"
    case "add product":
    case "product form":
      return "product"
    case "record expense":
    case "expense form":
      return "expense"
    case "receive stock":
    case "stock form":
      return "stock_receive"
    default:
      return null
  }
}
export const nativeFlowReturnSchema = z
  .object({
    type: z.literal("native_flow"),
    tokenDigest: z.string().regex(/^[a-f0-9]{64}$/),
    data: z.record(z.string(), z.unknown()),
  })
  .strict()
export const nativeFlowStateSchema = z
  .object({
    kind: z.literal(NATIVE_FLOW_KIND),
    formKind: z.enum([
      "sale",
      "customer",
      "product",
      "expense",
      "stock_receive",
    ]),
    phoneNumberId: z.string(),
    senderId: z.string(),
    bindingId: z.string(),
    scopeDigest: z.string().regex(/^[a-f0-9]{64}$/),
    delivery: z.enum(["SENDING", "SENT", "UNKNOWN"]),
    consumedBy: z.string().optional(),
  })
  .strict()
export function nativeFlowReturnMatches(
  state: z.infer<typeof nativeFlowStateSchema>,
  current: {
    phoneNumberId: string
    senderId: string
    bindingId: string
    scopeDigest: string
  },
  expiresAt: Date,
  now = new Date(),
) {
  return (
    expiresAt > now &&
    state.delivery === "SENT" &&
    !state.consumedBy &&
    state.phoneNumberId === current.phoneNumberId &&
    state.senderId === current.senderId &&
    state.bindingId === current.bindingId &&
    state.scopeDigest === current.scopeDigest
  )
}
/** Choice values are server IDs only. Oversized directories use the typed/app path. */
export function nativeFlowOptionsAvailable(
  data: Record<string, unknown>,
  required: readonly string[],
) {
  return (
    required.every((key) => Array.isArray(data[key]) && data[key].length > 0) &&
    Object.values(data).every(
      (value) =>
        !Array.isArray(value) ||
        (value.length <= 100 &&
          value.every(
            (option) =>
              option &&
              typeof option.id === "string" &&
              typeof option.title === "string" &&
              option.title.length <= 30,
          )),
    )
  )
}
