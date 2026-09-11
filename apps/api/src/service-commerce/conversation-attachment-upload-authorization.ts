import { createHash, createHmac, timingSafeEqual } from "node:crypto"

import { storeConversationAttachmentTargetSchema } from "@ewatrade/service-commerce"
import { z } from "zod"

const DEVELOPMENT_SECRET =
  "ewatrade-development-store-conversation-attachment-upload-v1"
const AUTHORIZATION_LIFETIME_MS = 60_000

const payloadSchema = z
  .object({
    channel: z.enum(["mobile", "web"]),
    conversationId: z.string().trim().min(1).max(191),
    credentialDigest: z.string().length(64),
    expiresAt: z.string().datetime(),
    installationDigest: z.string().length(64).nullable(),
    publicToken: z.string().trim().min(32).max(200),
    target: storeConversationAttachmentTargetSchema,
    version: z.literal(1),
  })
  .strict()

function secret() {
  const configured =
    process.env.STORE_CONVERSATION_ATTACHMENT_CAPABILITY_SECRET?.trim()
  if (configured) return configured
  if (
    process.env.NODE_ENV === "production" ||
    process.env.APP_ENV === "production"
  ) {
    throw new Error(
      "STORE_CONVERSATION_ATTACHMENT_CAPABILITY_SECRET must be configured in production.",
    )
  }
  return DEVELOPMENT_SECRET
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function signature(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url")
}

export type StoreConversationAttachmentUploadAuthorization = z.infer<
  typeof payloadSchema
>

export function issueStoreConversationAttachmentUploadAuthorization(input: {
  channel: "mobile" | "web"
  conversationId: string
  credentialToken: string
  installationToken?: string
  now?: Date
  publicToken: string
  target: z.infer<typeof storeConversationAttachmentTargetSchema>
}) {
  const expiresAt = new Date(
    (input.now ?? new Date()).getTime() + AUTHORIZATION_LIFETIME_MS,
  )
  const payload = Buffer.from(
    JSON.stringify({
      channel: input.channel,
      conversationId: input.conversationId,
      credentialDigest: digest(input.credentialToken),
      expiresAt: expiresAt.toISOString(),
      installationDigest: input.installationToken
        ? digest(input.installationToken)
        : null,
      publicToken: input.publicToken,
      target: input.target,
      version: 1,
    }),
  ).toString("base64url")
  return {
    expiresAt,
    token: `sca-upload1.${payload}.${signature(payload)}`,
  }
}

export function verifyStoreConversationAttachmentUploadAuthorization(input: {
  channel: "mobile" | "web"
  credentialToken: string
  installationToken?: string
  now?: Date
  token: string
}): StoreConversationAttachmentUploadAuthorization {
  const [prefix, payload, receivedSignature, extra] = input.token.split(".")
  if (prefix !== "sca-upload1" || !payload || !receivedSignature || extra) {
    throw new Error("INVALID_ATTACHMENT_UPLOAD_AUTHORIZATION")
  }
  const expectedSignature = signature(payload)
  const expected = Buffer.from(expectedSignature)
  const received = Buffer.from(receivedSignature)
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    throw new Error("INVALID_ATTACHMENT_UPLOAD_AUTHORIZATION")
  }
  let decoded: unknown
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
  } catch {
    throw new Error("INVALID_ATTACHMENT_UPLOAD_AUTHORIZATION")
  }
  const parsed = payloadSchema.parse(decoded)
  const credentialMatches = timingSafeEqual(
    Buffer.from(parsed.credentialDigest),
    Buffer.from(digest(input.credentialToken)),
  )
  const expectedInstallation = input.installationToken
    ? digest(input.installationToken)
    : null
  const installationMatches =
    parsed.installationDigest === expectedInstallation &&
    (parsed.installationDigest === null ||
      timingSafeEqual(
        Buffer.from(parsed.installationDigest),
        Buffer.from(expectedInstallation ?? ""),
      ))
  if (
    parsed.channel !== input.channel ||
    !credentialMatches ||
    !installationMatches ||
    new Date(parsed.expiresAt).getTime() <= (input.now ?? new Date()).getTime()
  ) {
    throw new Error("INVALID_ATTACHMENT_UPLOAD_AUTHORIZATION")
  }
  return parsed
}
