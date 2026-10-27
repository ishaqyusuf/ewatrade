import { z } from "zod"
import type { StorefrontCapabilities, StorefrontMode } from "./resources"

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)
export const serviceOfferingIdsSchema = z
  .array(id)
  .min(1)
  .max(20)
  .refine(
    (ids) => new Set(ids).size === ids.length,
    "Select each option only once.",
  )
export const storefrontActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("openItem"), itemId: id }).strict(),
  z.object({ type: z.literal("openConversation") }).strict(),
  z
    .object({
      type: z.literal("whatsappEnquiry"),
      itemId: id,
      optionIds: serviceOfferingIdsSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("openServiceRequest"),
      itemId: id,
      offeringId: id,
      offeringIds: serviceOfferingIdsSchema.optional(),
    })
    .strict()
    .refine(
      (value) =>
        !value.offeringIds ||
        (value.offeringIds[0] === value.offeringId &&
          new Set(value.offeringIds).size === value.offeringIds.length),
      "Select distinct options with the first option matching offeringId.",
    ),
])
export type StorefrontAction = z.infer<typeof storefrontActionSchema>
export const storefrontActionResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("navigate"),
      href: z.string().min(1).max(4096),
    })
    .strict(),
  z
    .object({ status: z.literal("preview"), message: z.string().max(500) })
    .strict(),
  z
    .object({ status: z.literal("unavailable"), message: z.string().max(500) })
    .strict(),
])
export type StorefrontActionResult =
  | { status: "navigate"; href: string }
  | { status: "preview"; message: string }
  | { status: "unavailable"; message: string }

/** Call again on the server before any effect; client flags only control presentation. */
export function storefrontActionAllowed(
  mode: StorefrontMode,
  capabilities: StorefrontCapabilities,
  action: StorefrontAction,
) {
  if (action.type === "openItem") return capabilities.catalog.available
  if (mode === "preview") return false
  const capability =
    action.type === "openConversation"
      ? "conversation"
      : action.type === "openServiceRequest"
        ? "serviceRequest"
        : "whatsappEnquiry"
  return capabilities[capability].available
}

export type StorefrontActionAdapter = (
  action: StorefrontAction,
) => StorefrontActionResult | Promise<StorefrontActionResult>

export function createPreviewActionAdapter(): StorefrontActionAdapter {
  return (input) => {
    const action = storefrontActionSchema.parse(input)
    if (action.type === "openItem") {
      return {
        status: "navigate",
        href: `?item=${encodeURIComponent(action.itemId)}`,
      }
    }
    return {
      status: "preview",
      message: "This action is a preview. No request or message was sent.",
    }
  }
}

/** Server entry for every action: preview never reaches a live adapter. */
export async function runStorefrontAction(
  mode: StorefrontMode,
  capabilities: StorefrontCapabilities,
  input: unknown,
  live: StorefrontActionAdapter,
): Promise<StorefrontActionResult> {
  const action = storefrontActionSchema.parse(input)
  if (mode === "preview") return createPreviewActionAdapter()(action)
  if (!storefrontActionAllowed(mode, capabilities, action)) {
    return {
      status: "unavailable",
      message: "This is not available right now.",
    }
  }
  return live(action)
}
