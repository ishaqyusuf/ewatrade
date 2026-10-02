import { isAccountPrivacyAccessBlocked } from "@ewatrade/db/account-privacy-access"
import { TRPCError } from "@trpc/server"
import type { Context } from "hono"
import { createTRPCContext, resolveProtectedTenantContext } from "../trpc/init"
import {
  createExpenseReceiptSessionCheck,
  financeExpenseReceiptActorScope,
} from "./expense-receipt-session"

/** Shared production upload/download guard; every call reloads protected and persisted facts. */
export function createFinanceExpenseReceiptSessionCheck(
  context: Context,
  initial: Awaited<ReturnType<typeof resolveProtectedTenantContext>>,
) {
  const actor = financeExpenseReceiptActorScope(initial)
  if (!initial.session)
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be signed in to continue.",
    })
  return createExpenseReceiptSessionCheck(
    {
      ...actor,
      sessionId: initial.session.session.id,
      token: initial.session.session.token,
    },
    {
      async current() {
        const fresh = await resolveProtectedTenantContext(
          await createTRPCContext(undefined, context),
        )
        const currentActor = financeExpenseReceiptActorScope(fresh)
        if (!fresh.session) return null
        return {
          ...currentActor,
          sessionId: fresh.session.session.id,
          token: fresh.session.session.token,
        }
      },
      persisted: (sessionId) =>
        initial.db.session.findUnique({
          where: { id: sessionId },
          select: { userId: true, expiresAt: true, token: true },
        }),
      privacyBlocked: (actorUserId) =>
        isAccountPrivacyAccessBlocked(initial.db, actorUserId),
    },
  )
}
