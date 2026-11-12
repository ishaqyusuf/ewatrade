// Lifecycle email preferences (plan §4.2): Account settings toggles for the
// signed-in user, and the no-login token page linked from every email.
// Transactional mail (login codes, receipts, limit-reached notices) is not
// governed by these toggles.

import {
  readMarketingPreference,
  setMarketingPreference,
} from "@ewatrade/db/lifecycle-messages"
import {
  lifecycleLinkSecret,
  verifyLifecyclePreferenceToken,
} from "@ewatrade/growth/links"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import {
  authenticatedProcedure,
  createTRPCRouter,
  publicProcedure,
} from "../init"

const toggles = z
  .object({
    productTips: z.boolean().optional(),
    offers: z.boolean().optional(),
    monthlyReport: z.boolean().optional(),
    unsubscribeAll: z.boolean().optional(),
  })
  .strict()

const tokenInput = z.object({ token: z.string().min(10).max(2048) }).strict()

function project(
  preference: Awaited<ReturnType<typeof readMarketingPreference>>,
) {
  return {
    productTips: preference.productTips,
    offers: preference.offers,
    monthlyReport: preference.monthlyReport,
    unsubscribedAll: Boolean(preference.unsubscribedAllAt),
  }
}

function tokenUser(token: string) {
  const secret = lifecycleLinkSecret({
    LIFECYCLE_LINK_SECRET: process.env.LIFECYCLE_LINK_SECRET,
  })
  const verified = secret ? verifyLifecyclePreferenceToken(token, secret) : null
  if (!verified)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This link is not valid. Sign in to change your email settings.",
    })
  return verified.u
}

export const marketingPreferencesRouter = createTRPCRouter({
  get: authenticatedProcedure.query(async ({ ctx }) =>
    project(await readMarketingPreference(ctx.db, ctx.session.user.id)),
  ),
  update: authenticatedProcedure
    .input(toggles)
    .mutation(async ({ ctx, input }) => {
      await setMarketingPreference(ctx.db, ctx.session.user.id, input)
      return project(await readMarketingPreference(ctx.db, ctx.session.user.id))
    }),
  /** No-login page from the email footer. Returns toggles only, never the address. */
  byToken: publicProcedure.input(tokenInput).query(async ({ ctx, input }) => {
    const userId = tokenUser(input.token)
    const user = await ctx.db.user.findUnique({
      where: { id: userId },
      select: { id: true },
    })
    if (!user) throw new TRPCError({ code: "NOT_FOUND" })
    return project(await readMarketingPreference(ctx.db, userId))
  }),
  updateByToken: publicProcedure
    .input(tokenInput.merge(toggles))
    .mutation(async ({ ctx, input }) => {
      const { token, ...values } = input
      const userId = tokenUser(token)
      const user = await ctx.db.user.findUnique({
        where: { id: userId },
        select: { id: true },
      })
      if (!user) throw new TRPCError({ code: "NOT_FOUND" })
      await setMarketingPreference(ctx.db, userId, values)
      return project(await readMarketingPreference(ctx.db, userId))
    }),
})
