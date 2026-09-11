import {
  type StoreConversationSecuritySignals,
  decideStoreConversationSecurity,
} from "@ewatrade/service-commerce"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  StoreConversationSecurityChallengeStatus,
  StoreConversationSecurityDecision,
  StoreConversationSecurityPurpose,
  StoreConversationSecurityScopeKind,
} from "../../generated/prisma/enums"
import { runStoreConversationActionTransaction } from "./store-conversation-action-transaction"
import {
  StoreConversationError,
  digestStoreConversationValue,
} from "./store-conversations-core"
import type { DbClient } from "./types"

const WINDOW_MS = 60_000
const SECURITY_EVIDENCE_TTL_MS = 30 * 24 * 60 * 60 * 1_000

const purposes = {
  action: StoreConversationSecurityPurpose.ACTION,
  bridge: StoreConversationSecurityPurpose.BRIDGE,
  media: StoreConversationSecurityPurpose.MEDIA,
  message: StoreConversationSecurityPurpose.MESSAGE,
  verification: StoreConversationSecurityPurpose.VERIFICATION,
  voice: StoreConversationSecurityPurpose.VOICE,
} as const

const decisions = {
  allow: StoreConversationSecurityDecision.ALLOW,
  challenge: StoreConversationSecurityDecision.CHALLENGE,
  deny: StoreConversationSecurityDecision.DENY,
} as const

type SecurityEvaluationInput = Pick<
  StoreConversationSecuritySignals,
  "bridge" | "media" | "networkRisk" | "verification"
> & {
  actionCost: number
  challengeTokenCandidate: string
  clientOperationId: string
  conversationId?: string
  deviceKey?: string
  networkRiskKey?: string
  principalKey: string
  purpose: keyof typeof purposes
  storeEntryKey?: string
  storeId: string
  tenantId: string
}

type SecurityScope = {
  digest: string
  kind: StoreConversationSecurityScopeKind
}

function scopeDigest(
  purpose: StoreConversationSecurityPurpose,
  kind: StoreConversationSecurityScopeKind,
  value: string,
) {
  return digestStoreConversationValue(`security:${purpose}:${kind}:${value}`)
}

function fixedWindow(now: Date) {
  const windowStartAt = new Date(
    Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS,
  )
  return {
    expiresAt: new Date(windowStartAt.getTime() + WINDOW_MS),
    windowStartAt,
  }
}

function validateSecurityInput(input: SecurityEvaluationInput) {
  if (
    !Number.isInteger(input.actionCost) ||
    input.actionCost < 1 ||
    input.actionCost > 10
  ) {
    throw new StoreConversationError(
      "NOT_READY",
      "Security action cost is unavailable.",
    )
  }
  if (
    input.clientOperationId.trim().length < 8 ||
    input.challengeTokenCandidate.trim().length < 32
  ) {
    throw new StoreConversationError(
      "NOT_READY",
      "Security operation proof is unavailable.",
    )
  }
}

export async function evaluateStoreConversationSecurity(
  db: PrismaClient,
  input: SecurityEvaluationInput,
  options: { now?: Date } = {},
) {
  validateSecurityInput(input)
  const now = options.now ?? new Date()
  const purpose = purposes[input.purpose]
  const principalScopeDigest = scopeDigest(
    purpose,
    StoreConversationSecurityScopeKind.PRINCIPAL,
    input.principalKey,
  )
  const deviceScopeDigest = input.deviceKey
    ? scopeDigest(
        purpose,
        StoreConversationSecurityScopeKind.DEVICE,
        input.deviceKey,
      )
    : null
  const storeEntryScopeDigest = input.storeEntryKey
    ? scopeDigest(
        purpose,
        StoreConversationSecurityScopeKind.STORE_ENTRY,
        input.storeEntryKey,
      )
    : null
  const storeScopeDigest = scopeDigest(
    purpose,
    StoreConversationSecurityScopeKind.STORE,
    input.storeId,
  )
  const networkScopeDigest = input.networkRiskKey
    ? scopeDigest(
        purpose,
        StoreConversationSecurityScopeKind.NETWORK,
        input.networkRiskKey,
      )
    : null
  const tenantScopeDigest = digestStoreConversationValue(
    `security:tenant:${input.tenantId}`,
  )
  const conversationScopeDigest = input.conversationId
    ? digestStoreConversationValue(
        `security:conversation:${input.conversationId}`,
      )
    : null
  const operationDigest = digestStoreConversationValue(
    [
      "security-operation",
      purpose,
      principalScopeDigest,
      input.clientOperationId,
    ].join(":"),
  )
  const proofDigest = digestStoreConversationValue(
    input.challengeTokenCandidate,
  )
  const window = fixedWindow(now)

  return runStoreConversationActionTransaction(db, async (tx) => {
    const replay = await tx.storeConversationSecurityEvent.findUnique({
      include: { challenge: true },
      where: { operationDigest },
    })
    if (replay) {
      if (replay.challenge && replay.challenge.proofDigest !== proofDigest) {
        throw new StoreConversationError(
          "CONFLICT",
          "This security operation does not match the original request.",
        )
      }
      return {
        challenge: replay.challenge
          ? {
              expiresAt: replay.challenge.expiresAt,
              id: replay.challenge.id,
              proofToken: input.challengeTokenCandidate,
            }
          : null,
        decision: replay.decision.toLowerCase() as
          | "allow"
          | "challenge"
          | "deny",
        reason: replay.reasonCode,
        replayed: true,
      }
    }

    const scopes: SecurityScope[] = [
      {
        digest: principalScopeDigest,
        kind: StoreConversationSecurityScopeKind.PRINCIPAL,
      },
      ...(deviceScopeDigest
        ? [
            {
              digest: deviceScopeDigest,
              kind: StoreConversationSecurityScopeKind.DEVICE,
            },
          ]
        : []),
      ...(storeEntryScopeDigest
        ? [
            {
              digest: storeEntryScopeDigest,
              kind: StoreConversationSecurityScopeKind.STORE_ENTRY,
            },
          ]
        : []),
      {
        digest: storeScopeDigest,
        kind: StoreConversationSecurityScopeKind.STORE,
      },
      ...(networkScopeDigest
        ? [
            {
              digest: networkScopeDigest,
              kind: StoreConversationSecurityScopeKind.NETWORK,
            },
          ]
        : []),
    ].sort((left, right) => left.kind.localeCompare(right.kind))

    const counts = new Map<StoreConversationSecurityScopeKind, number>()
    for (const scope of scopes) {
      const counter = await tx.storeConversationSecurityWindow.upsert({
        create: {
          count: 1,
          expiresAt: window.expiresAt,
          purpose,
          scopeDigest: scope.digest,
          scopeKind: scope.kind,
          weightedCost: input.actionCost,
          windowStartAt: window.windowStartAt,
        },
        update: {
          count: { increment: 1 },
          weightedCost: { increment: input.actionCost },
        },
        where: {
          scopeKind_scopeDigest_purpose_windowStartAt: {
            purpose,
            scopeDigest: scope.digest,
            scopeKind: scope.kind,
            windowStartAt: window.windowStartAt,
          },
        },
      })
      counts.set(scope.kind, counter.count)
    }

    const decision = decideStoreConversationSecurity({
      actionCost: input.actionCost,
      bridge: input.bridge,
      deviceCount: counts.get(StoreConversationSecurityScopeKind.DEVICE) ?? 0,
      entryCount:
        counts.get(StoreConversationSecurityScopeKind.STORE_ENTRY) ?? 0,
      media: input.media,
      networkCount: counts.get(StoreConversationSecurityScopeKind.NETWORK) ?? 0,
      networkRisk: input.networkRisk,
      principalCount:
        counts.get(StoreConversationSecurityScopeKind.PRINCIPAL) ?? 0,
      storeCount: counts.get(StoreConversationSecurityScopeKind.STORE) ?? 0,
      verification: input.verification,
    })
    const securityEvent = await tx.storeConversationSecurityEvent.create({
      data: {
        actionCost: input.actionCost,
        conversationScopeDigest,
        decision: decisions[decision.decision],
        deviceScopeDigest,
        expiresAt: new Date(now.getTime() + SECURITY_EVIDENCE_TTL_MS),
        networkScopeDigest,
        operationDigest,
        occurredAt: now,
        principalScopeDigest,
        purpose,
        reasonCode: decision.reason,
        storeEntryScopeDigest,
        storeScopeDigest,
        tenantScopeDigest,
      },
    })
    const challenge =
      decision.decision === "challenge"
        ? await tx.storeConversationSecurityChallenge.create({
            data: {
              expiresAt: new Date(
                now.getTime() + (decision.challengeTtlSeconds ?? 300) * 1_000,
              ),
              principalScopeDigest,
              proofDigest,
              purpose,
              securityEventId: securityEvent.id,
            },
          })
        : null

    return {
      challenge: challenge
        ? {
            expiresAt: challenge.expiresAt,
            id: challenge.id,
            proofToken: input.challengeTokenCandidate,
          }
        : null,
      decision: decision.decision,
      reason: decision.reason,
      replayed: false,
    }
  })
}

export async function approveStoreConversationSecurityChallenge(
  db: DbClient,
  input: {
    challengeId: string
    principalKey: string
    proofToken: string
    purpose: keyof typeof purposes
  },
  options: { now?: Date } = {},
) {
  const now = options.now ?? new Date()
  const purpose = purposes[input.purpose]
  const updated = await db.storeConversationSecurityChallenge.updateMany({
    data: {
      approvedAt: now,
      status: StoreConversationSecurityChallengeStatus.APPROVED,
    },
    where: {
      expiresAt: { gt: now },
      id: input.challengeId,
      principalScopeDigest: scopeDigest(
        purpose,
        StoreConversationSecurityScopeKind.PRINCIPAL,
        input.principalKey,
      ),
      proofDigest: digestStoreConversationValue(input.proofToken),
      purpose,
      status: StoreConversationSecurityChallengeStatus.ISSUED,
    },
  })
  if (updated.count !== 1) {
    throw new StoreConversationError(
      "FORBIDDEN",
      "Security challenge approval is unavailable.",
    )
  }
  return { challengeId: input.challengeId, status: "approved" as const }
}

export async function consumeStoreConversationSecurityChallenge(
  db: DbClient,
  input: {
    challengeId: string
    principalKey: string
    proofToken: string
    purpose: keyof typeof purposes
  },
  options: { now?: Date } = {},
) {
  const now = options.now ?? new Date()
  const purpose = purposes[input.purpose]
  const updated = await db.storeConversationSecurityChallenge.updateMany({
    data: {
      consumedAt: now,
      status: StoreConversationSecurityChallengeStatus.CONSUMED,
    },
    where: {
      expiresAt: { gt: now },
      id: input.challengeId,
      principalScopeDigest: scopeDigest(
        purpose,
        StoreConversationSecurityScopeKind.PRINCIPAL,
        input.principalKey,
      ),
      proofDigest: digestStoreConversationValue(input.proofToken),
      purpose,
      status: StoreConversationSecurityChallengeStatus.APPROVED,
    },
  })
  if (updated.count !== 1) {
    throw new StoreConversationError(
      "FORBIDDEN",
      "Security challenge proof is unavailable.",
    )
  }
  return { challengeId: input.challengeId, status: "consumed" as const }
}
