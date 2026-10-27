import "server-only"

import {
  createWhatsAppOtpSender,
  readWhatsAppOtpConfig,
} from "@ewatrade/communications"
import type {
  StorefrontMerchantAlertAdapter,
  StorefrontOtpAdapter,
} from "@ewatrade/db/queries"
import {
  createEmailMessage,
  createTestRoutedEmailMessages,
  dispatchEmailMessages,
} from "@ewatrade/email"
import { createPaymentLinkToken, paymentLinkUrl } from "@ewatrade/payments"
import { cookies, headers } from "next/headers"

/** Host-only, HttpOnly session cookie for storefront shoppers (never staff auth). */
export const CUSTOMER_SESSION_COOKIE = "__Host-ewatrade.storefront_customer"

function secret(name: string, env = process.env) {
  const value = env[name] ?? env.BETTER_AUTH_SECRET ?? env.AUTH_SECRET
  if (!value || value.length < 32)
    throw new Error("Storefront signing secrets are not configured.")
  return value
}
export const receiptSecret = () => secret("STOREFRONT_RECEIPT_SECRET")
export const customerSecret = () => secret("STOREFRONT_CUSTOMER_SECRET")
/** Same key the dashboard/API uses to seal quote acceptance capabilities. */
export const quoteAccessSecret = () => secret("STOREFRONT_QUOTE_ACCESS_SECRET")

export async function requestHost() {
  return (await headers()).get("host") ?? ""
}
export async function requestNetwork() {
  const value = await headers()
  return (
    value.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    value.get("x-real-ip") ||
    "unknown"
  )
}
export async function customerSessionToken() {
  return (await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value ?? null
}
export async function setCustomerSessionCookie(token: string, expiresAt: Date) {
  ;(await cookies()).set(CUSTOMER_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  })
}
export async function clearCustomerSessionCookie() {
  ;(await cookies()).delete(CUSTOMER_SESSION_COOKIE)
}

/** Every marker must say local development; anything else is treated as production. */
export function nonProductionRuntime(env = process.env) {
  return (
    env.NODE_ENV !== "production" &&
    (env.APP_ENV === "local" || env.APP_ENV === "test") &&
    env.DEV_PROFILE === "local"
  )
}

/**
 * Explicit test adapter for automated and local testing. It sends nothing and returns
 * the code to the page, which labels it as a test delivery. It never exists in
 * production runtimes, whatever the flag says.
 */
export function testOtpAdapterEnabled(env = process.env) {
  return (
    nonProductionRuntime(env) && env.STOREFRONT_CUSTOMER_OTP_ADAPTER === "test"
  )
}

function emailLive(env = process.env) {
  return (
    env.EMAIL_DELIVERY_MODE?.trim().toLowerCase() === "live" &&
    Boolean(env.RESEND_API_KEY?.trim())
  )
}

/** Channels that can actually deliver for this business. QA data never uses providers. */
export function storefrontOtpAdapter(input: {
  qaTenant: boolean
}): StorefrontOtpAdapter | null {
  if (testOtpAdapterEnabled())
    return {
      name: "test",
      channels: ["email", "whatsapp"],
      deliver: async ({ code }) => ({ testCode: code }),
    }
  if (input.qaTenant) return null
  const channels: ("email" | "whatsapp")[] = []
  if (emailLive()) channels.push("email")
  let whatsapp: ReturnType<typeof createWhatsAppOtpSender> | null = null
  try {
    const config = readWhatsAppOtpConfig()
    if (config) {
      whatsapp = createWhatsAppOtpSender(config)
      channels.push("whatsapp")
    }
  } catch {
    whatsapp = null
  }
  if (!channels.length) return null
  return {
    name: channels.join("+"),
    channels,
    deliver: async ({ channel, identifier, code, businessName }) => {
      if (channel === "whatsapp") {
        if (!whatsapp) throw new Error("WhatsApp delivery is unavailable.")
        await whatsapp({ code, phone: identifier })
        return {}
      }
      const text = `Your ${businessName} login code is ${code}. It expires in 10 minutes. If you didn't ask for it, ignore this email.`
      const results = await dispatchEmailMessages(
        createTestRoutedEmailMessages(
          createEmailMessage({
            from: process.env.EMAIL_FROM ?? "Ewatrade <noreply@ewatrade.com>",
            to: identifier,
            subject: `${code} is your ${businessName} login code`,
            text,
            html: `<p>Your <strong>${businessName.replace(/[<>&"]/g, "")}</strong> login code is</p><p style="font-size:28px;letter-spacing:6px"><strong>${code}</strong></p><p>It expires in 10 minutes. If you didn't ask for it, ignore this email.</p>`,
          }),
        ),
      )
      if (results.some((result) => result.status === "failed"))
        throw new Error("Email delivery failed.")
      return {}
    },
  }
}

/**
 * Automatic merchant WhatsApp alerts need a consented business recipient and an
 * approved template. No such opt-in exists yet, so no adapter is configured and
 * alerts are recorded as SKIPPED (the in-app inbox remains the notice).
 */
export function merchantAlertAdapter(): StorefrontMerchantAlertAdapter | null {
  return null
}

/** Same signing and origin as the existing manual payment links. */
export function manualPaymentUrl(link: { id: string; expiresAt: Date } | null) {
  if (!link) return null
  const key =
    process.env.PAYMENT_LINK_SIGNING_KEY ??
    process.env.BETTER_AUTH_SECRET ??
    process.env.AUTH_SECRET
  const origin =
    process.env.PAYMENT_LINK_PUBLIC_ORIGIN ??
    process.env.NEXT_PUBLIC_DASHBOARD_URL
  if (!key || key.length < 32 || !origin) return null
  try {
    return paymentLinkUrl(
      origin,
      createPaymentLinkToken(
        { intentId: link.id, expiresAt: link.expiresAt },
        key,
      ),
    )
  } catch {
    return null
  }
}
