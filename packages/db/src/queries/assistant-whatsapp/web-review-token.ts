import { createHmac, timingSafeEqual } from "node:crypto"
import {
  type AssistantReviewLinkSource,
  assistantReviewLinkSourceSchema,
  assistantReviewLinkTokenSchema,
  assistantReviewShortLocatorSchema,
} from "@ewatrade/assistant/channels/review-links"

const domain = "ewatrade.assistant.whatsapp.web-review.v1\n"
const signingKey = () => process.env.ASSISTANT_APPROVAL_SIGNING_KEY ?? ""
const signature = (body: string, secret: string) =>
  createHmac("sha256", secret).update(domain).update(body).digest("base64url")

/** Locator only: no approval credential, business payload, email or browser session. */
export function createAssistantReviewLinkToken(
  source: AssistantReviewLinkSource,
  secret = signingKey(),
) {
  if (Buffer.byteLength(secret) < 32)
    throw Error("Assistant review signing key is unavailable")
  // Schema order makes retry rendering deterministic, independent of caller key order.
  const body = Buffer.from(
    JSON.stringify(assistantReviewLinkSourceSchema.parse(source)),
  ).toString("base64url")
  return assistantReviewLinkTokenSchema.parse(
    `${body}.${signature(body, secret)}`,
  )
}

/** Verify before lookup; expiry and current authorization are checked separately by the caller. */
export function readAssistantReviewLinkToken(
  token: string,
  secret = signingKey(),
): AssistantReviewLinkSource | undefined {
  if (
    Buffer.byteLength(secret) < 32 ||
    !assistantReviewLinkTokenSchema.safeParse(token).success
  )
    return
  const [body, received] = token.split(".")
  if (!body || !received) return
  const expected = Buffer.from(signature(body, secret))
  const actual = Buffer.from(received)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return
  try {
    const decoded = Buffer.from(body, "base64url")
    if (decoded.toString("base64url") !== body) return
    const parsed = assistantReviewLinkSourceSchema.safeParse(
      JSON.parse(decoded.toString("utf8")),
    )
    return parsed.success ? parsed.data : undefined
  } catch {
    return
  }
}

/** Domain-separated, deterministic 128-bit handle for one immutable signed locator. */
export function createAssistantReviewShortLocator(
  token: string,
  secret = signingKey(),
) {
  if (!readAssistantReviewLinkToken(token, secret))
    throw Error("Assistant review locator is invalid")
  const handle = createHmac("sha256", secret)
    .update("ewatrade.assistant.whatsapp.short-review.v1\n")
    .update(token)
    .digest()
    .subarray(0, 16)
    .toString("base64url")
  return assistantReviewShortLocatorSchema.parse(`r_${handle}`)
}

export function assistantReviewShortOutboxId(locator: string) {
  return `wa-review_${assistantReviewShortLocatorSchema.parse(locator).slice(2)}`
}

/** The signed source stays in private durable content, never in the short browser URL. */
export function assistantReviewTokenFromBody(content: string) {
  const href = content.match(/^Review draft: (\S+)$/m)?.[1]
  if (!href) return undefined
  try {
    const parsed = assistantReviewLinkTokenSchema.safeParse(
      new URL(href).searchParams.get("token"),
    )
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}
