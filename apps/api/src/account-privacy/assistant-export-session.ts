import { isAccountPrivacyAccessBlocked } from "@ewatrade/db/account-privacy-access"
import { TRPCError } from "@trpc/server"
import { requireBrowserIdentity } from "../assistant/channel-principal"
import type { TRPCContext } from "../trpc/init"

type ExportContext = Pick<
  TRPCContext,
  "db" | "session" | "qaSessionScope" | "isInternalRequest"
>

/** Account access, independent of merchant membership and channel enrollment. */
export async function requireFreshAssistantExportSession(
  ctx: ExportContext,
  now = new Date(),
) {
  const identity = requireBrowserIdentity(ctx.session)
  if (
    ctx.qaSessionScope ||
    ctx.isInternalRequest ||
    identity.session.token.startsWith("qas_")
  )
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Use your own signed-in account to download assistant data.",
    })

  // Cookie/session caches are insufficient for an account data download.
  const session = await ctx.db.session.findFirst({
    where: {
      id: identity.session.id,
      userId: identity.user.id,
      token: identity.session.token,
      expiresAt: { gt: now },
      qaAuthorizationId: null,
      qaTenantId: null,
      qaMembershipId: null,
      qaStoreId: null,
    },
    select: { userId: true, createdAt: true },
  })
  const age = session ? now.getTime() - session.createdAt.getTime() : Number.NaN
  if (!session || !Number.isFinite(age) || age < 0 || age > 15 * 60_000)
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Sign in again before downloading your assistant data.",
    })

  if (await isAccountPrivacyAccessBlocked(ctx.db, session.userId))
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Assistant data is unavailable while account deletion is processing.",
    })
  return session.userId
}
