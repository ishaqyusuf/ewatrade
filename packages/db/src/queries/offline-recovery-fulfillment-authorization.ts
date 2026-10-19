import type { OfflineCommand, Prisma } from "../../generated/prisma/client"
import { CatalogError } from "./catalog-errors"
import { readOfflineRecoveryRecord } from "./offline-recovery-record"

type Creation = {
  actorUserId: string
  tenantId: string
  storeId: string
  clientOrderId: string
  fulfillNow?: boolean
}

// Identity is held in memory, never accepted from JSON, stored or barrel-exported.
declare const recoveryAuthorization: unique symbol
export type RecoveryFulfillmentAuthorization = {
  readonly [recoveryAuthorization]: true
}
const issued = new WeakMap<
  RecoveryFulfillmentAuthorization,
  {
    tx: Prisma.TransactionClient
    creation: Creation
    exactInput: string
    reviewerUserId: string
  }
>()

function refuse(): never {
  throw new CatalogError(
    "SERVICE_WORK_NOT_AUTHORIZED",
    "The exact held offline sale requires current Owner or Admin approval.",
  )
}

/** Called only after recovery has locked and validated the command/device/lifecycle. */
export async function authorizeRecoveryFulfillment(
  tx: Prisma.TransactionClient,
  input: {
    command: OfflineCommand
    creation: Creation
    reviewerUserId: string
  },
): Promise<RecoveryFulfillmentAuthorization> {
  const { command, creation, reviewerUserId } = input
  const payload = command.payload as Record<string, unknown>
  if (
    !readOfflineRecoveryRecord(payload) ||
    command.status !== "REVIEW_REQUIRED" ||
    command.tenantId !== creation.tenantId ||
    command.storeId !== creation.storeId ||
    command.clientCommandId !== creation.clientOrderId ||
    payload.actorUserId !== creation.actorUserId ||
    creation.actorUserId === reviewerUserId
  )
    refuse()
  const [reviewer] = await tx.$queryRaw<
    Array<{ role: string; status: string }>
  >`
    SELECT "role", "status" FROM "Membership"
    WHERE "tenantId"=${creation.tenantId} AND "userId"=${reviewerUserId} FOR SHARE
  `
  if (
    reviewer?.status !== "ACTIVE" ||
    !["OWNER", "ADMIN"].includes(reviewer.role)
  )
    refuse()
  const authorization = Object.freeze({}) as RecoveryFulfillmentAuthorization
  issued.set(authorization, {
    tx,
    creation: { ...creation },
    exactInput: JSON.stringify(creation),
    reviewerUserId,
  })
  return authorization
}

/** The optional execution authority is outside the canonical input and its hash. */
export function assertRecoveryCreation(
  tx: Prisma.TransactionClient,
  authorization: RecoveryFulfillmentAuthorization,
  creation: Creation,
) {
  const proof = issued.get(authorization)
  if (
    !proof ||
    proof.tx !== tx ||
    proof.exactInput !== JSON.stringify(creation)
  )
    refuse()
}

export async function recoveryFulfillmentReviewer(
  tx: Prisma.TransactionClient,
  authorization: RecoveryFulfillmentAuthorization,
  input: {
    actorUserId: string
    tenantId: string
    orderId: string
    clientOperationIdPrefix: string
  },
) {
  const proof = issued.get(authorization)
  if (
    !proof ||
    proof.tx !== tx ||
    !proof.creation.fulfillNow ||
    proof.creation.actorUserId !== input.actorUserId ||
    proof.creation.tenantId !== input.tenantId ||
    input.clientOperationIdPrefix !==
      `${proof.creation.clientOrderId}:fulfillment`
  )
    refuse()
  const order = await tx.commercialOrder.findFirst({
    where: {
      id: input.orderId,
      tenantId: proof.creation.tenantId,
      storeId: proof.creation.storeId,
      clientOrderId: proof.creation.clientOrderId,
      createdByUserId: proof.creation.actorUserId,
    },
    select: { id: true },
  })
  if (!order) refuse()
  return proof.reviewerUserId
}
