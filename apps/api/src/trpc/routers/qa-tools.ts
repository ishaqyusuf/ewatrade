import { getAuthenticatedQaFixtureContext } from "@ewatrade/db/queries"
import { z } from "zod"
import { createTRPCRouter, protectedProcedure } from "../init"

export const qaToolsRouter = createTRPCRouter({
  fixtureContext: protectedProcedure
    // This key partitions client caches; authentication and scope come from ctx.
    .input(
      z
        .object({ scopeKey: z.string().max(512).optional() })
        .strict()
        .nullish(),
    )
    .query(({ ctx }) =>
      getAuthenticatedQaFixtureContext(ctx.db, {
        membershipId: ctx.tenantContext.membership.id,
        sessionId: ctx.session.session.id,
        storeId: ctx.tenantContext.activeStore?.id ?? null,
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
      }),
    ),
})
