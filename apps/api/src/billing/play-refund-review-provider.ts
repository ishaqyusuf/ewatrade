import { isPlayRefundReviewSubmissionEnabled } from "@ewatrade/db/queries"
import { getPlayPublisherAccessToken } from "./google-publisher-credentials"
import { requirePlayStorePackage } from "./store-app-identity"

type ReviewPreference = "APPROVE" | "DECLINE" | "NEUTRAL"

type ReviewRequest = {
  orderId: string
  pendingRefundToken: string
  preference: ReviewPreference
  sampleContentProvided: boolean
}

type Transport = {
  accessToken: () => Promise<string | null | undefined>
  send: (url: string, init: RequestInit) => Promise<{ ok: boolean }>
}

export async function getPlayRefundReviewAccessToken(
  options: {
    env?: NodeJS.ProcessEnv
    accessToken?: () => Promise<string | null | undefined>
  } = {},
) {
  const env = options.env ?? process.env
  assertSubmissionEnabled(env)
  requirePlayStorePackage(env.PLAY_PACKAGE_NAME)
  const token = await (
    options.accessToken ?? (() => getPlayPublisherAccessToken(env))
  )()
  if (!token?.trim())
    throw new Error("Play refund-review publisher access is unavailable.")
  return token
}

function assertSubmissionEnabled(env: NodeJS.ProcessEnv) {
  if (!isPlayRefundReviewSubmissionEnabled(env))
    throw new Error("Play refund-review submission is unavailable.")
}

function validateRequest(input: ReviewRequest) {
  if (
    !input.orderId.trim() ||
    input.orderId.length > 256 ||
    !input.pendingRefundToken.trim() ||
    input.pendingRefundToken.length > 8192 ||
    !["APPROVE", "DECLINE", "NEUTRAL"].includes(input.preference) ||
    typeof input.sampleContentProvided !== "boolean"
  )
    throw new Error("Play refund-review request is invalid.")
}

/**
 * One HTTP attempt only. A network error or non-2xx response is uncertain:
 * Google's first response may already be final, so the caller must reconcile
 * with the provider rather than retrying this operation.
 */
export async function sendPlayRefundReviewRecommendation(
  input: ReviewRequest,
  options: {
    env?: NodeJS.ProcessEnv
    transport?: Transport
    accessToken?: string
  } = {},
): Promise<"CONFIRMED" | "UNCERTAIN"> {
  const env = options.env ?? process.env
  assertSubmissionEnabled(env)
  validateRequest(input)
  const packageName = requirePlayStorePackage(env.PLAY_PACKAGE_NAME)
  const transport = options.transport ?? {
    accessToken: () => getPlayPublisherAccessToken(env),
    send: fetch,
  }
  try {
    const token = options.accessToken ?? (await transport.accessToken())
    if (!token?.trim()) return "UNCERTAIN"
    const response = await transport.send(
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/orders/${encodeURIComponent(input.orderId)}:reviewrefund`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pendingRefundToken: input.pendingRefundToken,
          sampleContentProvided: input.sampleContentProvided,
          refundPreference: input.preference,
        }),
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      },
    )
    return response.ok ? "CONFIRMED" : "UNCERTAIN"
  } catch {
    // Do not expose a provider error: its URL or payload may contain custody.
    return "UNCERTAIN"
  }
}
