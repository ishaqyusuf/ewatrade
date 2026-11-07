import { createHmac } from "node:crypto"
import { initPasswordRecoveryAuth } from "@ewatrade/auth"
import { prisma } from "@ewatrade/db"
import {
  createManagedQaEmailMessages,
  dispatchEmailMessages,
  renderPasswordResetTemplate,
} from "@ewatrade/email"
import { after } from "next/server"
import { z } from "zod/v4"

const requestSchema = z.object({ email: z.email().max(254) })
const resetSchema = z.object({
  token: z.string().min(1).max(256),
  newPassword: z.string().min(8).max(128),
})
const responseHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
}
const requestMessage =
  "If an account exists for that email, you will receive a password reset link. Check your inbox and spam folder."

export function passwordRecoveryOrigin() {
  const url = new URL(
    process.env.DASHBOARD_URL ??
      process.env.NEXT_PUBLIC_DASHBOARD_URL ??
      "https://dash.ewatrade.com",
  )
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("Password recovery requires a bare HTTPS dashboard origin.")
  return url.origin
}

function json(body: object, status = 200) {
  return Response.json(body, { status, headers: responseHeaders })
}

// Fixed-window atomic upserts reuse the existing expiring authentication budgets.
// Neither an email nor a network address is stored in a bucket key.
async function budget(key: string, maximum: number) {
  const secret = process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET
  if (!secret) throw new Error("Authentication secret is required")
  const now = new Date()
  const bucketDigest = createHmac("sha256", secret)
    .update(
      `dashboard-password-recovery:${key}:${Math.floor(now.getTime() / 900_000)}`,
    )
    .digest("hex")
  const row = await prisma.accountPrivacyRateBucket.upsert({
    where: { bucketDigest },
    create: { bucketDigest, sentCount: 1, windowStartedAt: now },
    update: { sentCount: { increment: 1 } },
    select: { sentCount: true },
  })
  return row.sentCount <= maximum
}

function recoveryAuth(
  origin: string,
  database?: Parameters<typeof initPasswordRecoveryAuth>[0]["database"],
) {
  return initPasswordRecoveryAuth({
    baseUrl: origin,
    database,
    async sendResetPassword({ user, token }) {
      const url = new URL("/reset-password", origin)
      // Fragments stay out of HTTP access logs, referrers and server rendering.
      url.hash = new URLSearchParams({ token }).toString()
      const messages = await createManagedQaEmailMessages({
        from: process.env.EMAIL_FROM ?? "EwaTrade <noreply@ewatrade.com>",
        to: user.email,
        replyTo: process.env.EMAIL_REPLY_TO,
        subject: "Reset your EwaTrade password",
        ...renderPasswordResetTemplate({ resetUrl: url.href }),
      })
      const results = await dispatchEmailMessages(messages)
      if (results.some((result) => result.status !== "sent"))
        throw new Error("Password recovery delivery failed")
    },
  })
}

export async function handlePasswordRecovery(
  request: Request,
  action: "request" | "reset",
) {
  try {
    const origin = passwordRecoveryOrigin()
    if (
      request.headers.get("origin") !== origin ||
      !request.headers.get("content-type")?.startsWith("application/json")
    )
      return json({ error: "This request is not allowed." }, 403)
    const input: unknown = await request.json().catch(() => null)
    const network =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown"
    if (action === "request") {
      const parsed = requestSchema.safeParse(input)
      if (!parsed.success)
        return json({ error: "Enter a valid email address." }, 400)
      const email = parsed.data.email.toLowerCase()
      if (
        !(await budget(`request-network:${network}`, 10)) ||
        !(await budget(`request-email:${email}`, 3))
      )
        return json(
          { error: "Too many requests. Wait 15 minutes, then try again." },
          429,
        )
      // The entire account lookup and provider delivery happen after the same
      // response for every address. Next keeps this task alive on serverless.
      after(async () => {
        try {
          await recoveryAuth(origin).api.requestPasswordReset({
            body: { email },
          })
        } catch {
          // Never log addresses, passwords, reset URLs or provider error payloads.
          console.error("[password-recovery] request processing failed")
        }
      })
      return json({ message: requestMessage })
    }
    const parsed = resetSchema.safeParse(input)
    if (!parsed.success)
      return json(
        {
          error:
            "Use a valid reset link and a password between 8 and 128 characters.",
        },
        400,
      )
    if (!(await budget(`reset-network:${network}`, 20)))
      return json(
        { error: "Too many requests. Wait 15 minutes, then try again." },
        429,
      )
    // Installed Better Auth consumes tokens before saving credentials/revoking
    // sessions. One outer transaction makes all three effects commit together.
    await prisma.$transaction(
      async (tx) => {
        await recoveryAuth(origin, tx).api.resetPassword({ body: parsed.data })
      },
      { maxWait: 10_000, timeout: 30_000 },
    )
    return json({ success: true })
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "body" in error &&
      (error.body as { code?: string } | undefined)?.code === "INVALID_TOKEN"
    )
      return json(
        {
          error:
            "This reset link has expired or has already been used. Request a new link.",
          code: "INVALID_TOKEN",
        },
        400,
      )
    console.error("[password-recovery] request unavailable")
    return json(
      {
        error:
          "Password recovery is temporarily unavailable. Please try again.",
      },
      503,
    )
  }
}
