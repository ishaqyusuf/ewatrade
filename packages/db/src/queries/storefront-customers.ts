import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto"
import { normalizeWhatsAppPhone } from "@ewatrade/customer-messages"
import {
  ORDERING_TEMPLATE_KEYS,
  storefrontCustomerIdentifierSchema,
  storefrontOtpVerifySchema,
} from "@ewatrade/storefront-contracts/orders"
import type { PrismaClient } from "../../generated/prisma/client"
import { loadLiveStorefrontForHost } from "./storefront-factory-loader"
import type { DbClient } from "./types"

/**
 * Optional storefront shopper login. Separate from staff/business auth: its own
 * customer rows, OTP challenges and sessions, all scoped to one business. Guest
 * ordering never depends on it. Delivery goes through an explicit adapter chosen
 * by the host; there is no universal code.
 */

export const STOREFRONT_OTP_TTL_MS = 10 * 60_000
export const STOREFRONT_OTP_RESEND_MS = 60_000
export const STOREFRONT_OTP_MAX_SENDS = 3
export const STOREFRONT_OTP_MAX_ATTEMPTS = 5
export const STOREFRONT_SESSION_TTL_MS = 30 * 24 * 60 * 60_000
const IDENTIFIER_WINDOW_MS = 15 * 60_000
const IDENTIFIER_CHALLENGES_PER_WINDOW = 4
const NETWORK_CHALLENGES_PER_WINDOW = 12

export type StorefrontCustomerErrorCode =
  | "UNAVAILABLE"
  | "INVALID"
  | "RATE_LIMITED"
  | "RESEND_TOO_SOON"
  | "DELIVERY_FAILED"
  | "EXPIRED"
  | "WRONG_CODE"
  | "LOCKED"
  | "CHANNEL_UNAVAILABLE"

export class StorefrontCustomerError extends Error {
  readonly code: StorefrontCustomerErrorCode
  readonly retryAfterSeconds?: number
  readonly attemptsLeft?: number
  constructor(
    code: StorefrontCustomerErrorCode,
    message: string,
    extra: { retryAfterSeconds?: number; attemptsLeft?: number } = {},
  ) {
    super(message)
    this.name = "StorefrontCustomerError"
    this.code = code
    this.retryAfterSeconds = extra.retryAfterSeconds
    this.attemptsLeft = extra.attemptsLeft
  }
}

export type StorefrontOtpDelivery = {
  channel: "email" | "whatsapp"
  identifier: string
  code: string
  businessName: string
}
/**
 * Host-provided delivery boundary. `name` is recorded on the challenge. A test
 * adapter may return the code for automated tests; the host must only allow that
 * outside production.
 */
export type StorefrontOtpAdapter = {
  name: string
  channels: readonly ("email" | "whatsapp")[]
  deliver(input: StorefrontOtpDelivery): Promise<{ testCode?: string }>
}

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex")
const hmac = (secret: string, value: string) =>
  createHmac("sha256", secret).update(value).digest("hex")

async function accountScope(db: DbClient, host: string) {
  const current = await loadLiveStorefrontForHost(db, host, undefined, {})
  if (!current) return null
  const release = current.site.release
  if (!ORDERING_TEMPLATE_KEYS.includes(release.templateKey)) return null
  if (
    !(current.storefront as { customerRequestsAllowed?: boolean })
      .customerRequestsAllowed
  )
    return null
  const store = await db.store.findFirst({
    where: { id: current.site.storeId },
    select: { countryCode: true },
  })
  return {
    tenantId: release.tenantId,
    storeId: current.site.storeId,
    businessName: current.storefront.name,
    countryCode: store?.countryCode ?? "NG",
  }
}

function normalizeIdentifier(
  input: { channel: "email" | "whatsapp"; identifier: string },
  countryCode: string,
) {
  if (input.channel === "email") return input.identifier.trim().toLowerCase()
  const phone = normalizeWhatsAppPhone(input.identifier, countryCode)
  if (!phone)
    throw new StorefrontCustomerError(
      "INVALID",
      "Enter a WhatsApp number we can reach, for example 0803 123 4567.",
    )
  return phone.phoneE164
}

export function maskStorefrontIdentifier(
  channel: "email" | "whatsapp",
  identifier: string,
) {
  if (channel === "email") {
    const [name = "", domain = ""] = identifier.split("@")
    return `${name.slice(0, 2)}•••@${domain}`
  }
  return `${identifier.slice(0, 4)} ••• ${identifier.slice(-3)}`
}

/** Start or resend a login challenge. Delivery failure leaves nothing usable. */
export async function requestStorefrontCustomerOtp(
  db: PrismaClient,
  input: {
    host: string
    identifier: unknown
    network: string
    secret: string
    adapter: StorefrontOtpAdapter
  },
) {
  if (input.secret.length < 32)
    throw new StorefrontCustomerError("UNAVAILABLE", "Login isn't available.")
  const value = storefrontCustomerIdentifierSchema.parse(input.identifier)
  const scope = await accountScope(db, input.host)
  if (!scope)
    throw new StorefrontCustomerError(
      "UNAVAILABLE",
      "Login isn't available for this shop.",
    )
  if (!input.adapter.channels.includes(value.channel))
    throw new StorefrontCustomerError(
      "CHANNEL_UNAVAILABLE",
      value.channel === "whatsapp"
        ? "WhatsApp codes aren't available right now. Use email instead."
        : "Email codes aren't available right now. Use WhatsApp instead.",
    )
  const identifier = normalizeIdentifier(value, scope.countryCode)
  const kind = value.channel === "email" ? "EMAIL" : "WHATSAPP"
  const identifierDigest = hmac(
    input.secret,
    `storefront-customer:${scope.tenantId}:${kind}:${identifier}`,
  )
  const networkDigest = hmac(
    input.secret,
    `storefront-network:${input.network}`,
  )
  const now = Date.now()
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0")

  const challenge = await db.$transaction(async (tx) => {
    // Serialize challenges for one identifier so limits can't be raced.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${identifierDigest}))`
    const recent = await tx.storefrontCustomerOtpChallenge.findMany({
      where: {
        tenantId: scope.tenantId,
        identifierDigest,
        createdAt: { gt: new Date(now - IDENTIFIER_WINDOW_MS) },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        sendCount: true,
        lastSentAt: true,
        expiresAt: true,
      },
    })
    const active = recent.find(
      (entry) => entry.status === "PENDING" && entry.expiresAt.getTime() > now,
    )
    if (active) {
      const wait = active.lastSentAt.getTime() + STOREFRONT_OTP_RESEND_MS - now
      if (wait > 0)
        throw new StorefrontCustomerError(
          "RESEND_TOO_SOON",
          `Wait ${Math.ceil(wait / 1000)} seconds before asking for another code.`,
          { retryAfterSeconds: Math.ceil(wait / 1000) },
        )
      if (active.sendCount >= STOREFRONT_OTP_MAX_SENDS)
        throw new StorefrontCustomerError(
          "RATE_LIMITED",
          "Too many codes requested. Try again in 15 minutes.",
          { retryAfterSeconds: 15 * 60 },
        )
      return tx.storefrontCustomerOtpChallenge.update({
        where: { id: active.id },
        data: {
          codeHash: hmac(input.secret, `${active.id}:${code}`),
          sendCount: { increment: 1 },
          lastSentAt: new Date(now),
          expiresAt: new Date(now + STOREFRONT_OTP_TTL_MS),
          attempts: 0,
          deliveryAdapter: input.adapter.name,
        },
        select: { id: true, expiresAt: true },
      })
    }
    if (recent.length >= IDENTIFIER_CHALLENGES_PER_WINDOW)
      throw new StorefrontCustomerError(
        "RATE_LIMITED",
        "Too many codes requested. Try again in 15 minutes.",
        { retryAfterSeconds: 15 * 60 },
      )
    const fromNetwork = await tx.storefrontCustomerOtpChallenge.count({
      where: {
        tenantId: scope.tenantId,
        networkDigest,
        createdAt: { gt: new Date(now - IDENTIFIER_WINDOW_MS) },
      },
    })
    if (fromNetwork >= NETWORK_CHALLENGES_PER_WINDOW)
      throw new StorefrontCustomerError(
        "RATE_LIMITED",
        "Too many login attempts from this connection. Try again later.",
        { retryAfterSeconds: 15 * 60 },
      )
    const id = randomUUID()
    return tx.storefrontCustomerOtpChallenge.create({
      data: {
        id,
        tenantId: scope.tenantId,
        kind,
        identifier,
        identifierDigest,
        codeHash: hmac(input.secret, `${id}:${code}`),
        expiresAt: new Date(now + STOREFRONT_OTP_TTL_MS),
        networkDigest,
        deliveryAdapter: input.adapter.name,
      },
      select: { id: true, expiresAt: true },
    })
  })

  let delivered: { testCode?: string }
  try {
    delivered = await input.adapter.deliver({
      channel: value.channel,
      identifier,
      code,
      businessName: scope.businessName,
    })
  } catch {
    await db.storefrontCustomerOtpChallenge.updateMany({
      where: { id: challenge.id, status: "PENDING" },
      data: { status: "EXPIRED", identifier: null },
    })
    throw new StorefrontCustomerError(
      "DELIVERY_FAILED",
      value.channel === "whatsapp"
        ? "We couldn't send a WhatsApp code just now. Try again, or log in with email."
        : "We couldn't send an email code just now. Try again, or log in with WhatsApp.",
    )
  }
  return {
    challengeId: challenge.id,
    expiresAt: challenge.expiresAt.toISOString(),
    resendAfterSeconds: STOREFRONT_OTP_RESEND_MS / 1000,
    destination: maskStorefrontIdentifier(value.channel, identifier),
    channel: value.channel,
    ...(delivered.testCode ? { testCode: delivered.testCode } : {}),
  }
}

/** Verify a code. Wrong attempts are committed; a used or locked code never works. */
export async function verifyStorefrontCustomerOtp(
  db: PrismaClient,
  input: { host: string; verify: unknown; secret: string },
) {
  const value = storefrontOtpVerifySchema.parse(input.verify)
  const scope = await accountScope(db, input.host)
  if (!scope)
    throw new StorefrontCustomerError(
      "UNAVAILABLE",
      "Login isn't available for this shop.",
    )
  const outcome = await db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "StorefrontCustomerOtpChallenge"
      WHERE "id" = ${value.challengeId} AND "tenantId" = ${scope.tenantId}
      FOR UPDATE`
    if (!locked.length) return { kind: "expired" as const }
    const challenge = await tx.storefrontCustomerOtpChallenge.findUniqueOrThrow(
      {
        where: { id: value.challengeId },
      },
    )
    if (challenge.status === "LOCKED") return { kind: "locked" as const }
    if (
      challenge.status !== "PENDING" ||
      challenge.expiresAt.getTime() <= Date.now() ||
      !challenge.identifier
    ) {
      if (challenge.status === "PENDING")
        await tx.storefrontCustomerOtpChallenge.update({
          where: { id: challenge.id },
          data: { status: "EXPIRED", identifier: null },
        })
      return { kind: "expired" as const }
    }
    const expected = Buffer.from(challenge.codeHash, "hex")
    const received = Buffer.from(
      hmac(input.secret, `${challenge.id}:${value.code}`),
      "hex",
    )
    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      const attempts = challenge.attempts + 1
      const lockedOut = attempts >= challenge.maxAttempts
      await tx.storefrontCustomerOtpChallenge.update({
        where: { id: challenge.id },
        data: {
          attempts,
          ...(lockedOut ? { status: "LOCKED", identifier: null } : {}),
        },
      })
      return lockedOut
        ? { kind: "locked" as const }
        : {
            kind: "wrong" as const,
            attemptsLeft: challenge.maxAttempts - attempts,
          }
    }
    await tx.storefrontCustomerOtpChallenge.update({
      where: { id: challenge.id },
      data: { status: "VERIFIED", identifier: null },
    })
    const identity =
      challenge.kind === "EMAIL"
        ? { emailNormalized: challenge.identifier }
        : { phoneE164: challenge.identifier }
    const customer =
      (await tx.storefrontCustomer.findFirst({
        where: { tenantId: scope.tenantId, ...identity },
        select: { id: true },
      })) ??
      (await tx.storefrontCustomer.create({
        data: { tenantId: scope.tenantId, ...identity },
        select: { id: true },
      }))
    await tx.storefrontCustomer.update({
      where: { id: customer.id },
      data: { lastLoginAt: new Date() },
    })
    const token = randomBytes(32).toString("base64url")
    const expiresAt = new Date(Date.now() + STOREFRONT_SESSION_TTL_MS)
    await tx.storefrontCustomerSession.create({
      data: {
        tenantId: scope.tenantId,
        customerId: customer.id,
        tokenDigest: sha256(token),
        expiresAt,
      },
    })
    return { kind: "ok" as const, token, expiresAt, customerId: customer.id }
  })
  if (outcome.kind === "expired")
    throw new StorefrontCustomerError(
      "EXPIRED",
      "This code has expired. Ask for a new one.",
    )
  if (outcome.kind === "locked")
    throw new StorefrontCustomerError(
      "LOCKED",
      "Too many wrong codes. Ask for a new code.",
    )
  if (outcome.kind === "wrong")
    throw new StorefrontCustomerError(
      "WRONG_CODE",
      outcome.attemptsLeft === 1
        ? "That code isn't right. You have 1 try left."
        : `That code isn't right. You have ${outcome.attemptsLeft} tries left.`,
      { attemptsLeft: outcome.attemptsLeft },
    )
  return {
    sessionToken: outcome.token,
    expiresAt: outcome.expiresAt,
    customerId: outcome.customerId,
  }
}

/** Session for this business only; expired/revoked/foreign sessions read as none. */
export async function getStorefrontCustomerSession(
  db: DbClient,
  input: { host: string; token: string | undefined | null },
) {
  if (!input.token || !/^[A-Za-z0-9_-]{40,64}$/.test(input.token)) return null
  const session = await db.storefrontCustomerSession.findUnique({
    where: { tokenDigest: sha256(input.token) },
    select: {
      id: true,
      tenantId: true,
      expiresAt: true,
      revokedAt: true,
      lastSeenAt: true,
      customer: {
        select: {
          id: true,
          tenantId: true,
          emailNormalized: true,
          phoneE164: true,
          displayName: true,
        },
      },
    },
  })
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt.getTime() <= Date.now() ||
    session.customer.tenantId !== session.tenantId
  )
    return null
  const scope = await accountScope(db, input.host)
  if (!scope || scope.tenantId !== session.tenantId) return null
  if (Date.now() - session.lastSeenAt.getTime() > 10 * 60_000)
    await db.storefrontCustomerSession
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined)
  return {
    sessionId: session.id,
    tenantId: session.tenantId,
    storeId: scope.storeId,
    customer: session.customer,
  }
}

export async function revokeStorefrontCustomerSession(
  db: DbClient,
  input: { token: string | undefined | null },
) {
  if (!input.token) return { revoked: false }
  const result = await db.storefrontCustomerSession.updateMany({
    where: { tokenDigest: sha256(input.token), revokedAt: null },
    data: { revokedAt: new Date() },
  })
  return { revoked: result.count > 0 }
}

/**
 * Guest requests made with the customer's verified WhatsApp number that are not
 * yet linked. Shown only after phone ownership was proven by OTP; linking still
 * requires an explicit customer action. Email logins never match phone numbers.
 */
export async function listLinkableStorefrontRequests(
  db: DbClient,
  input: { tenantId: string; customerId: string },
) {
  const customer = await db.storefrontCustomer.findFirst({
    where: { id: input.customerId, tenantId: input.tenantId },
    select: { phoneE164: true },
  })
  if (!customer?.phoneE164) return []
  const [orders, services] = await Promise.all([
    db.storefrontOrderRequest.findMany({
      where: {
        tenantId: input.tenantId,
        customerPhone: customer.phoneE164,
        customerId: null,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, reference: true, createdAt: true },
    }),
    db.storefrontServiceRequestContext.findMany({
      where: {
        tenantId: input.tenantId,
        customerId: null,
        serviceRequest: { customerPhone: customer.phoneE164 },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, reference: true, createdAt: true },
    }),
  ])
  return [
    ...orders.map((row) => ({ kind: "order" as const, ...row })),
    ...services.map((row) => ({ kind: "service" as const, ...row })),
  ]
}

export async function linkVerifiedStorefrontRequests(
  db: PrismaClient,
  input: { tenantId: string; customerId: string },
) {
  const customer = await db.storefrontCustomer.findFirst({
    where: { id: input.customerId, tenantId: input.tenantId },
    select: { phoneE164: true },
  })
  if (!customer?.phoneE164) return { linked: 0 }
  return db.$transaction(async (tx) => {
    const orders = await tx.storefrontOrderRequest.updateMany({
      where: {
        tenantId: input.tenantId,
        customerPhone: customer.phoneE164 as string,
        customerId: null,
      },
      data: { customerId: input.customerId },
    })
    const contexts = await tx.storefrontServiceRequestContext.findMany({
      where: {
        tenantId: input.tenantId,
        customerId: null,
        serviceRequest: { customerPhone: customer.phoneE164 },
      },
      select: { id: true },
      take: 200,
    })
    const services = await tx.storefrontServiceRequestContext.updateMany({
      where: { id: { in: contexts.map((row) => row.id) }, customerId: null },
      data: { customerId: input.customerId },
    })
    return { linked: orders.count + services.count }
  })
}

/** Verified customer's service requests for this business. */
export async function listStorefrontCustomerServiceRequests(
  db: DbClient,
  input: { tenantId: string; customerId: string; take?: number },
) {
  const rows = await db.storefrontServiceRequestContext.findMany({
    where: { tenantId: input.tenantId, customerId: input.customerId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(input.take ?? 20, 50),
    select: {
      id: true,
      reference: true,
      createdAt: true,
      serviceRequest: {
        select: {
          status: true,
          lines: {
            take: 3,
            select: {
              offering: { select: { catalogItem: { select: { name: true } } } },
            },
          },
        },
      },
    },
  })
  return rows.map((row) => ({
    id: row.id,
    reference: row.reference,
    status: row.serviceRequest.status,
    createdAt: row.createdAt.toISOString(),
    summary: [
      ...new Set(
        row.serviceRequest.lines.map((line) => line.offering.catalogItem.name),
      ),
    ].join(", "),
  }))
}
