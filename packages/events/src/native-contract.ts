import {
  analyticsBatchSchema,
  analyticsEventSchema,
} from "@ishaqyusuf/logly-core"
import { z } from "zod"
import { analyticsContextSchema } from "./attributed-contract"

// Logly's native wire contract is deployed separately from its published 0.2 SDK.
// Keep this compatibility boundary explicit until core 0.3 is published.
export const nativeEventSchema = analyticsEventSchema.extend({
  analyticsContext: analyticsContextSchema,
  source: z.literal("mobile"),
  platform: z.literal("android"),

  appVersion: z
    .string()
    .regex(/^[0-9]+(?:\.[0-9]+){1,3}$/)
    .max(64)
    .optional(),
  appBuild: z
    .string()
    .regex(/^[0-9]+$/)
    .max(64)
    .optional(),
})
export const nativeBatchSchema = analyticsBatchSchema.extend({
  events: z.array(nativeEventSchema).min(1).max(25),
})
export type NativeEvent = z.infer<typeof nativeEventSchema>
export type NativeBatch = z.infer<typeof nativeBatchSchema>
