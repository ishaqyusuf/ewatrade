import type { SetupBusinessContext } from "@ewatrade/assistant/setup/tools"
import {
  type AssistantScope,
  readSetupBusinessFacts,
} from "@ewatrade/db/assistant"
import {
  findBusinessProfile,
  readBusinessOnboardingFactsFromStoreMetadata,
} from "@ewatrade/utils/business-profiles"
import { TRPCError } from "@trpc/server"
import type { TRPCContext } from "../trpc/init"

/**
 * Per business, per 30 days. Measured (S06-03): a complete four-area setup is
 * about 6 turns and 65k-105k tokens, so turns are the binding limit (about 10
 * setups); 1M tokens costs at most about $0.30 uncached at DeepSeek peak.
 */
export const SETUP_BUDGET_LIMITS = {
  maxRequests: 60,
  maxTokens: 1_000_000,
  windowMs: 30 * 24 * 60 * 60 * 1000,
}

export function isSetupAssistantEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  return environment.ASSISTANT_SETUP_ENABLED === "true"
}

/**
 * Photos, files and voice notes in the setup chat. Off by default: reading
 * them needs OpenAI, so the owner types until this is switched on.
 */
export function isSetupAssistantMediaEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  return environment.ASSISTANT_SETUP_MEDIA_ENABLED === "true"
}

export const SETUP_MEDIA_DISABLED = {
  code: "MEDIA_DISABLED",
  message:
    "Photos, files and voice notes are switched off for now. Type your message instead.",
} as const

/** Refuses uploads when media is off, whatever the UI shows. */
export function isAssistantVoiceEnabled() {
  return process.env.ASSISTANT_VOICE_ENABLED === "true"
}

export function requireSetupAssistantMedia(kind?: string) {
  if (
    !(kind === "AUDIO"
      ? isAssistantVoiceEnabled()
      : isSetupAssistantMediaEnabled())
  )
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: SETUP_MEDIA_DISABLED.message,
    })
}

type ProtectedContext = TRPCContext & {
  session: NonNullable<TRPCContext["session"]>
  tenantContext: NonNullable<TRPCContext["tenantContext"]>
}

/** Owners and admins of the active Store only; the flag is checked server-side. */
export function requireSetupAssistantScope(
  ctx: ProtectedContext,
): AssistantScope & {
  dataClassification: "LIVE" | "QA"
} {
  if (!isSetupAssistantEnabled())
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "The setup assistant is not available.",
    })
  const { tenantContext } = ctx
  if (!["OWNER", "ADMIN"].includes(tenantContext.membership.role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Only the business owner or an admin can use the setup assistant.",
    })
  const store = tenantContext.activeStore
  if (!store)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Choose a Store before setting up your business.",
    })
  return {
    tenantId: tenantContext.tenant.id,
    storeId: store.id,
    userId: ctx.session.user.id,
    dataClassification: tenantContext.tenant.dataClassification,
  }
}

export async function loadSetupBusinessContext(
  db: TRPCContext["db"],
  scope: AssistantScope,
) {
  const facts = await readSetupBusinessFacts(db, scope)
  const onboarding = readBusinessOnboardingFactsFromStoreMetadata(
    facts.storeMetadata,
  )
  const profile = findBusinessProfile(onboarding?.businessProfileKey)
  const context: SetupBusinessContext = {
    businessName: facts.businessName,
    storeName: facts.storeName,
    businessProfile: profile
      ? { key: profile.key, title: profile.title }
      : null,
    operatingModel: onboarding?.operatingModel ?? null,
    orderChannels: onboarding?.orderChannels ?? [],
    currencyCode: facts.currencyCode,
    countryCode: facts.countryCode,
    existing: facts.existing,
    mediaEnabled: isSetupAssistantMediaEnabled(),
  }
  return { context, firstName: facts.firstName }
}
