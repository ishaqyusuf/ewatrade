export const QA_LIVE_EFFECT_OPERATIONS = [
  "destructive",
  "domain_hosting",
  "domain_registration",
  "media_analysis",
  "payment",
  "push",
  "refund",
  "sms",
  "subscription",
  "whatsapp",
] as const

export type QaLiveEffectOperation = (typeof QA_LIVE_EFFECT_OPERATIONS)[number]

export type QaProviderDecision =
  | { allowed: true; receiptKind: "live" | "qa_routed_email" | "test_adapter" }
  | {
      allowed: false
      code: "QA_LIVE_EFFECT_BLOCKED" | "QA_TEST_ADAPTER_REQUIRED"
      message: string
    }

export function evaluateQaProviderPolicy(input: {
  adapter?: "live" | "test"
  operation: QaLiveEffectOperation | "email"
  qaEmailRouted?: boolean
  tenantDataClassification: "LIVE" | "QA"
}): QaProviderDecision {
  if (input.tenantDataClassification === "LIVE") {
    return { allowed: true, receiptKind: "live" }
  }
  if (input.operation === "email" && input.qaEmailRouted) {
    return { allowed: true, receiptKind: "qa_routed_email" }
  }
  if (input.adapter === "test") {
    return { allowed: true, receiptKind: "test_adapter" }
  }
  return {
    allowed: false,
    code:
      input.adapter === "live"
        ? "QA_LIVE_EFFECT_BLOCKED"
        : "QA_TEST_ADAPTER_REQUIRED",
    message:
      "This live provider action is unavailable for QA data. Use a registered test adapter.",
  }
}

export class QaProviderPolicyError extends Error {
  readonly code: "QA_LIVE_EFFECT_BLOCKED" | "QA_TEST_ADAPTER_REQUIRED"

  constructor(decision: Extract<QaProviderDecision, { allowed: false }>) {
    super(decision.message)
    this.code = decision.code
    this.name = "QaProviderPolicyError"
  }
}

export function assertQaProviderAllowed(
  input: Parameters<typeof evaluateQaProviderPolicy>[0],
) {
  const decision = evaluateQaProviderPolicy(input)
  if (!decision.allowed) throw new QaProviderPolicyError(decision)
  return decision
}
