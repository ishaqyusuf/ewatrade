import type { Prisma } from "../../generated/prisma/client"
import {
  AccountAgeBand,
  type StoreConversationGuestCredentialPurpose,
} from "../../generated/prisma/enums"
import {
  StoreConversationError,
  resolveStoreConversationGuestCredential,
} from "./store-conversations-core"
import type { DbClient } from "./types"

const isEligibleAge = (band: AccountAgeBand | null | undefined) =>
  band === AccountAgeBand.AGE_13_TO_15 ||
  band === AccountAgeBand.AGE_16_TO_17 ||
  band === AccountAgeBand.ADULT

function assertDeclarableAgeBand(band: AccountAgeBand) {
  if (isEligibleAge(band)) return
  throw new StoreConversationError(
    "CONFLICT",
    "Choose an eligible age range before continuing.",
  )
}

export async function declareCustomerAccountAgeBand(
  db: DbClient,
  userId: string,
  band: AccountAgeBand,
) {
  assertDeclarableAgeBand(band)
  const now = new Date()
  const updated = await db.user.updateMany({
    data: { ageBand: band, ageDeclaredAt: now },
    where: { id: userId, ageBand: AccountAgeBand.UNDECLARED },
  })
  if (updated.count === 1) return { ageBand: band, ageDeclaredAt: now }
  const existing = await db.user.findUnique({
    select: { ageBand: true, ageDeclaredAt: true },
    where: { id: userId },
  })
  if (existing?.ageBand === band && existing.ageDeclaredAt) return existing
  throw new StoreConversationError(
    "CONFLICT",
    "This account's age range is already set. Contact support if it needs correction.",
  )
}

export async function declareGuestAgeBand(
  db: DbClient,
  guestIdentityId: string,
  band: AccountAgeBand,
) {
  assertDeclarableAgeBand(band)
  const now = new Date()
  const updated = await db.storeConversationGuestIdentity.updateMany({
    data: { ageBand: band, ageDeclaredAt: now },
    where: { id: guestIdentityId, ageBand: AccountAgeBand.UNDECLARED },
  })
  if (updated.count === 1) return { ageBand: band, ageDeclaredAt: now }
  const existing = await db.storeConversationGuestIdentity.findUnique({
    select: { ageBand: true, ageDeclaredAt: true },
    where: { id: guestIdentityId },
  })
  if (existing?.ageBand === band && existing.ageDeclaredAt) return existing
  throw new StoreConversationError(
    "CONFLICT",
    "This Guest age range is already set. Contact support if it needs correction.",
  )
}

export async function declareGuestAgeBandForCredential(
  db: DbClient,
  input: {
    credentialToken: string
    installationToken?: string
    purpose: StoreConversationGuestCredentialPurpose
    ageBand: AccountAgeBand
  },
) {
  const credential = await resolveStoreConversationGuestCredential(db, {
    credentialToken: input.credentialToken,
    installationToken: input.installationToken,
    purpose: input.purpose,
    now: new Date(),
  })
  return declareGuestAgeBand(db, credential.guestIdentityId, input.ageBand)
}

export async function getCustomerAccountAgeStatus(
  db: DbClient,
  userId: string,
) {
  const user = await db.user.findUnique({
    select: { ageBand: true },
    where: { id: userId },
  })
  if (!user) {
    throw new StoreConversationError(
      "NOT_FOUND",
      "This account is unavailable.",
    )
  }
  return { ageBand: user.ageBand, eligible: isEligibleAge(user.ageBand) }
}

export async function getGuestAgeStatusForCredential(
  db: DbClient,
  input: {
    credentialToken: string
    installationToken?: string
    purpose: StoreConversationGuestCredentialPurpose
  },
) {
  const credential = await resolveStoreConversationGuestCredential(db, {
    ...input,
    now: new Date(),
  })
  const guest = await db.storeConversationGuestIdentity.findUnique({
    select: { ageBand: true },
    where: { id: credential.guestIdentityId },
  })
  if (!guest) {
    throw new StoreConversationError("NOT_FOUND", "This Guest is unavailable.")
  }
  return { ageBand: guest.ageBand, eligible: isEligibleAge(guest.ageBand) }
}

function assertEligibleAge(band: AccountAgeBand | null | undefined) {
  if (isEligibleAge(band)) return
  throw new StoreConversationError(
    "NOT_READY",
    "Store messages require an eligible age declaration.",
  )
}

export async function assertCustomerAccountAgeAuthority(
  db: Prisma.TransactionClient,
  userId: string,
) {
  const user = await db.user.findUnique({
    select: { ageBand: true },
    where: { id: userId },
  })
  assertEligibleAge(user?.ageBand)
}

export async function assertGuestAgeAuthority(
  db: Prisma.TransactionClient,
  guestIdentityId: string,
) {
  const guest = await db.storeConversationGuestIdentity.findUnique({
    select: { ageBand: true },
    where: { id: guestIdentityId },
  })
  assertEligibleAge(guest?.ageBand)
}
