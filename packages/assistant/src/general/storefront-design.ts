import { z } from "zod"

const target = {
  expectedSiteId: z.string().min(1).max(128),
  expectedRevision: z.number().int().nonnegative(),
}
export const storefrontGenerateAction = z
  .object({
    action: z.literal("storefront_design_generate"),
    ...target,
    desiredJourney: z.enum(["browse", "request"]),
    refinement: z.string().trim().max(500).default(""),
  })
  .strict()
export const storefrontAcceptAction = z
  .object({
    action: z.literal("storefront_design_accept"),
    ...target,
    runId: z.string().min(1).max(128),
    directionId: z.enum(["01", "02", "03"]),
  })
  .strict()
