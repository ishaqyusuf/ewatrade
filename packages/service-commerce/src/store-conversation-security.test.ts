import { describe, expect, test } from "bun:test"

import {
  decideStoreConversationSecurity,
  storeConversationSecurityChallengeProofSchema,
} from "./store-conversation-security"

const ordinarySignals = {
  actionCost: 1,
  bridge: "none" as const,
  deviceCount: 1,
  entryCount: 1,
  media: "none" as const,
  networkCount: 1,
  networkRisk: "low" as const,
  principalCount: 1,
  storeCount: 1,
  verification: "unverified" as const,
}

describe("Store Conversation security decisions", () => {
  test("allows an ordinary anonymous customer without a challenge", () => {
    expect(decideStoreConversationSecurity(ordinarySignals)).toEqual({
      challengeTtlSeconds: null,
      decision: "allow",
      reason: "within_bounded_usage",
    })
  })

  test("network risk alone can challenge but cannot deny or identify", () => {
    expect(
      decideStoreConversationSecurity({
        ...ordinarySignals,
        networkCount: 10_000,
        networkRisk: "high",
      }),
    ).toEqual({
      challengeTtlSeconds: 300,
      decision: "challenge",
      reason: "network_scrutiny_required",
    })
  })

  test("denies a costly multi-signal burst deterministically", () => {
    expect(
      decideStoreConversationSecurity({
        ...ordinarySignals,
        actionCost: 5,
        deviceCount: 36,
        entryCount: 70,
        principalCount: 36,
      }),
    ).toEqual({
      challengeTtlSeconds: null,
      decision: "deny",
      reason: "multi_signal_limit_exceeded",
    })
  })

  test("denies rejected media before an expensive downstream effect", () => {
    expect(
      decideStoreConversationSecurity({
        ...ordinarySignals,
        media: "malicious",
      }),
    ).toEqual({
      challengeTtlSeconds: null,
      decision: "deny",
      reason: "unsafe_media",
    })
  })

  test("accepts only a bounded opaque one-time challenge proof", () => {
    expect(
      storeConversationSecurityChallengeProofSchema.parse({
        challengeId: "challenge_1",
        proofToken: "p".repeat(32),
      }),
    ).toEqual({ challengeId: "challenge_1", proofToken: "p".repeat(32) })
    expect(() =>
      storeConversationSecurityChallengeProofSchema.parse({
        challengeId: "challenge_1",
        proofToken: "short",
        provider: "captcha-vendor",
      }),
    ).toThrow()
  })
})
