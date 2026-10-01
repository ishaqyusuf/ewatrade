import { createHash } from "node:crypto"
import {
  PlayRefundReviewResponseError,
  claimPlayRefundReviewResponse,
  inspectPlayRefundReviewResponseCustody,
  isPlayRefundReviewSubmissionEnabled,
  recordPlayRefundReviewResponseOutcome,
  storeOrderDigest,
} from "@ewatrade/db/queries"
import {
  getPlayRefundReviewAccessToken,
  sendPlayRefundReviewRecommendation,
} from "./play-refund-review-provider"
import {
  assertPlayRefundReviewCustodyConfigured,
  decryptPlayPendingRefundToken,
  decryptPlayRefundReviewOrderId,
} from "./play-refund-review-token"
import { requirePlayStorePackage } from "./store-app-identity"

type Db = Parameters<typeof claimPlayRefundReviewResponse>[0]
type Claim = Awaited<ReturnType<typeof claimPlayRefundReviewResponse>>
type Outcome = "CONFIRMED" | "UNCERTAIN"

type SubmissionDependencies = {
  preflight: (env: NodeJS.ProcessEnv) => void
  inspect: (db: Db, responseId: string) => Promise<Claim>
  claim: (
    db: Db,
    responseId: string,
    env: NodeJS.ProcessEnv,
    expected: Claim,
  ) => Promise<Claim>
  record: (db: Db, responseId: string, outcome: Outcome) => Promise<unknown>
  decryptToken: (
    envelope: string,
    keyId: string,
    env: NodeJS.ProcessEnv,
  ) => string
  decryptOrder: (
    envelope: string,
    keyId: string,
    env: NodeJS.ProcessEnv,
  ) => string
  authorize: (env: NodeJS.ProcessEnv) => Promise<string>
  send: (
    input: {
      orderId: string
      pendingRefundToken: string
      preference: Claim["preference"]
      sampleContentProvided: boolean
    },
    env: NodeJS.ProcessEnv,
    accessToken: string,
  ) => Promise<Outcome>
}

const defaults: SubmissionDependencies = {
  preflight: (env) => {
    if (!isPlayRefundReviewSubmissionEnabled(env))
      throw new PlayRefundReviewResponseError("SUBMISSION_DISABLED")
    try {
      requirePlayStorePackage(env.PLAY_PACKAGE_NAME)
      assertPlayRefundReviewCustodyConfigured(env)
    } catch {
      throw new PlayRefundReviewResponseError("SUBMISSION_DISABLED")
    }
  },
  inspect: (db, responseId) =>
    inspectPlayRefundReviewResponseCustody(db, { responseId }),
  claim: (db, responseId, env, expected) =>
    claimPlayRefundReviewResponse(db, { responseId, env, expected }),
  record: (db, responseId, outcome) =>
    recordPlayRefundReviewResponseOutcome(db, { responseId, outcome }),
  decryptToken: decryptPlayPendingRefundToken,
  decryptOrder: decryptPlayRefundReviewOrderId,
  authorize: (env) => getPlayRefundReviewAccessToken({ env }),
  send: (input, env, accessToken) =>
    sendPlayRefundReviewRecommendation(input, { env, accessToken }),
}

/** A claimed response is never retried automatically, including after a crash. */
export async function submitPlayRefundReviewResponse(
  db: Db,
  responseId: string,
  options: {
    env?: NodeJS.ProcessEnv
    dependencies?: SubmissionDependencies
  } = {},
): Promise<{ status: Outcome }> {
  const env = options.env ?? process.env
  const dependencies = options.dependencies ?? defaults
  dependencies.preflight(env)
  const prepared = await dependencies.inspect(db, responseId)
  if (prepared.policyVersion !== env.PLAY_REFUND_REVIEW_RESPONSE_POLICY_VERSION)
    throw new PlayRefundReviewResponseError("CASE_NOT_READY")
  try {
    const token = dependencies.decryptToken(
      prepared.encryptedPendingToken,
      prepared.encryptionKeyId,
      env,
    )
    const order = dependencies.decryptOrder(
      prepared.encryptedOrderId,
      prepared.encryptionKeyId,
      env,
    )
    const tokenDigest = createHash("sha256")
      .update(`play-pending-refund:${token}`)
      .digest("hex")
    if (
      tokenDigest !== prepared.tokenDigest ||
      storeOrderDigest(order) !== prepared.orderDigest
    )
      throw new PlayRefundReviewResponseError("CASE_NOT_READY")
  } catch {
    // An unavailable case key, invalid envelope or mismatched digest must
    // leave the prepared response available; no claim or provider call ran.
    throw new PlayRefundReviewResponseError("CASE_NOT_READY")
  }
  let accessToken: string
  try {
    accessToken = await dependencies.authorize(env)
  } catch {
    // OAuth access failure is not a provider response. Preserve PREPARED.
    throw new PlayRefundReviewResponseError("SUBMISSION_DISABLED")
  }
  const claim = await dependencies.claim(db, responseId, env, prepared)
  let outcome: Outcome = "UNCERTAIN"
  try {
    const pendingRefundToken = dependencies.decryptToken(
      claim.encryptedPendingToken,
      claim.encryptionKeyId,
      env,
    )
    const orderId = dependencies.decryptOrder(
      claim.encryptedOrderId,
      claim.encryptionKeyId,
      env,
    )
    const tokenDigest = createHash("sha256")
      .update(`play-pending-refund:${pendingRefundToken}`)
      .digest("hex")
    if (
      tokenDigest === claim.tokenDigest &&
      storeOrderDigest(orderId) === claim.orderDigest
    ) {
      outcome = await dependencies.send(
        {
          orderId,
          pendingRefundToken,
          preference: claim.preference,
          sampleContentProvided: claim.sampleContentProvided,
        },
        env,
        accessToken,
      )
    }
  } catch {
    // The claim is durable. A decrypt/transport error must never trigger a
    // second provider attempt; leave an explicit uncertain outcome for review.
  }
  await dependencies.record(db, claim.responseId, outcome)
  return { status: outcome }
}
