import { createHash, createHmac, timingSafeEqual } from "node:crypto"
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => `${JSON.stringify(key)}:${canonicalJson(v)}`)
      .join(",")}}`
  return JSON.stringify(value)
}
export const proposalDigest = (value: unknown) =>
  createHash("sha256").update(canonicalJson(value)).digest("hex")
export type ApprovalBinding = {
  id: string
  revision: number
  payloadHash: string
  tenantId: string
  storeId: string
  actorUserId: string
  expiresAt: Date
}
export function proposalApprovalToken(
  proposal: ApprovalBinding,
  secret: string,
) {
  if (secret.length < 32)
    throw new Error("Assistant approval signing key is unavailable")
  return createHmac("sha256", secret)
    .update(
      canonicalJson({
        id: proposal.id,
        revision: proposal.revision,
        payloadHash: proposal.payloadHash,
        tenantId: proposal.tenantId,
        storeId: proposal.storeId,
        actorUserId: proposal.actorUserId,
        expiresAt: proposal.expiresAt.toISOString(),
      }),
    )
    .digest("base64url")
}
export function isProposalApprovalValid(
  proposal: ApprovalBinding & { approvalTokenHash: string },
  token: string,
  secret: string,
  now = new Date(),
) {
  if (proposal.expiresAt <= now || secret.length < 32 || token.length > 128)
    return false
  const expected = proposalApprovalToken(proposal, secret)
  const received = Buffer.from(token)
  const wanted = Buffer.from(expected)
  return (
    received.length === wanted.length &&
    timingSafeEqual(received, wanted) &&
    proposalDigest(token) === proposal.approvalTokenHash
  )
}
