import { z } from "zod"
import type { Capability } from "../capabilities/types"
import { classifyCapabilityAction } from "./capability-action-handoff"
import { trustedAssistantAppOrigin } from "./conversation-links"
import {
  assistantWhatsAppPilotTenantIds,
  whatsAppCapabilityEnabled,
  whatsAppChannelPolicy,
} from "./policy"
import { whatsAppWorkflowPolicy } from "./workflow"

export const WHATSAPP_READINESS_VERSION = "whatsapp-readiness-v1"
export const WHATSAPP_EXTERNAL_EVIDENCE_MAX_AGE_MS = 7 * 24 * 60 * 60_000
export const whatsAppReleaseEvidenceGates = [
  "capability_parity",
  "provider_use_case_eligibility",
  "sender_account_and_webhook",
  "current_pricing_and_graph_version",
  "privacy_retention_and_deletion",
  "abuse_recovery_and_window_policy",
  "support_and_opt_out",
  "consented_android_ios_pilot",
  "hosted_verification",
  "target_release_approval",
  "rollback_verification",
] as const
const evidenceGate = z.enum(["not_recorded", "blocked", "verified"])
const environmentSchema = z.enum(["local", "dev", "preview", "production"])
export const whatsAppReleaseEvidenceSchema = z
  .object({
    version: z.literal(1),
    environment: environmentSchema,
    sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    checkedAt: z.iso.datetime(),
    gates: z
      .object(
        Object.fromEntries(
          whatsAppReleaseEvidenceGates.map((gate) => [gate, evidenceGate]),
        ),
      )
      .strict(),
  })
  .strict()
const toggleNames = [
  "ASSISTANT_WHATSAPP_ENABLED",
  "ASSISTANT_WHATSAPP_READS_ENABLED",
  "ASSISTANT_WHATSAPP_WRITES_ENABLED",
  "ASSISTANT_WHATSAPP_MEDIA_ENABLED",
  "ASSISTANT_WHATSAPP_SETUP_ENABLED",
  "ASSISTANT_WHATSAPP_PRODUCT_ENABLED",
  "ASSISTANT_WHATSAPP_WORKFLOW_WRITES_ENABLED",
] as const
const present = (value: string | undefined) => Boolean(value?.trim())

function workerUrlConfigured(value: string | undefined, local: boolean) {
  if (!value) return false
  try {
    const url = new URL(value.trim())
    return (
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.protocol === "https:" ||
        (local &&
          url.protocol === "http:" &&
          url.hostname.endsWith(".localhost")))
    )
  } catch {
    return false
  }
}

/** Logical configuration/evidence only. It never probes a provider or authorizes an operation. */
export function assistantWhatsAppReadiness(input: {
  environment?: Readonly<Record<string, string | undefined>>
  capabilities: readonly Capability[]
  sourceFingerprint: string
  evidence?: unknown
  now?: Date
}) {
  const env = input.environment ?? {}
  const now = input.now ?? new Date()
  const policy = whatsAppChannelPolicy(env)
  const workflow = whatsAppWorkflowPolicy(env)
  const enabled = env.ASSISTANT_WHATSAPP_ENABLED === "true"
  const invalidToggles = toggleNames.filter(
    (name) =>
      env[name] !== undefined &&
      env[name] !== "" &&
      !["true", "false"].includes(env[name] ?? ""),
  ).length
  const pilots = new Set(
    (env.ASSISTANT_WHATSAPP_PILOT_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0 && value.length <= 128),
  )
  const pilotTenants = assistantWhatsAppPilotTenantIds(env)
  const checks = {
    environment: environmentSchema.safeParse(env.APP_ENV).success,
    toggles: invalidToggles === 0,
    sharedOtpSender: /^\d+$/.test(
      env.WHATSAPP_OTP_PHONE_NUMBER_ID?.trim() ?? "",
    ),
    providerCredential: present(env.WHATSAPP_OTP_ACCESS_TOKEN),
    displayNumber: /^[1-9]\d{7,14}$/.test(
      env.ASSISTANT_WHATSAPP_DISPLAY_NUMBER?.trim().replace(/^\+/, "") ?? "",
    ),
    webhookSignatureSecret: present(env.META_APP_SECRET),
    webhookVerificationSecret: present(env.WHATSAPP_WEBHOOK_VERIFY_TOKEN),
    workerAuthentication: present(env.INTERNAL_API_KEY),
    workerEndpoint: workerUrlConfigured(env.API_URL, env.APP_ENV === "local"),
    appOrigin: Boolean(
      trustedAssistantAppOrigin(
        env.DASHBOARD_URL ??
          env.NEXT_PUBLIC_DASHBOARD_URL ??
          "https://dash.ewatrade.com",
      ),
    ),
    approvalSigningKey:
      new TextEncoder().encode(env.ASSISTANT_APPROVAL_SIGNING_KEY ?? "")
        .byteLength >= 32,
    approvalKeyVersion: /^[A-Za-z0-9_-]{1,40}$/.test(
      env.ASSISTANT_APPROVAL_SIGNING_KEY_VERSION ?? "v1",
    ),
    pilotEnrollment: pilots.size > 0,
    pilotTenantEnrollment: pilotTenants.length > 0,
    sourceFingerprint: /^[a-f0-9]{64}$/.test(input.sourceFingerprint),
    sourceWorkflowScope:
      policy.localSource ||
      !(
        env.ASSISTANT_WHATSAPP_SETUP_ENABLED === "true" ||
        env.ASSISTANT_WHATSAPP_PRODUCT_ENABLED === "true" ||
        env.ASSISTANT_WHATSAPP_WORKFLOW_WRITES_ENABLED === "true"
      ),
  }
  const invalid =
    !checks.toggles ||
    (enabled && Object.values(checks).some((value) => !value))
  const evidence = whatsAppReleaseEvidenceSchema.safeParse(input.evidence)
  const checkedAt = evidence.success
    ? Date.parse(evidence.data.checkedAt)
    : Number.NaN
  const evidenceBound =
    evidence.success &&
    checks.sourceFingerprint &&
    Number.isFinite(now.getTime()) &&
    evidence.data.environment === env.APP_ENV &&
    evidence.data.sourceFingerprint === input.sourceFingerprint &&
    checkedAt <= now.getTime() &&
    now.getTime() - checkedAt <= WHATSAPP_EXTERNAL_EVIDENCE_MAX_AGE_MS
  const gates = whatsAppReleaseEvidenceGates.map((id) => ({
    id,
    status:
      evidenceBound && evidence.success
        ? (evidence.data.gates[id] ?? "not_recorded")
        : "not_recorded",
  }))
  const declared = input.capabilities.filter((capability) =>
    capability.clients.includes("whatsapp"),
  )
  return {
    version: WHATSAPP_READINESS_VERSION,
    scope: "logical_configuration_and_recorded_evidence_only" as const,
    configuration: {
      status: invalid
        ? ("invalid" as const)
        : enabled
          ? ("configured" as const)
          : ("disabled" as const),
      checks,
      invalidToggleCount: invalidToggles,
      pilotCount: pilots.size,
      pilotTenantCount: pilotTenants.length,
    },
    flags: {
      channel: enabled,
      reads: policy.reads,
      writes: policy.writes,
      media: policy.media,
      setup: workflow.setup,
      product: workflow.product,
      workflowNativeWrites: workflow.nativeWrites,
      localSource: policy.localSource,
    },
    capabilities: {
      canonical: input.capabilities.length,
      planned: input.capabilities.filter(
        (capability) => capability.rollout === "planned",
      ).length,
      declaredChannel: declared.length,
      nativeEnabled: declared.filter((capability) =>
        whatsAppCapabilityEnabled(capability, env),
      ).length,
      appReviewWrites: input.capabilities.filter(
        (capability) =>
          classifyCapabilityAction(capability, env).kind === "app_review",
      ).length,
    },
    externalEvidence: {
      boundToCurrentSourceAndTarget: Boolean(evidenceBound),
      gates,
      complete: gates.every((gate) => gate.status === "verified"),
    },
    provider: {
      availability: "not_probed" as const,
      monetaryCost: "not_verified" as const,
    },
    release: {
      authorization: "none" as const,
      activationPermitted: false as const,
      deploymentVerified: false as const,
    },
  }
}
