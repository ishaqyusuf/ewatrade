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

export const SETUP_BUDGET_LIMITS = {
  maxRequests: 60,
  maxTokens: 400_000,
  windowMs: 30 * 24 * 60 * 60 * 1000,
}

export function isSetupAssistantEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  return environment.ASSISTANT_SETUP_ENABLED === "true"
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
    currencyCode: facts.currencyCode,
    countryCode: facts.countryCode,
    existing: facts.existing,
  }
  return { context, firstName: facts.firstName }
}
