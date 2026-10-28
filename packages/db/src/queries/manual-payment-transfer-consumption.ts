import { manualTransferIdentity } from "@ewatrade/payments/manual-transfer-identity"
import { ManualPaymentError } from "@ewatrade/utils/manual-payments"
import type { Prisma } from "../../generated/prisma/client"

export type ConsumeManualTransferInput = {
  tenantId: string
  reportId: string
  currencyCode: string
  receivingAccountId: string
  receivingAccountNumber: string
  namespace: string
  rawReference: string
  amountMinor: number
  receivedAt: Date
  validatedByUserId: string
  bankCheckAttested: boolean
}

/** Join the canonical funds transaction AFTER Book/Customer/Order/Report locks. */
export async function consumeManualTransferInTransaction(
  tx: Prisma.TransactionClient,
  input: ConsumeManualTransferInput,
) {
  if (
    input.bankCheckAttested !== true ||
    !input.validatedByUserId ||
    !Number.isSafeInteger(input.amountMinor) ||
    input.amountMinor <= 0 ||
    !Number.isFinite(input.receivedAt.getTime()) ||
    input.receivedAt > new Date()
  )
    throw new ManualPaymentError(
      "BAD_REQUEST",
      "Confirm the actual bank receipt before recording this transfer.",
    )
  const account = await tx.financeAccount.findFirst({
    where: {
      id: input.receivingAccountId,
      purpose: "BANK",
      book: { tenantId: input.tenantId },
    },
    select: { bankAccountNumber: true },
  })
  if (
    !account?.bankAccountNumber ||
    account.bankAccountNumber !== input.receivingAccountNumber
  )
    throw new ManualPaymentError(
      "BAD_REQUEST",
      "The actual receiving bank instructions are required.",
    )
  let identity: ReturnType<typeof manualTransferIdentity>
  try {
    identity = manualTransferIdentity(input)
  } catch {
    throw new ManualPaymentError(
      "BAD_REQUEST",
      "Enter the validated bank transfer identity.",
    )
  }
  const {
    bankCheckAttested: _attested,
    receivingAccountNumber: _rail,
    ...facts
  } = input
  await tx.manualPaymentTransferConsumption.createMany({
    data: {
      ...facts,
      identityDigest: identity.identityDigest,
      normalizedReference: identity.normalizedReference,
    },
    skipDuplicates: true,
  })
  const saved = await tx.manualPaymentTransferConsumption.findUnique({
    where: {
      tenantId_identityDigest: {
        tenantId: input.tenantId,
        identityDigest: identity.identityDigest,
      },
    },
  })
  if (
    !saved ||
    saved.reportId !== input.reportId ||
    saved.amountMinor !== input.amountMinor ||
    saved.receivedAt.getTime() !== input.receivedAt.getTime()
  )
    throw new ManualPaymentError(
      "CONFLICT",
      "This bank transfer was already used. Review the existing bank receipt.",
    )
  return saved
}
