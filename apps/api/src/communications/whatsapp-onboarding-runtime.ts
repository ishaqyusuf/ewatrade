import { createHmac, randomBytes } from "node:crypto"
import {
  DirectMetaWhatsAppProvider,
  type NormalizedWhatsAppMessageEvent,
  type WhatsAppProvider,
  WhatsAppProviderSendError,
} from "@ewatrade/communications"
import { type Prisma, type PrismaClient, prisma } from "@ewatrade/db"
import {
  connectAssistantWhatsAppOnboarding,
  listAssistantWhatsAppOnboardingChoices,
} from "@ewatrade/db/assistant-whatsapp"
import { runInOwnSerializableTransaction } from "@ewatrade/db/own-transaction"
import { currentEffectiveLegalPublication } from "@ewatrade/utils/legal-approval"
import { z } from "zod"
import {
  type WhatsAppOnboardingAdapters,
  type WhatsAppOnboardingAddress,
  type WhatsAppOnboardingResult,
  advanceWhatsAppOnboarding,
} from "./whatsapp-onboarding"
import {
  issueWhatsAppOnboardingEmail,
  verifyWhatsAppOnboardingEmail,
} from "./whatsapp-onboarding-auth"

const flowLifetimeMs = 30 * 60_000
const receiptLifetimeMs = 24 * 60 * 60_000
const leaseMs = 3 * 60_000
const flowKind = "whatsapp_onboarding_runtime_v1"
const receiptKind = "whatsapp_onboarding_receipt_v1"
const choiceSchema = z
  .object({
    tenantId: z.string().min(1),
    storeId: z.string().min(1),
    membershipId: z.string().min(1),
    businessName: z.string().max(300),
    storeName: z.string().max(300),
  })
  .strict()
const stateSchema = z
  .object({
    version: z.literal(1),
    phoneNumberId: z.string(),
    senderId: z.string(),
    stage: z.enum([
      "email",
      "name",
      "business",
      "age",
      "location",
      "legal",
      "code",
      "choose",
      "consent",
      "complete",
    ]),
    mode: z.enum(["login", "sign_up"]),
    expiresAt: z.number(),
    attempts: z.number().int().min(0).max(5),
    requestedAt: z.number().optional(),
    challengeExpiresAt: z.number().optional(),
    email: z.string().max(254).optional(),
    signup: z
      .object({
        name: z.string().max(120).optional(),
        businessName: z.string().max(120).optional(),
        ageBand: z.enum(["AGE_13_TO_15", "AGE_16_TO_17", "ADULT"]).optional(),
        countryCode: z.string().max(2).optional(),
        currencyCode: z
          .enum(["NGN", "USD", "GHS", "KES", "ZAR", "EGP"])
          .optional(),
        legalVersion: z.string().max(64).optional(),
        acceptedTerms: z.literal(true).optional(),
        acknowledgedPrivacyNotice: z.literal(true).optional(),
      })
      .strict()
      .optional(),
    principal: z
      .object({ userId: z.string(), sessionId: z.string() })
      .strict()
      .optional(),
    choices: z.array(choiceSchema).max(100).optional(),
    page: z.number().int().min(0).optional(),
    selected: choiceSchema.optional(),
    lastMessageId: z.string().max(256).optional(),
    lastReply: z.string().max(4096).optional(),
  })
  .strict()
const flowSchema = z
  .object({
    kind: z.literal(flowKind),
    state: stateSchema.nullable(),
    count: z.number().int().min(0).max(60),
    lease: z
      .object({
        nonce: z.string(),
        receiptToken: z.string(),
        expiresAt: z.number(),
      })
      .strict()
      .nullable(),
  })
  .strict()
const receiptSchema = z
  .object({
    kind: z.literal(receiptKind),
    nonce: z.string(),
    status: z.enum([
      "PROCESSING",
      "READY",
      "SEND_STARTED",
      "SENT",
      "FAILED",
      "UNKNOWN",
    ]),
    reply: z.string().max(4096).optional(),
    providerMessageId: z.string().max(512).optional(),
  })
  .strict()
type Flow = z.infer<typeof flowSchema>
type Dependencies = {
  db: PrismaClient
  provider: Pick<WhatsAppProvider, "sendText">
  env: Record<string, string | undefined>
  now(): Date
  adapters?: (
    event: NormalizedWhatsAppMessageEvent,
    lease: { token: string; nonce: string },
  ) => WhatsAppOnboardingAdapters
}

const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value))
function digest(env: Dependencies["env"], value: string) {
  const secret = env.BETTER_AUTH_SECRET ?? env.AUTH_SECRET
  if (!secret)
    throw new Error("WhatsApp connection authentication is unavailable.")
  return createHmac("sha256", secret)
    .update(`whatsapp-onboarding-runtime:v1:${value}`)
    .digest("hex")
}
function flowToken(
  address: WhatsAppOnboardingAddress,
  env: Dependencies["env"],
) {
  return `wa-flow_${digest(env, `${address.phoneNumberId}:${address.senderId}`)}`
}

async function cleanExpired(tx: Prisma.TransactionClient, now: Date) {
  const expired = await tx.onboardingSession.findMany({
    where: {
      expiresAt: { lte: now },
      OR: ["wa-flow_", "wa-receipt_", "wa-proof_", "wa-app-link_"].map(
        (prefix) => ({
          token: { startsWith: prefix },
        }),
      ),
    },
    select: { id: true },
    take: 50,
  })
  if (expired.length)
    await tx.onboardingSession.deleteMany({
      where: { id: { in: expired.map((row) => row.id) } },
    })
}

function productionAdapters(
  dependencies: Dependencies,
  lease: { token: string; nonce: string },
  occurredAt: Date,
): WhatsAppOnboardingAdapters {
  const publication = currentEffectiveLegalPublication()
  const marketing =
    dependencies.env.MARKETING_URL ??
    dependencies.env.NEXT_PUBLIC_MARKETING_URL ??
    "https://ewatrade.com"
  const origin = new URL(marketing).origin
  return {
    legal: publication
      ? {
          version: publication.version,
          termsUrl: `${origin}/terms`,
          privacyUrl: `${origin}/privacy`,
        }
      : null,
    requestEmail: async ({ operationId: _, ...input }) => {
      const issued = await issueWhatsAppOnboardingEmail(dependencies.db, input)
      await issued.deliver()
      return { expiresAt: issued.expiresAt }
    },
    verifyEmail: async (input) => {
      const verified = await verifyWhatsAppOnboardingEmail(dependencies.db, {
        ...input,
        onboardingLease: lease,
      })
      return verified.kind === "verified"
        ? { userId: verified.userId, sessionId: verified.sessionId }
        : null
    },
    choices: (principal) =>
      listAssistantWhatsAppOnboardingChoices(dependencies.db, principal),
    connect: async (input) => {
      await connectAssistantWhatsAppOnboarding(dependencies.db, {
        ...input,
        providerOccurredAt: occurredAt,
        onboardingLease: lease,
      })
    },
  }
}

/** STOP invalidates the sender lease before canonical disconnect, even when assistant access is off. */
export async function cancelWhatsAppOnboarding(
  address: WhatsAppOnboardingAddress,
  db = prisma,
  env: Dependencies["env"] = process.env,
) {
  if (
    !/^[1-9]\d{7,14}$/.test(address.senderId) ||
    !/^\d+$/.test(address.phoneNumberId)
  )
    return
  const token = flowToken(address, env)
  await runInOwnSerializableTransaction(db, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${token}))`
    const row = await tx.onboardingSession.findUnique({ where: { token } })
    if (!row) return
    const parsed = flowSchema.safeParse(row.formData)
    if (!parsed.success) return
    if (parsed.data.lease) {
      const receipt = await tx.onboardingSession.findUnique({
        where: { token: parsed.data.lease.receiptToken },
      })
      const data = receiptSchema.safeParse(receipt?.formData)
      if (data.success && ["PROCESSING", "READY"].includes(data.data.status))
        await tx.onboardingSession.update({
          where: { token: parsed.data.lease.receiptToken },
          data: {
            formData: json({
              kind: receiptKind,
              nonce: data.data.nonce,
              status: "FAILED",
            }),
          },
        })
    }
    await tx.onboardingSession.update({
      where: { token },
      data: {
        formData: json({ ...parsed.data, state: null, lease: null }),
        completed: true,
        userId: null,
      },
    })
  })
}

/** Signed platform inbound only. No credentials or verification codes enter ordinary assistant history. */
export async function processWhatsAppOnboardingMessage(
  event: NormalizedWhatsAppMessageEvent,
  config: { phoneNumberId: string; accessToken: string },
  injected?: Dependencies,
): Promise<{
  handled: boolean
  outcome?: "sent" | "unknown" | "failed" | "duplicate" | "limited"
}> {
  const dependencies: Dependencies = injected ?? {
    db: prisma,
    env: process.env,
    now: () => new Date(),
    provider: new DirectMetaWhatsAppProvider(),
  }
  const now = dependencies.now()
  if (!event.messageId || event.messageId.length > 256) return { handled: true }
  const address = {
    senderId: event.externalCustomerId,
    phoneNumberId: event.phoneNumberId,
  }
  if (
    config.phoneNumberId !== address.phoneNumberId ||
    !/^[1-9]\d{7,14}$/.test(address.senderId) ||
    !/^\d+$/.test(address.phoneNumberId)
  )
    return { handled: true }
  const occurredAt =
    event.timestamp && /^\d{1,13}$/.test(event.timestamp)
      ? new Date(Number(event.timestamp) * 1000)
      : null
  // A verified webhook signature does not make old/replayed content a fresh messaging window.
  if (
    !occurredAt ||
    occurredAt.getTime() <= now.getTime() - receiptLifetimeMs ||
    occurredAt.getTime() > now.getTime() + 5 * 60_000
  )
    return { handled: true }
  const text = event.text?.trim() ?? ""
  const explicit = /^(?:connect|register)$/i.test(text)
  const token = flowToken(address, dependencies.env)
  const messageToken = `wa-receipt_${digest(dependencies.env, `${token}:${event.messageId}`)}`
  const nonce = randomBytes(24).toString("base64url")
  const claimed = await runInOwnSerializableTransaction(
    dependencies.db,
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${token}))`
      await cleanExpired(tx, now)
      const existingReceipt = await tx.onboardingSession.findUnique({
        where: { token: messageToken },
      })
      if (existingReceipt) return { kind: "duplicate" as const }
      const row = await tx.onboardingSession.findUnique({ where: { token } })
      const parsed = flowSchema.safeParse(row?.formData)
      const prior: Flow =
        parsed.success && row && row.expiresAt > now
          ? parsed.data
          : { kind: flowKind, state: null, count: 0, lease: null }
      const active =
        prior.state &&
        prior.state.stage !== "complete" &&
        prior.state.expiresAt > now.getTime()
      if (!active && !explicit) {
        const grant = await tx.assistantWhatsAppGrant.findFirst({
          where: {
            revokedAt: null,
            expiresAt: { gt: now },
            idleExpiresAt: { gt: now },
            identity: { ...address, revokedAt: null },
          },
          select: { id: true },
        })
        if (grant) return { kind: "linked" as const }
      }
      if (prior.lease && prior.lease.expiresAt > now.getTime())
        throw new Error(
          "WhatsApp connection is processing another message. Retry this webhook later.",
        )
      if (prior.count >= 60) return { kind: "limited" as const }
      const flow: Flow = {
        kind: flowKind,
        state: active ? prior.state : null,
        count: prior.count + 1,
        lease: {
          nonce,
          receiptToken: messageToken,
          expiresAt: now.getTime() + leaseMs,
        },
      }
      await tx.onboardingSession.upsert({
        where: { token },
        create: {
          token,
          formData: json(flow),
          expiresAt: new Date(now.getTime() + flowLifetimeMs),
        },
        update: {
          formData: json(flow),
          completed: false,
          expiresAt:
            row && row.expiresAt > now
              ? row.expiresAt
              : new Date(now.getTime() + flowLifetimeMs),
        },
      })
      await tx.onboardingSession.create({
        data: {
          token: messageToken,
          formData: json({ kind: receiptKind, nonce, status: "PROCESSING" }),
          expiresAt: new Date(now.getTime() + receiptLifetimeMs),
        },
      })
      return { kind: "claimed" as const, state: flow.state }
    },
  )
  if (claimed.kind === "linked") return { handled: false }
  if (claimed.kind !== "claimed")
    return { handled: true, outcome: claimed.kind }
  let advanced: WhatsAppOnboardingResult
  try {
    const adapters =
      dependencies.adapters?.(event, { token, nonce }) ??
      productionAdapters(dependencies, { token, nonce }, occurredAt)
    advanced = await advanceWhatsAppOnboarding(
      claimed.state,
      {
        ...address,
        messageId: event.messageId,
        text: text.length <= 4096 ? text : "",
        now: now.getTime(),
      },
      adapters,
    )
  } catch {
    await runInOwnSerializableTransaction(dependencies.db, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${token}))`
      const receipt = await tx.onboardingSession.findUnique({
        where: { token: messageToken },
      })
      const parsed = receiptSchema.safeParse(receipt?.formData)
      if (parsed.success && parsed.data.status === "PROCESSING")
        await tx.onboardingSession.update({
          where: { token: messageToken },
          data: {
            formData: json({ kind: receiptKind, nonce, status: "UNKNOWN" }),
          },
        })
      const row = await tx.onboardingSession.findUnique({ where: { token } })
      const flow = flowSchema.safeParse(row?.formData)
      if (flow.success && flow.data.lease?.nonce === nonce)
        await tx.onboardingSession.update({
          where: { token },
          data: { formData: json({ ...flow.data, lease: null }) },
        })
    })
    return { handled: true, outcome: "unknown" }
  }
  const ready = await runInOwnSerializableTransaction(
    dependencies.db,
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${token}))`
      const row = await tx.onboardingSession.findUnique({ where: { token } })
      const flow = flowSchema.safeParse(row?.formData)
      const receiptRow = await tx.onboardingSession.findUnique({
        where: { token: messageToken },
      })
      const receipt = receiptSchema.safeParse(receiptRow?.formData)
      const current = dependencies.now()
      if (
        !flow.success ||
        flow.data.lease?.nonce !== nonce ||
        flow.data.lease.expiresAt <= current.getTime() ||
        !receipt.success ||
        receipt.data.status !== "PROCESSING"
      )
        return false
      const userId =
        advanced.state?.principal?.userId ??
        claimed.state?.principal?.userId ??
        null
      const state = advanced.connected ? null : advanced.state
      await tx.onboardingSession.update({
        where: { token },
        data: {
          formData: json({ ...flow.data, state }),
          completed: !state,
          userId,
        },
      })
      await tx.onboardingSession.update({
        where: { token: messageToken },
        data: {
          userId,
          formData: json({
            kind: receiptKind,
            nonce,
            status: "READY",
            reply: advanced.reply,
          }),
        },
      })
      return true
    },
  )
  if (!ready) return { handled: true, outcome: "unknown" }
  const started = await runInOwnSerializableTransaction(
    dependencies.db,
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${token}))`
      const flowRow = await tx.onboardingSession.findUnique({
        where: { token },
      })
      const flow = flowSchema.safeParse(flowRow?.formData)
      const row = await tx.onboardingSession.findUnique({
        where: { token: messageToken },
      })
      const parsed = receiptSchema.safeParse(row?.formData)
      if (
        !flow.success ||
        flow.data.lease?.nonce !== nonce ||
        flow.data.lease.expiresAt <= dependencies.now().getTime() ||
        !parsed.success ||
        parsed.data.nonce !== nonce ||
        parsed.data.status !== "READY"
      )
        return false
      await tx.onboardingSession.update({
        where: { token: messageToken },
        data: {
          formData: json({ kind: receiptKind, nonce, status: "SEND_STARTED" }),
        },
      })
      await tx.onboardingSession.update({
        where: { token },
        data: { formData: json({ ...flow.data, lease: null }) },
      })
      return true
    },
  )
  if (!started) return { handled: true, outcome: "unknown" }
  let outcome: "sent" | "failed" | "unknown" = "unknown"
  let providerMessageId: string | undefined
  try {
    const sent = await dependencies.provider.sendText({
      phoneNumberId: config.phoneNumberId,
      accessToken: config.accessToken,
      to: address.senderId,
      body: advanced.reply,
      callbackData: `wa-onboarding:${digest(dependencies.env, messageToken)}`,
    })
    providerMessageId = sent.messageId
    outcome = "sent"
  } catch (error) {
    outcome =
      error instanceof WhatsAppProviderSendError &&
      error.outcome === "DEFINITE_FAILURE"
        ? "failed"
        : "unknown"
  }
  // A missing/ambiguous result is never retried: Meta has no send-idempotency contract.
  await dependencies.db.onboardingSession
    .update({
      where: { token: messageToken },
      data: {
        formData: json({
          kind: receiptKind,
          nonce,
          status:
            outcome === "sent"
              ? "SENT"
              : outcome === "failed"
                ? "FAILED"
                : "UNKNOWN",
          ...(providerMessageId ? { providerMessageId } : {}),
        }),
      },
    })
    .catch(() => {})
  return { handled: true, outcome }
}
