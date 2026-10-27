"use server"

import {
  clearCustomerSessionCookie,
  customerSecret,
  customerSessionToken,
  merchantAlertAdapter,
  receiptSecret,
  requestHost,
  requestNetwork,
  setCustomerSessionCookie,
  storefrontOtpAdapter,
} from "@/lib/storefront-commerce"
import { prisma } from "@ewatrade/db"
import {
  CatalogError,
  StoreConversationError,
  StorefrontCustomerError,
  StorefrontOrderError,
  declineStorefrontServiceQuote,
  dispatchStorefrontMerchantAlerts,
  getStorefrontCustomerSession,
  linkStorefrontOrderToCustomer,
  linkVerifiedStorefrontRequests,
  loadLiveStorefrontForHost,
  readStorefrontPurchaseFacts,
  replyToStorefrontOrderRequest,
  replyToStorefrontServiceRequest,
  requestStorefrontCustomerOtp,
  resolveStorefrontOrderingScope,
  revokeStorefrontCustomerSession,
  storefrontReceiptDigest,
  submitStorefrontOrderRequest,
  submitStorefrontServiceRequestWithReceipt,
  verifyStorefrontCustomerOtp,
  withdrawStorefrontOrderRequest,
  withdrawStorefrontServiceRequest,
} from "@ewatrade/db/queries"
import { after } from "next/server"
import { ZodError } from "zod"

type Failure = {
  ok: false
  message: string
  field?: string
  fields?: Record<string, string>
  issues?: StorefrontOrderError["issues"]
  retryAfterSeconds?: number
}

function failure(error: unknown): Failure {
  if (error instanceof StorefrontOrderError)
    return {
      ok: false,
      message: error.message,
      ...(error.field ? { field: error.field } : {}),
      ...(error.issues.length ? { issues: error.issues } : {}),
    }
  if (error instanceof StorefrontCustomerError)
    return {
      ok: false,
      message: error.message,
      ...(error.retryAfterSeconds
        ? { retryAfterSeconds: error.retryAfterSeconds }
        : {}),
    }
  if (error instanceof ZodError) {
    const fields: Record<string, string> = {}
    for (const issue of error.issues) {
      const key = String(issue.path[0] ?? "form")
      fields[key] ??= issue.message
    }
    return {
      ok: false,
      message: "Check the highlighted details.",
      fields,
    }
  }
  if (error instanceof CatalogError)
    return {
      ok: false,
      message:
        error.code === "INVALID_ORDER"
          ? error.message
          : "This isn't available right now. Refresh and try again.",
    }
  // Shared text-safety boundary (names, notes, addresses, replies).
  if (error instanceof StoreConversationError)
    return {
      ok: false,
      message: "Please remove links or unusual text and try again.",
    }
  console.error("storefront commerce action failed", error)
  return {
    ok: false,
    message: "Something went wrong. Your details are kept; try again.",
  }
}

async function session() {
  return getStorefrontCustomerSession(prisma, {
    host: await requestHost(),
    token: await customerSessionToken(),
  })
}

function scheduleMerchantAlerts() {
  // After commit, never in the request path: a provider outage can't lose the request.
  after(async () => {
    try {
      await dispatchStorefrontMerchantAlerts(prisma, {
        adapter: merchantAlertAdapter(),
        limit: 20,
      })
    } catch (error) {
      console.error("storefront merchant alert dispatch failed", error)
    }
  })
}

export async function checkStorefrontBag(lines: unknown) {
  try {
    const parsed = (Array.isArray(lines) ? lines : [])
      .slice(0, 20)
      .flatMap((line) =>
        line &&
        typeof line === "object" &&
        typeof (line as { itemId?: unknown }).itemId === "string" &&
        typeof (line as { offeringId?: unknown }).offeringId === "string"
          ? [
              {
                itemId: (line as { itemId: string }).itemId.slice(0, 128),
                offeringId: (line as { offeringId: string }).offeringId.slice(
                  0,
                  128,
                ),
                quantity: String(
                  (line as { quantity?: unknown }).quantity ?? "1",
                ),
              },
            ]
          : [],
      )
    const scope = await resolveStorefrontOrderingScope(
      prisma,
      await requestHost(),
    )
    if (!scope)
      return {
        ok: false as const,
        message: "This shop isn't taking order requests right now.",
      }
    const facts = await prisma.$transaction(
      (tx) => readStorefrontPurchaseFacts(tx, scope, parsed),
      { maxWait: 10_000, timeout: 30_000 },
    )
    return {
      ok: true as const,
      lines: parsed.map((line) => {
        const fact = facts.get(line.offeringId)
        const quantity = Number(line.quantity)
        return {
          offeringId: line.offeringId,
          available: Boolean(fact?.public && fact.itemId === line.itemId),
          priceMinor: fact?.priceMinor ?? null,
          stock: fact?.stock ?? ("unknown" as const),
          enough:
            !fact ||
            fact.availableQuantity === null ||
            (Number.isFinite(quantity) &&
              Number(fact.availableQuantity) >= quantity),
        }
      }),
    }
  } catch (error) {
    return failure(error)
  }
}

export async function submitStorefrontOrder(input: unknown) {
  try {
    const current = await session()
    const result = await submitStorefrontOrderRequest(prisma, input, {
      host: await requestHost(),
      receiptSecret: receiptSecret(),
      customerId: current?.customer.id ?? null,
    })
    if (!result.replayed) scheduleMerchantAlerts()
    return { ok: true as const, receiptPath: `/receipt/${result.receiptToken}` }
  } catch (error) {
    return failure(error)
  }
}

export async function submitStorefrontService(input: {
  request: unknown
  extras: unknown
}) {
  try {
    const current = await session()
    const result = await submitStorefrontServiceRequestWithReceipt(
      prisma,
      input,
      {
        host: await requestHost(),
        receiptSecret: receiptSecret(),
        customerId: current?.customer.id ?? null,
      },
    )
    scheduleMerchantAlerts()
    return { ok: true as const, receiptPath: `/receipt/${result.receiptToken}` }
  } catch (error) {
    return failure(error)
  }
}

export async function replyToStorefrontRequest(input: {
  token: string
  kind: "order" | "service"
  reply: unknown
}) {
  try {
    const host = await requestHost()
    if (input.kind === "order")
      await replyToStorefrontOrderRequest(prisma, {
        host,
        token: input.token,
        reply: input.reply,
      })
    else
      await replyToStorefrontServiceRequest(prisma, {
        host,
        token: input.token,
        reply: input.reply,
      })
    scheduleMerchantAlerts()
    return { ok: true as const }
  } catch (error) {
    return failure(error)
  }
}

export async function withdrawStorefrontRequest(input: {
  token: string
  kind: "order" | "service"
  expectedRevision: number
}) {
  try {
    const host = await requestHost()
    const request = { expectedRevision: input.expectedRevision }
    if (input.kind === "order")
      await withdrawStorefrontOrderRequest(prisma, {
        host,
        token: input.token,
        request,
      })
    else
      await withdrawStorefrontServiceRequest(prisma, {
        host,
        token: input.token,
        request,
      })
    return { ok: true as const }
  } catch (error) {
    return failure(error)
  }
}

export async function declineStorefrontQuote(input: {
  token: string
  versionId: string
  reason: string
  clientMessageId: string
}) {
  try {
    await declineStorefrontServiceQuote(prisma, {
      host: await requestHost(),
      token: input.token,
      versionId: String(input.versionId).slice(0, 128),
      reason: input.reason,
      clientMessageId: input.clientMessageId,
    })
    scheduleMerchantAlerts()
    return { ok: true as const }
  } catch (error) {
    return failure(error)
  }
}

async function hostIsQa(host: string) {
  const current = await loadLiveStorefrontForHost(prisma, host, undefined, {})
  return Boolean(current?.storefront.isQaPreview)
}

export async function requestStorefrontLoginCode(identifier: unknown) {
  try {
    const host = await requestHost()
    const adapter = storefrontOtpAdapter({ qaTenant: await hostIsQa(host) })
    if (!adapter)
      return {
        ok: false as const,
        message:
          "Login isn't available right now. You can still order as a guest.",
      }
    const result = await requestStorefrontCustomerOtp(prisma, {
      host,
      identifier,
      network: await requestNetwork(),
      secret: customerSecret(),
      adapter,
    })
    return { ok: true as const, ...result }
  } catch (error) {
    return failure(error)
  }
}

export async function verifyStorefrontLoginCode(input: unknown) {
  try {
    const result = await verifyStorefrontCustomerOtp(prisma, {
      host: await requestHost(),
      verify: input,
      secret: customerSecret(),
    })
    await setCustomerSessionCookie(result.sessionToken, result.expiresAt)
    return { ok: true as const }
  } catch (error) {
    return failure(error)
  }
}

export async function logoutStorefrontCustomer() {
  try {
    await revokeStorefrontCustomerSession(prisma, {
      token: await customerSessionToken(),
    })
    await clearCustomerSessionCookie()
    return { ok: true as const }
  } catch (error) {
    return failure(error)
  }
}

export async function linkVerifiedStorefrontHistory() {
  try {
    const current = await session()
    if (!current)
      return { ok: false as const, message: "Log in again to continue." }
    const result = await linkVerifiedStorefrontRequests(prisma, {
      tenantId: current.tenantId,
      customerId: current.customer.id,
    })
    return { ok: true as const, linked: result.linked }
  } catch (error) {
    return failure(error)
  }
}

/** Explicit link by the receipt holder who is also logged in to this business. */
export async function linkStorefrontReceipt(token: string) {
  try {
    const current = await session()
    if (!current)
      return {
        ok: false as const,
        message: "Log in to add this to your account.",
      }
    const host = await requestHost()
    try {
      await linkStorefrontOrderToCustomer(prisma, {
        host,
        token,
        tenantId: current.tenantId,
        customerId: current.customer.id,
      })
      return { ok: true as const }
    } catch (error) {
      if (
        !(error instanceof StorefrontOrderError) ||
        error.code !== "NOT_FOUND"
      )
        throw error
    }
    const updated = await prisma.storefrontServiceRequestContext.updateMany({
      where: {
        tenantId: current.tenantId,
        receiptTokenDigest: storefrontReceiptDigest(token),
        OR: [{ customerId: null }, { customerId: current.customer.id }],
      },
      data: { customerId: current.customer.id },
    })
    return updated.count === 1
      ? { ok: true as const }
      : {
          ok: false as const,
          message: "This request already belongs to another account.",
        }
  } catch (error) {
    return failure(error)
  }
}
