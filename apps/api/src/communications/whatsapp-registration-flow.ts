import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { WHATSAPP_DELIVERY_REQUEST_MS } from "@ewatrade/assistant/channels/delivery"
import {
  whatsAppFlowFirstScreen,
  whatsAppFlowSubmissionSchemas,
} from "@ewatrade/assistant/channels/flows"
import { presentWhatsAppMessage } from "@ewatrade/assistant/channels/presentation"
import {
  DirectMetaWhatsAppProvider,
  type NormalizedWhatsAppMessageEvent,
  type WhatsAppProvider,
} from "@ewatrade/communications"
import { type Prisma, type PrismaClient, prisma } from "@ewatrade/db"
import { runInOwnSerializableTransaction } from "@ewatrade/db/own-transaction"
import { COUNTRIES } from "@ewatrade/utils/countries"
import { OPERATING_CURRENCIES } from "@ewatrade/utils/currency"
import { z } from "zod"
import type {
  WhatsAppOnboardingAddress,
  WhatsAppOnboardingSignup,
} from "./whatsapp-onboarding"
import {
  cancelWhatsAppOnboarding,
  getWhatsAppOnboardingLegal,
  processWhatsAppOnboardingMessage,
} from "./whatsapp-onboarding-runtime"

const kind = "native-registration-flow-v1"
const lifetimeMs = 30 * 60_000
const recordSchema = z
  .object({
    kind: z.literal(kind),
    senderId: z.string(),
    phoneNumberId: z.string(),
    tokenDigest: z.string().regex(/^[a-f0-9]{64}$/),
    legalVersion: z.string(),
    expiresAt: z.number(),
    status: z.enum([
      "LAUNCH_STARTED",
      "OPEN",
      "UNKNOWN",
      "RETURN_PENDING",
      "COMPLETE",
      "CANCELLED",
    ]),
    returnMessageId: z.string().optional(),
  })
  .strict()

/** Exact untrusted completion contract; email proof remains a separate canonical challenge. */
export const whatsAppRegistrationFormSchema =
  whatsAppFlowSubmissionSchemas.registration
    .omit({ form_kind: true, form_version: true })
    .extend({ legalVersion: z.string().min(1).max(64) })
    .strict()

type Config = { phoneNumberId: string; accessToken: string }
type Dependencies = {
  db: PrismaClient
  env: Record<string, string | undefined>
  provider: Pick<WhatsAppProvider, "sendText"> &
    Partial<Pick<WhatsAppProvider, "sendFlow">>
  now(): Date
  legal?: typeof getWhatsAppOnboardingLegal
  submit?: (
    event: NormalizedWhatsAppMessageEvent,
    config: Config,
    form: WhatsAppOnboardingSignup & { email: string },
  ) => Promise<unknown>
}
/** Registration shares the bounded send policy without changing the OTP provider. */
export function createWhatsAppRegistrationFlowProvider(
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
function dependencies(injected?: Dependencies): Dependencies {
  return (
    injected ?? {
      db: prisma,
      env: process.env,
      provider: createWhatsAppRegistrationFlowProvider(),
      now: () => new Date(),
    }
  )
}
function digest(env: Dependencies["env"], value: string) {
  const secret = env.BETTER_AUTH_SECRET ?? env.AUTH_SECRET
  if (!secret) throw new Error("Authentication secret is required")
  return createHmac("sha256", secret).update(`${kind}:${value}`).digest("hex")
}
function currentToken(
  address: WhatsAppOnboardingAddress,
  env: Dependencies["env"],
) {
  return `wa-flow_native_${digest(env, `${address.phoneNumberId}:${address.senderId}`)}`
}
function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}
function addressOf(
  event: NormalizedWhatsAppMessageEvent,
): WhatsAppOnboardingAddress {
  return {
    phoneNumberId: event.phoneNumberId,
    senderId: event.externalCustomerId,
  }
}
function fresh(
  event: NormalizedWhatsAppMessageEvent,
  config: Config,
  now: Date,
) {
  const timestamp =
    event.timestamp && /^\d{1,13}$/.test(event.timestamp)
      ? Number(event.timestamp) * 1000
      : Number.NaN
  return (
    config.phoneNumberId === event.phoneNumberId &&
    /^\d{1,32}$/.test(event.phoneNumberId) &&
    /^[1-9]\d{7,14}$/.test(event.externalCustomerId) &&
    Boolean(event.messageId) &&
    event.messageId.length <= 256 &&
    Number.isFinite(timestamp) &&
    timestamp > now.getTime() - 24 * 60 * 60_000 &&
    timestamp <= now.getTime() + 5 * 60_000
  )
}
async function inform(
  deps: Dependencies,
  event: NormalizedWhatsAppMessageEvent,
  config: Config,
  body: string,
) {
  await deps.provider
    .sendText({
      ...config,
      to: event.externalCustomerId,
      body: presentWhatsAppMessage(body, { family: "account" }),
    })
    .catch(() => {})
}

/** Optional configured form; absence falls through to the complete typed signup. */
export async function tryLaunchWhatsAppRegistrationFlow(
  event: NormalizedWhatsAppMessageEvent,
  config: Config,
  injected?: Dependencies,
): Promise<boolean> {
  if (
    !/^(?:REGISTER|REGISTER FORM|OPEN REGISTRATION FORM)$/i.test(
      event.text?.trim() ?? "",
    )
  )
    return false
  const deps = dependencies(injected)
  const now = deps.now()
  if (!fresh(event, config, now)) return true
  const flowId = deps.env.ASSISTANT_WHATSAPP_FLOW_REGISTRATION_ID
  const legal = (deps.legal ?? getWhatsAppOnboardingLegal)(deps.env)
  if (
    !flowId ||
    !/^\d{1,64}$/.test(flowId) ||
    !deps.provider.sendFlow ||
    !legal
  )
    return false
  const address = addressOf(event)
  const token = currentToken(address, deps.env)
  const receipt = `wa-flow_native_launch_${digest(deps.env, `${token}:${event.messageId}`)}`
  const flowToken = `wareg_${randomBytes(32).toString("base64url")}`
  const expiresAt = now.getTime() + lifetimeMs
  const claimed = await runInOwnSerializableTransaction(deps.db, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${token}))`
    if (await tx.onboardingSession.findUnique({ where: { token: receipt } }))
      return "duplicate" as const
    const linked = await tx.assistantWhatsAppGrant.findFirst({
      where: {
        revokedAt: null,
        expiresAt: { gt: now },
        idleExpiresAt: { gt: now },
        identity: { ...address, revokedAt: null },
      },
      select: { id: true },
    })
    if (linked) return "linked" as const
    await tx.onboardingSession.create({
      data: {
        token: receipt,
        formData: json({
          kind,
          messageId: event.messageId,
          status: "LAUNCH_STARTED",
        }),
        expiresAt: new Date(now.getTime() + 24 * 60 * 60_000),
      },
    })
    const data = {
      formData: json({
        kind,
        ...address,
        tokenDigest: digest(deps.env, flowToken),
        legalVersion: legal.version,
        expiresAt,
        status: "LAUNCH_STARTED",
      }),
      expiresAt: new Date(expiresAt),
      completed: false,
    }
    await tx.onboardingSession.upsert({
      where: { token },
      create: { token, ...data },
      update: data,
    })
    return "claimed" as const
  })
  if (claimed === "linked") return false
  if (claimed === "duplicate") return true
  await cancelWhatsAppOnboarding(address, deps.db, deps.env)
  let status: "OPEN" | "UNKNOWN" = "UNKNOWN"
  try {
    await deps.provider.sendFlow({
      ...config,
      to: address.senderId,
      flowId,
      flowToken,
      screen: whatsAppFlowFirstScreen.registration,
      cta: "Create account",
      body: presentWhatsAppMessage(
        `Create your EwaTrade account. Nothing is created until you verify your email after the form. Never send a password.\n\nTerms: ${legal.termsUrl}\nPrivacy: ${legal.privacyUrl}\n\nReply CANCEL to stop, or REGISTER CHAT to use messages instead.`,
        { family: "account", maxUnits: 1024 },
      ),
      data: {
        scope_label:
          "Create an EwaTrade account. Nothing is created before email verification.",
        countries: COUNTRIES.map((country) => ({
          id: country.code,
          title: country.name,
        })),
        currencies: OPERATING_CURRENCIES.map((currency) => ({
          id: currency.code,
          title: currency.label,
        })),
      },
      callbackData: `wa-registration:${digest(deps.env, receipt)}`,
    })
    status = "OPEN"
  } catch {
    // Meta offers no send-idempotency key. Never automatically resend an ambiguous launch.
  }
  await runInOwnSerializableTransaction(deps.db, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${token}))`
    const row = await tx.onboardingSession.findUnique({ where: { token } })
    const parsed = recordSchema.safeParse(row?.formData)
    if (
      parsed.success &&
      parsed.data.tokenDigest === digest(deps.env, flowToken) &&
      parsed.data.status === "LAUNCH_STARTED"
    )
      await tx.onboardingSession.update({
        where: { token },
        data: { formData: json({ ...parsed.data, status }) },
      })
  })
  return true
}

/** Matching token is consumed once; duplicate delivery resumes only the same canonical message receipt. */
export async function handleWhatsAppRegistrationFlowReturn(
  event: NormalizedWhatsAppMessageEvent,
  config: Config,
  injected?: Dependencies,
): Promise<boolean> {
  const response = event.flowResponse
  if (
    !response ||
    response.status !== "valid" ||
    !response.flowToken.startsWith("wareg_")
  )
    return false
  const deps = dependencies(injected)
  const now = deps.now()
  if (!fresh(event, config, now)) return true
  const address = addressOf(event)
  const token = currentToken(address, deps.env)
  const legal = (deps.legal ?? getWhatsAppOnboardingLegal)(deps.env)
  const { form_kind, form_version, ...fields } = response.data
  const underAge =
    form_kind === "registration" &&
    form_version === "1" &&
    fields.ageBand === "UNDER_13"
  const form = whatsAppRegistrationFormSchema.safeParse(
    form_kind === "registration" && form_version === "1"
      ? { ...fields, legalVersion: legal?.version }
      : null,
  )
  const claimed = await runInOwnSerializableTransaction(deps.db, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${token}))`
    const row = await tx.onboardingSession.findUnique({ where: { token } })
    const parsed = recordSchema.safeParse(row?.formData)
    if (
      !parsed.success ||
      !row ||
      row.expiresAt <= now ||
      parsed.data.expiresAt <= now.getTime() ||
      parsed.data.senderId !== address.senderId ||
      parsed.data.phoneNumberId !== address.phoneNumberId ||
      !legal ||
      parsed.data.legalVersion !== legal.version ||
      (!form.success && !underAge)
    )
      return "rejected" as const
    const actual = digest(deps.env, response.flowToken)
    if (
      !timingSafeEqual(
        Buffer.from(actual),
        Buffer.from(parsed.data.tokenDigest),
      )
    )
      return "rejected" as const
    if (parsed.data.status === "COMPLETE") return "duplicate" as const
    if (parsed.data.status === "CANCELLED") return "rejected" as const
    if (
      parsed.data.returnMessageId &&
      parsed.data.returnMessageId !== event.messageId
    )
      return "duplicate" as const
    const linked = await tx.assistantWhatsAppGrant.findFirst({
      where: {
        revokedAt: null,
        expiresAt: { gt: now },
        idleExpiresAt: { gt: now },
        identity: { ...address, revokedAt: null },
      },
      select: { id: true },
    })
    if (linked) return "rejected" as const
    await tx.onboardingSession.update({
      where: { token },
      data: {
        formData: json({
          ...parsed.data,
          status: underAge ? "COMPLETE" : "RETURN_PENDING",
          returnMessageId: event.messageId,
        }),
      },
    })
    return "claimed" as const
  })
  if (claimed !== "claimed") {
    if (claimed === "rejected") {
      const receiptToken = `wa-flow_native_return_${digest(deps.env, `${token}:${event.messageId}`)}`
      const send = await runInOwnSerializableTransaction(
        deps.db,
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${token}))`
          if (
            await tx.onboardingSession.findUnique({
              where: { token: receiptToken },
            })
          )
            return false
          // Record the outbound attempt before provider I/O; never resend an uncertain recovery message.
          await tx.onboardingSession.create({
            data: {
              token: receiptToken,
              formData: json({ kind, status: "REJECTED" }),
              expiresAt: new Date(now.getTime() + 24 * 60 * 60_000),
            },
          })
          return true
        },
      )
      if (send)
        await inform(
          deps,
          event,
          config,
          "That form expired, was cancelled, or its details changed. Nothing was created from this response. Send REGISTER to start again, REGISTER CHAT to use messages, or CONNECT for an existing account.",
        )
    }
    return true
  }
  if (underAge) {
    await cancelWhatsAppOnboarding(address, deps.db, deps.env)
    await inform(
      deps,
      event,
      config,
      "You need to be 13 or older to use EwaTrade. Nothing was created, and your unfinished registration details were cleared.",
    )
  } else if (form.success) {
    if (deps.submit) await deps.submit(event, config, form.data)
    else
      await processWhatsAppOnboardingMessage(event, config, undefined, {
        signupForm: form.data,
        registrationToken: token,
      })
  }
  await runInOwnSerializableTransaction(deps.db, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${token}))`
    const row = await tx.onboardingSession.findUnique({ where: { token } })
    const parsed = recordSchema.safeParse(row?.formData)
    if (
      parsed.success &&
      parsed.data.returnMessageId === event.messageId &&
      parsed.data.status === "RETURN_PENDING"
    )
      await tx.onboardingSession.update({
        where: { token },
        data: {
          completed: true,
          formData: json({ ...parsed.data, status: "COMPLETE" }),
        },
      })
  })
  return true
}

/** STOP/CANCEL invalidate form authority without touching phone OTP or business records. */
export async function cancelWhatsAppRegistrationFlow(
  address: WhatsAppOnboardingAddress,
  injected?: Dependencies,
): Promise<void> {
  const deps = dependencies(injected)
  const token = currentToken(address, deps.env)
  await runInOwnSerializableTransaction(deps.db, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${token}))`
    const row = await tx.onboardingSession.findUnique({ where: { token } })
    const parsed = recordSchema.safeParse(row?.formData)
    if (parsed.success)
      await tx.onboardingSession.update({
        where: { token },
        data: {
          completed: true,
          formData: json({ ...parsed.data, status: "CANCELLED" }),
        },
      })
  })
}
