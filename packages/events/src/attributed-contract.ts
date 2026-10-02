import {
  analyticsBatchSchema,
  analyticsEventSchema,
} from "@ishaqyusuf/logly-core"
import { z } from "zod"

// Product-proxy proof only. The collector receives generic actor/groups instead.
export const analyticsContextSchema = z.string().max(2048).optional()
export const attributedEventSchema = analyticsEventSchema.extend({
  analyticsContext: analyticsContextSchema,
})
export const attributedBatchSchema = analyticsBatchSchema.extend({
  events: z.array(attributedEventSchema).min(1).max(25),
})
