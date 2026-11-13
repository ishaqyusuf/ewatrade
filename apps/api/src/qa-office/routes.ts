import { createHmac, timingSafeEqual } from "node:crypto"
import type { PrismaClient } from "@ewatrade/db"
import {
  QaOfficePurgeError,
  isQaOfficeDomain,
  listQaOfficeData,
  purgeQaTester,
} from "@ewatrade/db/queries"
import { isQaForbiddenRuntime } from "@ewatrade/utils/qa-policy"
import { Hono } from "hono"
import { z } from "zod"

/**
 * Oversight's QA data desk for this environment (Development or Preview).
 * Requests are HMAC-signed with OVERSIGHT_QA_KEY and expire after a minute.
 * Production never answers: QA does not exist there (owner decision, 13 Nov 2026).
 */
const qaDomain = z
  .string()
  .trim()
  .toLowerCase()
  .refine(isQaOfficeDomain, "Use a reserved QA .test domain")

const envelopeSchema = z.discriminatedUnion("operation", [
  z
    .object({
      version: z.literal(1),
      actorId: z.string().min(1).max(100),
      issuedAt: z.string().datetime(),
      operation: z.literal("list"),
      input: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      version: z.literal(1),
      actorId: z.string().min(1).max(100),
      issuedAt: z.string().datetime(),
      operation: z.literal("purge"),
      input: z
        .object({
          qa: qaDomain,
          tenantIds: z
            .array(z.string().min(1).max(100))
            .min(1)
            .max(50)
            .optional(),
        })
        .strict(),
    })
    .strict(),
])

export type QaOfficeEnvelope = z.infer<typeof envelopeSchema>

export function authenticateQaOffice(
  body: string,
  signature: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): QaOfficeEnvelope | null {
  const key = env.OVERSIGHT_QA_KEY?.trim()
  if (
    isQaForbiddenRuntime(env) ||
    !key ||
    key.length < 32 ||
    key === env.OVERSIGHT_READ_KEY?.trim() ||
    key === env.OVERSIGHT_PRIVACY_KEY?.trim() ||
    body.length > 8000 ||
    !signature ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    return null
  const expected = createHmac("sha256", key).update(body).digest()
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) return null
  try {
    const envelope = envelopeSchema.parse(JSON.parse(body))
    if (
      Math.abs(now.getTime() - new Date(envelope.issuedAt).getTime()) > 60_000
    )
      return null
    return envelope
  } catch {
    return null
  }
}

export function createQaOfficeRoutes(
  getDb: () => PrismaClient,
  env: NodeJS.ProcessEnv = process.env,
) {
  const app = new Hono()
  app.post("/", async (c) => {
    c.header("Cache-Control", "no-store")
    if (isQaForbiddenRuntime(env)) return c.json({ error: "Not found" }, 404)
    const body = await c.req.text()
    const envelope = authenticateQaOffice(
      body,
      c.req.header("X-Oversight-Signature"),
      env,
    )
    if (!envelope) return c.json({ error: "Unauthorized" }, 401)
    const environment = env.APP_ENV?.trim().toLowerCase() || "development"
    if (envelope.operation === "list")
      return c.json({ environment, ...(await listQaOfficeData(getDb())) })
    try {
      const result = await purgeQaTester(getDb(), {
        qa: envelope.input.qa,
        tenantIds: envelope.input.tenantIds,
        requestedBy: `oversight:${envelope.actorId}`,
      })
      return c.json({ environment, ...result })
    } catch (error) {
      if (error instanceof QaOfficePurgeError)
        return c.json(
          { error: error.message },
          error.code === "CONFLICT" ? 409 : 404,
        )
      throw error
    }
  })
  return app
}
