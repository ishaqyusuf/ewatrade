import { assistantProviderApiKey } from "@ewatrade/ai/provider"
import { capabilityForAction } from "@ewatrade/assistant/capabilities/manifest"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import {
  type GeneralContext,
  canDraftGeneralCapability,
  requireGeneralScope,
} from "./general-context"

export type ReceiptEnvironment = Readonly<Record<string, string | undefined>>
type Environment = ReceiptEnvironment

/** On by default wherever an OpenAI key exists; QA businesses only outside production when allowed. */
export function receiptReadingConfig(env: Environment = process.env) {
  if (env.ASSISTANT_RECEIPT_READING_ENABLED === "false") return null
  const apiKey =
    env.ASSISTANT_RECEIPT_OPENAI_API_KEY?.trim() ||
    env.MANUAL_RECEIPT_OPENAI_API_KEY?.trim() ||
    assistantProviderApiKey("OPENAI", env) ||
    env.CATALOG_IMAGE_OPENAI_API_KEY?.trim()
  if (!apiKey) return null
  const limit = Number(env.ASSISTANT_RECEIPT_DAILY_LIMIT ?? "200")
  return {
    apiKey,
    model: env.ASSISTANT_RECEIPT_MODEL?.trim() || "gpt-4.1-mini",
    dailyLimit: Number.isSafeInteger(limit) && limit >= 0 ? limit : 200,
    qaLive:
      env.ASSISTANT_RECEIPT_QA_LIVE === "true" && env.APP_ENV !== "production",
  }
}

export function receiptReadingAvailable(
  ctx: GeneralContext,
  env: Environment = process.env,
) {
  const config = receiptReadingConfig(env)
  if (!config) return false
  let classification: "LIVE" | "QA"
  try {
    classification = requireGeneralScope(ctx).dataClassification
  } catch {
    return false
  }
  if (classification === "QA" && !config.qaLive) return false
  return [
    "payment_record",
    "money_transfer_simple",
    "expense_record_simple",
  ].some((action) =>
    canDraftGeneralCapability(
      ctx,
      capabilityForAction(action as GeneralAction["action"]),
    ),
  )
}
