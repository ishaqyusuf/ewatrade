import { canManageTenant, normalizeRole } from "@ewatrade/auth/roles"
import {
  getActiveInAppNudge,
  markLifecycleMessageDismissed,
} from "@ewatrade/db/lifecycle-messages"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { toInAppNudge } from "../../growth/in-app-nudge"
import { type TRPCContext, createTRPCRouter, protectedProcedure } from "../init"

/** Lifecycle nudges go to Owner and Admin only (plan §4.3). */
function nudgeViewer(ctx: TRPCContext) {
  const tenant = ctx.tenantContext
  const userId = ctx.session?.user.id
  if (!tenant || !userId) throw new TRPCError({ code: "UNAUTHORIZED" })
  const role = normalizeRole(tenant.membership.role)
  return {
    tenantId: tenant.tenant.id,
    userId,
    canSee: Boolean(role && canManageTenant(role)),
  }
}

export const growthRouter = createTRPCRouter({
  /** The one visible Home card, or null. Eligibility is decided by the sweep. */
  activeNudge: protectedProcedure.query(async ({ ctx }) => {
    const viewer = nudgeViewer(ctx)
    if (!viewer.canSee) return null
    return toInAppNudge(
      await getActiveInAppNudge(ctx.db, viewer.tenantId, viewer.userId),
    )
  }),
  dismissNudge: protectedProcedure
    .input(z.object({ id: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const viewer = nudgeViewer(ctx)
      if (!viewer.canSee) return { dismissed: false }
      return {
        dismissed: await markLifecycleMessageDismissed(ctx.db, {
          id: input.id,
          tenantId: viewer.tenantId,
          userId: viewer.userId,
        }),
      }
    }),
})
