import { eventNameSchema } from "@ishaqyusuf/logly-core"
import { z } from "zod"

// Product-owned, scalar metadata. Add fields intentionally; never dump form data.
export const eventMetadataSchema = z.object({
  surface: z.string().max(128).optional(),
  channel: z.string().max(128).optional(),
  action: z.string().max(128).optional(),
  category: z.string().max(128).optional(),
  status: z.string().max(128).optional(),
  item_count: z.number().int().nonnegative().optional(),
  duration_ms: z.number().finite().nonnegative().optional(),
  success: z.boolean().optional(),
})
export type EventMetadata = z.infer<typeof eventMetadataSchema>
export function safeEventMetadata(input: unknown): EventMetadata {
  const result = eventMetadataSchema.safeParse(input)
  return result.success ? result.data : {}
}
export function isEventName(name: string) {
  return eventNameSchema.safeParse(name).success
}
