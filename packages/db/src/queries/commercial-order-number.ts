import type { Prisma } from "../../generated/prisma/client"

const COMMERCIAL_ORDER_NUMBER_PREFIX = "ORD"
const COMMERCIAL_ORDER_NUMBER_MINIMUM_DIGITS = 3

export function formatCommercialOrderNumber(sequence: number) {
  return `${COMMERCIAL_ORDER_NUMBER_PREFIX}-${sequence
    .toString()
    .padStart(COMMERCIAL_ORDER_NUMBER_MINIMUM_DIGITS, "0")}`
}

export async function allocateCommercialOrderNumber(
  tx: Prisma.TransactionClient,
  tenantId: string,
) {
  const tenant = await tx.tenant.update({
    data: { lastCommercialOrderSequence: { increment: 1 } },
    select: { lastCommercialOrderSequence: true },
    where: { id: tenantId },
  })

  return formatCommercialOrderNumber(tenant.lastCommercialOrderSequence)
}
