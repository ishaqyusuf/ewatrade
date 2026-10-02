import { TRPCError } from "@trpc/server"

type ReceiptSession = {
  sessionId: string
  token: string
  actorUserId: string
  tenantId: string
}

/** Server-derived facts only. A caller cannot choose this session or these loaders. */
export function createExpenseReceiptSessionCheck(
  initial: ReceiptSession,
  loaders: {
    current: () => Promise<ReceiptSession | null>
    persisted: (sessionId: string) => Promise<{
      userId: string
      token: string
      expiresAt: Date
    } | null>
    privacyBlocked: (actorUserId: string) => Promise<boolean>
  },
) {
  const held = structuredClone(initial)
  return async () => {
    const current = await loaders.current()
    if (
      !current ||
      current.sessionId !== held.sessionId ||
      current.actorUserId !== held.actorUserId ||
      current.tenantId !== held.tenantId ||
      current.token !== held.token
    )
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Current receipt session access is unavailable.",
      })
    const persisted = await loaders.persisted(held.sessionId)
    const privacyBlocked = await loaders.privacyBlocked(held.actorUserId)
    // Check after all awaited facts. Expiry while a read waits must refuse.
    if (
      !persisted ||
      persisted.userId !== held.actorUserId ||
      persisted.token !== held.token ||
      !(persisted.expiresAt instanceof Date) ||
      !Number.isFinite(persisted.expiresAt.getTime()) ||
      persisted.expiresAt.getTime() <= Date.now() ||
      privacyBlocked
    )
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Current receipt session access is unavailable.",
      })
  }
}

export function financeExpenseReceiptActorScope(ctx: {
  session: { user: { id: string } } | null
  tenantContext: { tenant: { id: string }; membership: { role: string } } | null
}) {
  if (!ctx.session)
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be signed in to continue.",
    })
  if (
    !ctx.tenantContext ||
    !["OWNER", "ADMIN"].includes(
      ctx.tenantContext.membership.role.toUpperCase(),
    )
  )
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only Owners and Admins can manage finance.",
    })
  return {
    tenantId: ctx.tenantContext.tenant.id,
    actorUserId: ctx.session.user.id,
  }
}
