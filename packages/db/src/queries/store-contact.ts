import { normalizeWhatsAppPhone } from "@ewatrade/customer-messages"
import { findCountry } from "@ewatrade/utils/countries"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { runInOwnTransaction } from "./own-transaction"

export type StoreContactFields = {
  supportPhone: string | null
  countryCode: string | null
}
export type StoreContactActor = {
  tenantId: string
  actorUserId: string
  storeId: string
}
export class StoreContactError extends Error {
  constructor(
    readonly code: "FORBIDDEN" | "NOT_FOUND" | "BAD_REQUEST" | "CONFLICT",
    message: string,
  ) {
    super(message)
  }
}

const contactSelect = {
  id: true,
  name: true,
  supportPhone: true,
  countryCode: true,
} satisfies Prisma.StoreSelect

async function lockContactStore(
  tx: Prisma.TransactionClient,
  actor: StoreContactActor,
  write: boolean,
) {
  await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id"=${actor.tenantId} FOR SHARE`
  await tx.$queryRaw`SELECT "id" FROM "Membership" WHERE "tenantId"=${actor.tenantId} AND "userId"=${actor.actorUserId} FOR SHARE`
  const membership = await tx.membership.findFirst({
    where: {
      tenantId: actor.tenantId,
      userId: actor.actorUserId,
      status: "ACTIVE",
      role: { in: ["OWNER", "ADMIN"] },
    },
    select: { tenant: { select: { isActive: true, qaPurgeStartedAt: true } } },
  })
  if (!membership?.tenant.isActive || membership.tenant.qaPurgeStartedAt)
    throw new StoreContactError(
      "FORBIDDEN",
      "Current Owner or Admin access is required to manage Store contact details.",
    )
  if (write)
    await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id"=${actor.storeId} AND "tenantId"=${actor.tenantId} FOR UPDATE`
  else
    await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id"=${actor.storeId} AND "tenantId"=${actor.tenantId} FOR SHARE`
  const store = await tx.store.findFirst({
    where: { id: actor.storeId, tenantId: actor.tenantId, status: "ACTIVE" },
    select: contactSelect,
  })
  if (!store)
    throw new StoreContactError(
      "NOT_FOUND",
      "Store not found for this business.",
    )
  return store
}

function normalizeContact(input: StoreContactFields): StoreContactFields {
  const countryCode = input.countryCode?.trim().toUpperCase() ?? null
  if (countryCode !== null && !findCountry(countryCode))
    throw new StoreContactError("BAD_REQUEST", "Choose a valid country.")
  if (input.supportPhone === null) return { countryCode, supportPhone: null }
  if (typeof input.supportPhone !== "string" || input.supportPhone.length > 80)
    throw new StoreContactError(
      "BAD_REQUEST",
      "Enter a valid contact phone number.",
    )
  const phone = normalizeWhatsAppPhone(
    input.supportPhone,
    countryCode ?? undefined,
  )
  if (!phone)
    throw new StoreContactError(
      "BAD_REQUEST",
      "Enter a valid contact phone number with its country code.",
    )
  return { countryCode, supportPhone: phone.phoneE164 }
}

export function getStoreContact(db: PrismaClient, actor: StoreContactActor) {
  return runInOwnTransaction(db, (tx) => lockContactStore(tx, actor, false))
}

/** Expected original fields fence concurrent edits; an already-applied value is a safe repeat. */
export function updateStoreContact(
  db: PrismaClient,
  actor: StoreContactActor,
  input: StoreContactFields & { expected: StoreContactFields },
) {
  return runInOwnTransaction(db, async (tx) => {
    const current = await lockContactStore(tx, actor, true)
    const desired = normalizeContact(input)
    if (
      current.supportPhone === desired.supportPhone &&
      current.countryCode === desired.countryCode
    )
      return current
    if (
      current.supportPhone !== input.expected.supportPhone ||
      current.countryCode !== input.expected.countryCode
    )
      throw new StoreContactError(
        "CONFLICT",
        "Store contact details changed. Reload before saving.",
      )
    const result = await tx.store.updateMany({
      where: {
        id: actor.storeId,
        tenantId: actor.tenantId,
        status: "ACTIVE",
        supportPhone: input.expected.supportPhone,
        countryCode: input.expected.countryCode,
      },
      data: desired,
    })
    if (result.count !== 1)
      throw new StoreContactError(
        "CONFLICT",
        "Store contact details changed. Reload before saving.",
      )
    return { ...current, ...desired }
  })
}
