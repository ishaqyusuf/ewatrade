import { recordFeatureIntentTap } from "@ewatrade/db/growth-intent"
import { GROWTH_INTENT_FEATURES } from "@ewatrade/events/growth-intent"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { createTRPCRouter, protectedProcedure } from "../init"

// First-party "See plans" tap counter for the lifecycle feature-intent play.
// The Logly `upgrade_cta_clicked` event is analytics; this row is what the
// server reads. Fixed feature labels only, keyed by the active business.
const seePlansTapInput = z
  .object({
    feature: z.enum(GROWTH_INTENT_FEATURES).exclude(["plan_billing", "home"]),
  })
  .strict()

export const growthIntentRouter = createTRPCRouter({
  recordSeePlansTap: protectedProcedure
    .input(seePlansTapInput)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantContext?.tenant.id
      if (!tenantId) throw new TRPCError({ code: "UNAUTHORIZED" })
      await recordFeatureIntentTap(ctx.db, { tenantId, feature: input.feature })
      return { ok: true as const }
    }),
})
