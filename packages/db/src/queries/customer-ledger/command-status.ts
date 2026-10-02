import type { PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "../finance/access"
import { FinanceError } from "../finance/rules"

export async function getCustomerLedgerCommandStatus(
  db: PrismaClient,
  input: FinanceActor & { accountId: string; clientCommandId: string },
) {
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const account = await tx.customerLedgerAccount.findFirst({
        where: { id: input.accountId, tenantId: input.tenantId },
        select: { id: true },
      })
      if (!account)
        throw new FinanceError(
          "NOT_FOUND",
          "Customer account not found in this business.",
        )
      const command = await tx.customerLedgerCommand.findFirst({
        where: {
          tenantId: input.tenantId,
          accountId: account.id,
          clientCommandId: input.clientCommandId,
        },
        select: { result: true, createdAt: true },
      })
      return command
        ? { status: "COMMITTED" as const, ...command }
        : { status: "NOT_FOUND" as const }
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}
