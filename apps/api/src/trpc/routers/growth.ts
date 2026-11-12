import { canManageTenant, normalizeRole } from "@ewatrade/auth/roles"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { type InAppNudgeRow, toInAppNudge } from "../../growth/in-app-nudge"
import { type TRPCContext, createTRPCRouter, protectedProcedure } from "../init"

// Typed stand-ins for W1's `getActiveInAppNudge` / `markLifecycleMessageDismissed`
// (packages/db/src/queries/lifecycle-messages.ts). Swap for the real queries
// once that file is committed; until then no nudge is ever visible.
async function getActiveInAppNudge(
  _db: TRPCContext["db"],
  _tenantId: string,
  _userId: string,
): Promise<InAppNudgeRow | null> {
  return null
}
async function markLifecycleMessageDismissed(
  _db: TRPCContext["db"],
  _input: { id: string; tenantId: string; userId: string },
): Promise<boolean> {
  return false
}

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
