import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { WHATSAPP_DELIVERY_REQUEST_MS } from "@ewatrade/assistant/channels/delivery"
import { presentWhatsAppMessage } from "@ewatrade/assistant/channels/presentation"
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
  type WhatsAppOnboardingSignup,
  advanceWhatsAppOnboarding,
  whatsAppOnboardingButtons,
} from "./whatsapp-onboarding"
import {
  issueWhatsAppOnboardingEmail,
  verifyWhatsAppOnboardingEmail,
} from "./whatsapp-onboarding-auth"
import { whatsAppRegistrationEntry } from "./whatsapp-onboarding-details"

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
    promptId: z.string().max(256).optional(),
    promptExpiresAt: z.number().optional(),
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
  provider: Pick<WhatsAppProvider, "sendText"> &
    Partial<Pick<WhatsAppProvider, "sendButtons">>
  env: Record<string, string | undefined>
  now(): Date
  adapters?: (
    event: NormalizedWhatsAppMessageEvent,
    lease: { token: string; nonce: string },
  ) => WhatsAppOnboardingAdapters
}

/** Bound only onboarding replies; OTP keeps its existing provider and policy. */
export function createWhatsAppOnboardingProvider(
  requestFetch: typeof fetch = fetch,
) {
  return new DirectMetaWhatsAppProvider({
    fetch: Object.assign(
      (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
        requestFetch(url, {
          ...init,
          redirect: "error",
          signal: AbortSignal.timeout(WHATSAPP_DELIVERY_REQUEST_MS),
        }),
      { preconnect: requestFetch.preconnect },
    ),
  })
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
/** IDs bind the exact persisted prompt, sender/recipient and expiry, without exposing account identifiers. */
function onboardingButtonId(
  token: string,
  promptId: string,
  command: string,
  env: Record<string, string | undefined>,
) {
  return `waonb:${Buffer.from(command).toString("base64url")}:${digest(env, `${token}:${promptId}:${command}`)}`
}

function readOnboardingButton(
  id: string,
  token: string,
  flow: Flow,
  env: Record<string, string | undefined>,
  now: number,
): string | null {
  const parts = /^waonb:([A-Za-z0-9_-]{1,64}):([a-f0-9]{64})$/.exec(id)
  if (
    !parts ||
    !flow.promptId ||
    !flow.promptExpiresAt ||
    flow.promptExpiresAt <= now
  )
    return null
  const command = Buffer.from(parts[1]!, "base64url").toString()
  const expected = onboardingButtonId(token, flow.promptId, command, env)
  if (
    id.length !== expected.length ||
    !timingSafeEqual(Buffer.from(id), Buffer.from(expected))
  )
    return null
  return command
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

/** Shared effective publication for native registration and the typed interview. */
export function getWhatsAppOnboardingLegal(
  env: Record<string, string | undefined> = process.env,
): WhatsAppOnboardingAdapters["legal"] {
  const publication = currentEffectiveLegalPublication()
  if (!publication) return null
  const origin = new URL(
    env.MARKETING_URL ??
      env.NEXT_PUBLIC_MARKETING_URL ??
      "https://ewatrade.com",
  ).origin
  return {
    version: publication.version,
    termsUrl: `${origin}/terms`,
    privacyUrl: `${origin}/privacy`,
  }
}

function productionAdapters(
  dependencies: Dependencies,
  lease: { token: string; nonce: string },
  occurredAt: Date,
): WhatsAppOnboardingAdapters {
  return {
    legal: getWhatsAppOnboardingLegal(dependencies.env),
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
        formData: json({
          ...parsed.data,
          state: null,
          lease: null,
          promptId: undefined,
          promptExpiresAt: undefined,
        }),
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
  structured?: {
    signupForm: WhatsAppOnboardingSignup & { email: string }
    registrationToken?: string
  },
): Promise<{
  handled: boolean
  outcome?: "sent" | "unknown" | "failed" | "duplicate" | "limited"
}> {
  const dependencies: Dependencies = injected ?? {
    db: prisma,
    env: process.env,
    now: () => new Date(),
    provider: createWhatsAppOnboardingProvider(),
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
  const explicit =
    whatsAppRegistrationEntry(text) !== null ||
    /^(?:connect|register|register chat|register form|open registration form|create account|add business|i want to add another business|keep)$/i.test(
      text,
    ) ||
    Boolean(event.quickActionId?.startsWith("waonb:")) ||
    Boolean(structured)
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
      if (structured?.registrationToken) {
        const registrationToken = structured.registrationToken
        if (!registrationToken.startsWith("wa-flow_native_"))
          return { kind: "duplicate" as const }
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${registrationToken}))`
        const registration = await tx.onboardingSession.findUnique({
          where: { token: registrationToken },
        })
        const guard = z
          .object({
            kind: z.literal("native-registration-flow-v1"),
            senderId: z.literal(address.senderId),
            phoneNumberId: z.literal(address.phoneNumberId),
            status: z.literal("RETURN_PENDING"),
            returnMessageId: z.literal(event.messageId),
          })
          .safeParse(registration?.formData)
        if (!guard.success || !registration || registration.expiresAt <= now)
          return { kind: "duplicate" as const }
      }
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
      const grant = await tx.assistantWhatsAppGrant.findFirst({
        where: {
          revokedAt: null,
          expiresAt: { gt: now },
          idleExpiresAt: { gt: now },
          identity: { ...address, revokedAt: null },
        },
        select: { id: true, identity: { select: { userId: true } } },
      })
      if (!active && !explicit && grant) return { kind: "linked" as const }
      const nativeAction = event.quickActionId?.startsWith("waonb:")
        ? readOnboardingButton(
            event.quickActionId,
            token,
            prior,
            dependencies.env,
            now.getTime(),
          )
        : undefined
      if (prior.lease && prior.lease.expiresAt > now.getTime())
        throw new Error(
          "WhatsApp connection is processing another message. Retry this webhook later.",
        )
      if (prior.count >= 60) return { kind: "limited" as const }
      const flow: Flow = {
        kind: flowKind,
        state: active ? prior.state : null,
        count: prior.count + 1,
        promptId: prior.promptId,
        promptExpiresAt: prior.promptExpiresAt,
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
      return {
        kind: "claimed" as const,
        state: flow.state,
        linked: Boolean(grant),
        connectedUserId: grant?.identity?.userId,
        nativeAction,
      }
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
    // Invalid native payloads are consumed here, never interpreted as a name, code or model input.
    advanced =
      claimed.nativeAction === null
        ? {
            state: claimed.state,
            reply:
              "That option expired or belongs to an earlier step. Use the current options, type your answer, or send CONNECT to start again.",
            connected: false,
            buttons: whatsAppOnboardingButtons(claimed.state),
          }
        : await advanceWhatsAppOnboarding(
            claimed.state,
            {
              ...address,
              messageId: event.messageId,
              text: claimed.nativeAction ?? (text.length <= 4096 ? text : ""),
              ...(structured ? { signupForm: structured.signupForm } : {}),
              now: now.getTime(),
            },
            {
              ...adapters,
              connected: claimed.linked || adapters.connected,
              connectedUserId:
                claimed.connectedUserId ?? adapters.connectedUserId,
            },
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
          formData: json({
            ...flow.data,
            state,
            promptId: event.messageId,
            promptExpiresAt: Math.min(
              advanced.state?.expiresAt ?? now.getTime() + flowLifetimeMs,
              now.getTime() + flowLifetimeMs,
            ),
          }),
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
    const payload = {
      phoneNumberId: config.phoneNumberId,
      accessToken: config.accessToken,
      to: address.senderId,
      body: presentWhatsAppMessage(advanced.reply, { family: "account" }),
      callbackData: `wa-onboarding:${digest(dependencies.env, messageToken)}`,
    }
    const buttons = advanced.buttons?.slice(0, 3).map((button) => ({
      id: onboardingButtonId(
        token,
        event.messageId,
        button.command,
        dependencies.env,
      ),
      title: button.title,
    }))
    const sent =
      buttons?.length &&
      payload.body.length <= 1024 &&
      dependencies.provider.sendButtons
        ? await dependencies.provider.sendButtons({ ...payload, buttons })
        : await dependencies.provider.sendText(payload)
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
