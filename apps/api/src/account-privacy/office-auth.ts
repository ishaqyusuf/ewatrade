import { createHmac, timingSafeEqual } from "node:crypto"
import { z } from "zod"
export const officeEnvelopeSchema = z
  .object({
    version: z.literal(1),
    actorId: z.string().min(1).max(100),
    issuedAt: z.string().datetime(),
    operation: z.enum(["queue", "workflow", "advance"]),
    input: z.unknown(),
  })
  .strict()
const bindingsSchema = z.record(
  z.string(),
  z
    .object({
      userId: z.string().min(1).max(100),
      scope: z.enum(["read", "process"]),
      expiresAt: z.string().datetime(),
    })
    .strict(),
)
export function authenticateOfficePrivacy(
  body: string,
  signature: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  now = new Date(),
) {
  const key = env.OVERSIGHT_PRIVACY_KEY
  if (
    env.OVERSIGHT_PRIVACY_ENABLED !== "true" ||
    !key ||
    key.trim().length < 32 ||
    key === env.OVERSIGHT_READ_KEY ||
    body.length > 16000 ||
    !signature ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    return null
  const expected = createHmac("sha256", key).update(body).digest()
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) return null
  try {
    const envelope = officeEnvelopeSchema.parse(JSON.parse(body))
    const issued = new Date(envelope.issuedAt).getTime()
    if (Math.abs(now.getTime() - issued) > 60000) return null
    const bindings = bindingsSchema.parse(
      JSON.parse(env.OVERSIGHT_PRIVACY_OPERATORS_JSON ?? "null"),
    )
    if (!Object.hasOwn(bindings, envelope.actorId)) return null
    const binding = bindings[envelope.actorId]
    if (
      !binding ||
      new Date(binding.expiresAt) <= now ||
      (envelope.operation !== "queue" && binding.scope !== "process")
    )
      return null
    return { envelope, operatorUserId: binding.userId, scope: binding.scope }
  } catch {
    return null
  }
}
