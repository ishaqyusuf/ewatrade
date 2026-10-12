import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "../finance/access"
import { FinanceError } from "../finance/rules"

/** Management-only foundation. Source adapters must retain their own store permissions. */
function assertCustomerLedgerAccountInput(
  input: Parameters<typeof ensureCustomerLedgerAccountInTransaction>[1],
) {
  if (!/^[A-Z]{3}$/.test(input.currencyCode))
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Choose an uppercase three-letter account currency.",
    )
}

export async function ensureCustomerLedgerAccount(
  db: PrismaClient,
  input: Parameters<typeof ensureCustomerLedgerAccountInTransaction>[1],
) {
  assertCustomerLedgerAccountInput(input)
  return db.$transaction(
    (tx) => ensureCustomerLedgerAccountInTransaction(tx, input),
    { maxWait: 10_000, timeout: 30_000 },
  )
}

/** Caller owns the transaction; canonical authority, locks and replay remain unchanged. */
export async function ensureCustomerLedgerAccountInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceActor & { customerId: string; currencyCode: string },
) {
  assertCustomerLedgerAccountInput(input)
  await assertFinanceManager(tx, input)
  const customer = await tx.customer.findFirst({
    where: { id: input.customerId, tenantId: input.tenantId },
    select: { id: true },
  })
  if (!customer)
    throw new FinanceError("NOT_FOUND", "Customer not found in this business.")
  const account = await tx.customerLedgerAccount.upsert({
    where: {
      tenantId_customerId_currencyCode: {
        tenantId: input.tenantId,
        customerId: customer.id,
        currencyCode: input.currencyCode,
      },
    },
    create: {
      tenantId: input.tenantId,
      customerId: customer.id,
      currencyCode: input.currencyCode,
    },
    update: {},
  })
  return {
    id: account.id,
    customerId: account.customerId,
    currencyCode: account.currencyCode,
    revision: account.revision.toString(),
    snapshotSequence: account.lastSequence.toString(),
  }
}

/** Call after FinanceBook when also posting accounting, and before locking Orders. */
export async function lockCustomerLedgerAccount(
  tx: Prisma.TransactionClient,
  input: FinanceActor & { accountId: string },
) {
  const rows = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM "CustomerLedgerAccount" WHERE id = ${input.accountId} AND "tenantId" = ${input.tenantId} FOR UPDATE`
  await assertFinanceManager(tx, input)
  if (!rows[0])
    throw new FinanceError(
      "NOT_FOUND",
      "Customer ledger account not found in this business.",
    )
  return tx.customerLedgerAccount.findUniqueOrThrow({
    where: { id: rows[0].id },
  })
}
