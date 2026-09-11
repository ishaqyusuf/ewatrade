import { z } from "zod"

export type StoreConversationSecuritySignals = {
  actionCost: number
  bridge: "invalid" | "none" | "verified"
  deviceCount: number
  entryCount: number
  media: "malicious" | "none" | "oversized" | "safe"
  networkCount: number
  networkRisk: "elevated" | "high" | "low"
  principalCount: number
  storeCount: number
  verification: "failed" | "unverified" | "verified"
}

export type StoreConversationSecurityDecision = {
  challengeTtlSeconds: 300 | null
  decision: "allow" | "challenge" | "deny"
  reason:
    | "bridge_scope_invalid"
    | "multi_signal_limit_exceeded"
    | "network_scrutiny_required"
    | "unsafe_media"
    | "verification_abuse"
    | "verification_required"
    | "within_bounded_usage"
}

export const storeConversationSecurityChallengeProofSchema = z
  .object({
    challengeId: z.string().trim().min(1).max(191),
    proofToken: z.string().trim().min(32).max(500),
  })
  .strict()

/**
 * Pure policy for one fixed-window Store Conversation security decision.
 * Network evidence can require proof, but can never be the sole deny signal.
 */
export function decideStoreConversationSecurity(
  signals: StoreConversationSecuritySignals,
): StoreConversationSecurityDecision {
  if (signals.media === "malicious" || signals.media === "oversized") {
    return {
      challengeTtlSeconds: null,
      decision: "deny",
      reason: "unsafe_media",
    }
  }
  if (signals.bridge === "invalid") {
    return {
      challengeTtlSeconds: null,
      decision: "deny",
      reason: "bridge_scope_invalid",
    }
  }
  if (signals.verification === "failed" && signals.principalCount >= 5) {
    return {
      challengeTtlSeconds: null,
      decision: "deny",
      reason: "verification_abuse",
    }
  }

  const principalPressure = signals.principalCount * signals.actionCost
  const devicePressure = signals.deviceCount * signals.actionCost
  const entryPressure = signals.entryCount * signals.actionCost
  const storePressure = signals.storeCount * signals.actionCost
  const exceededScopes = [
    principalPressure >= 120,
    devicePressure >= 120,
    entryPressure >= 240,
    storePressure >= 2_000,
  ].filter(Boolean).length
  if (exceededScopes >= 2) {
    return {
      challengeTtlSeconds: null,
      decision: "deny",
      reason: "multi_signal_limit_exceeded",
    }
  }

  if (signals.networkRisk === "high") {
    return {
      challengeTtlSeconds: 300,
      decision: "challenge",
      reason: "network_scrutiny_required",
    }
  }
  if (
    exceededScopes === 1 ||
    (signals.networkRisk === "elevated" &&
      (principalPressure >= 30 || devicePressure >= 30))
  ) {
    return {
      challengeTtlSeconds: 300,
      decision: "challenge",
      reason: "verification_required",
    }
  }
  return {
    challengeTtlSeconds: null,
    decision: "allow",
    reason: "within_bounded_usage",
  }
}
