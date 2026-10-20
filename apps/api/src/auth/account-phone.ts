import {
  createWhatsAppOtpSender,
  readWhatsAppOtpConfig,
} from "@ewatrade/communications"
import {
  AccountPhoneVerificationError,
  createAccountPhoneChallenge,
  discardAccountPhoneChallenge,
  getAccountPhoneVerificationStatus,
  isLocalPhoneAuth,
  verifyAccountPhoneChallenge,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import type { TRPCContext } from "../trpc/init"

type Context = Pick<
  TRPCContext,
  "db" | "qaSessionScope" | "privacyClientIp" | "clientIp"
> & { session: NonNullable<TRPCContext["session"]> }
function actor(ctx: Context) {
  if (
    ctx.qaSessionScope ||
    !ctx.session.session ||
    ctx.session.session.token.startsWith("qas_")
  )
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Use your own account session to verify your phone.",
    })
  return { userId: ctx.session.user.id, sessionId: ctx.session.session.id }
}
function configuration() {
  try {
    const local = isLocalPhoneAuth()
    const config = local ? null : readWhatsAppOtpConfig()
    if (!local && !config) throw new Error("Disabled")
    return { local, config }
  } catch {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "WhatsApp phone verification is not available yet. Try again later.",
    })
  }
}
function failure(error: unknown): never {
  if (error instanceof AccountPhoneVerificationError)
    throw new TRPCError({ code: error.code, message: error.message })
  if (error instanceof TRPCError) throw error
  throw new TRPCError({
    code: "BAD_REQUEST",
    message:
      "Phone verification could not be completed. Request a new code and try again.",
  })
}
export async function accountPhoneStatus(ctx: Context) {
  actor(ctx)
  const status = await getAccountPhoneVerificationStatus(
    ctx.db,
    ctx.session.user.id,
  )
  let enabled = false
  try {
    enabled = Boolean(configuration())
  } catch {}
  return { ...status, enabled }
}
export async function requestAccountPhoneOtp(ctx: Context) {
  const subject = actor(ctx)
  const { local, config } = configuration()
  const source = ctx.privacyClientIp ?? ctx.clientIp ?? (local ? "local" : null)
  if (!source)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Phone verification is temporarily unavailable.",
    })
  try {
    const issued = await createAccountPhoneChallenge(ctx.db, subject, source)
    try {
      if (config)
        await createWhatsAppOtpSender(config)({
          phone: issued.phone,
          code: issued.code,
        })
    } catch {
      await discardAccountPhoneChallenge(ctx.db, issued)
      throw new TRPCError({
        code: "SERVICE_UNAVAILABLE",
        message: "We could not send the WhatsApp code. Try again later.",
      })
    }
    return {
      phone: issued.phone,
      expiresAt: issued.expiresAt,
      devCode: local ? issued.code : null,
    }
  } catch (error) {
    failure(error)
  }
}
export async function verifyAccountPhoneOtp(ctx: Context, code: string) {
  const subject = actor(ctx)
  configuration()
  try {
    return await verifyAccountPhoneChallenge(ctx.db, subject, code)
  } catch (error) {
    failure(error)
  }
}
