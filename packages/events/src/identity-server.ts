import { createHmac, timingSafeEqual } from "node:crypto"
import { z } from "zod"

const identitySchema = z.object({
  project: z.enum(["ewatrade-dashboard", "ewatrade-mobile"]),
  actorId: z.string().regex(/^usr_[a-f0-9]{64}$/),
  groups: z.object({
    business: z
      .object({
        key: z.string().regex(/^grp_[a-f0-9]{64}$/),
        properties: z.object({ name: z.string().max(120) }),
      })
      .optional(),
  }),
  properties: z.object({
    workspace_role: z.string().max(40).optional(),
    audience: z.enum(["internal", "business"]),
  }),
  issuedAt: z.number().int(),
  expiresAt: z.number().int(),
})
const ttl = 15 * 60 * 1000
function secret() {
  const value = process.env.LOGLY_IDENTITY_SECRET
  return value && value.length >= 32 ? value : null
}
function digest(key: string, value: string) {
  return createHmac("sha256", key).update(value).digest("hex")
}

/** Only call after authenticating and authorizing the active tenant. */
export function issueAnalyticsContext(
  input: {
    project: "ewatrade-dashboard" | "ewatrade-mobile"
    userId: string
    tenantId?: string
    tenantName?: string
    role?: string
    internal: boolean
  },
  now = Date.now(),
) {
  const key = secret()
  if (!key) return null
  const reference = (kind: string, id: string) =>
    digest(key, JSON.stringify([input.project, kind, id]))
  const context = identitySchema.parse({
    project: input.project,
    actorId: `usr_${reference("user", input.userId)}`,
    groups: {
      ...(input.tenantId && input.tenantName
        ? {
            business: {
              key: `grp_${reference("business", input.tenantId)}`,
              properties: { name: input.tenantName.slice(0, 120) },
            },
          }
        : {}),
    },
    properties: {
      ...(input.role ? { workspace_role: input.role.slice(0, 40) } : {}),
      audience: input.internal ? "internal" : "business",
    },
    issuedAt: now,
    expiresAt: now + ttl,
  })
  const payload = Buffer.from(JSON.stringify(context)).toString("base64url")
  return {
    token: `${payload}.${digest(key, payload)}`,
    expiresAt: context.expiresAt,
    identityKey: `${context.actorId}:${context.groups.business?.key ?? ""}`,
  }
}

export function verifyAnalyticsContext(
  token: unknown,
  project: string,
  occurredAt: string,
  now = Date.now(),
) {
  const key = secret()
  if (!key || typeof token !== "string" || token.length > 2048) return null
  const [payload, signature, extra] = token.split(".")
  if (!payload || !signature || extra || !/^[a-f0-9]{64}$/.test(signature))
    return null
  if (
    !timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(digest(key, payload), "hex"),
    )
  )
    return null
  try {
    const parsed = identitySchema.safeParse(
      JSON.parse(Buffer.from(payload, "base64url").toString()),
    )
    if (!parsed.success) return null
    const value = parsed.data
    const capture = Date.parse(occurredAt)
    if (
      value.project !== project ||
      value.expiresAt - value.issuedAt !== ttl ||
      value.issuedAt > now + 60000 ||
      !Number.isFinite(capture) ||
      capture < value.issuedAt - 60000 ||
      capture > value.expiresAt ||
      capture > now + 60000 ||
      now - capture > 86400000
    )
      return null
    return {
      actorId: value.actorId,
      groups: value.groups,
      properties: value.properties,
    }
  } catch {
    return null
  }
}
