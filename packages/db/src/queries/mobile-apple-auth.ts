import { randomBytes, randomUUID } from "node:crypto"
import type { DbClient } from "./types"
import { verifyMobileSocialIdentity, type MobileGoogleIdentityInput } from "./mobile-auth"

export async function createMobileAppleChallenge(db: DbClient) {
  const now = new Date()
  await db.verification.deleteMany({ where: { identifier: "mobile-apple", expiresAt: { lte: now } } })
  const challenge = await db.verification.create({ data: {
    id: randomUUID(), identifier: "mobile-apple", value: randomBytes(32).toString("hex"),
    expiresAt: new Date(now.getTime() + 5 * 60_000),
  }, select: { id: true, value: true } })
  return { challengeId: challenge.id, nonce: challenge.value }
}

export async function getMobileAppleChallenge(db: DbClient, challengeId: string) {
  return db.verification.findFirst({ where: { id: challengeId, identifier: "mobile-apple", expiresAt: { gt: new Date() } }, select: { value: true } })
}

export async function consumeMobileAppleChallenge(db: DbClient, challengeId: string, nonce: string) {
  const consumed = await db.verification.deleteMany({ where: {
    id: challengeId, identifier: "mobile-apple", value: nonce, expiresAt: { gt: new Date() },
  } })
  if (consumed.count !== 1) throw new Error("Apple sign-in challenge expired or was already used.")
}

export async function verifyMobileAppleIdentity(db: DbClient, input: Omit<MobileGoogleIdentityInput, "email"> & { email?: string; encryptedRefreshToken: string; clientId: string }) {
  const linked = await db.account.findUnique({ where: { provider_providerAccountId: { provider: "apple", providerAccountId: input.providerAccountId } }, select: { user: { select: { email: true } } } })
  const email = linked?.user.email ?? input.email
  if (!email) throw new Error("Apple did not provide an email for this new account. Use email sign-in or reconnect Apple with email access.")
  const session = await verifyMobileSocialIdentity(db, { ...input, email, provider: "apple" })
  await db.account.update({
    where: { provider_providerAccountId: { provider: "apple", providerAccountId: input.providerAccountId } },
    data: { refreshToken: input.encryptedRefreshToken, scope: input.clientId },
  })
  return session
}
