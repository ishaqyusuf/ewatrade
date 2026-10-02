import type { Prisma } from "../../generated/prisma/client"
import { CatalogError } from "./catalog"
import { lockCommerceFinancialContext } from "./customer-ledger/commerce-locks"

/** Acquire the Store's financial coordination lock before inventory reads. */
export async function lockInventoryFinancialStore(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; storeId: string },
) {
  const store = await tx.store.findFirst({
    where: { id: input.storeId, tenantId: input.tenantId },
    select: { currencyCode: true },
  })
  if (!store) {
    throw new CatalogError(
      "STORE_NOT_FOUND",
      "Store not found for this business.",
    )
  }

  return lockCommerceFinancialContext(tx, {
    tenantId: input.tenantId,
    currencyCode: store.currencyCode,
  })
}

/** Acquire every context before source/stock locks; callers retain source authority. */
export async function lockInventoryFinancialStores(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; storeIds: string[] },
) {
  const storeIds = [...new Set(input.storeIds)].sort()
  const stores = await tx.store.findMany({
    where: { tenantId: input.tenantId, id: { in: storeIds } },
    select: { id: true, currencyCode: true },
  })
  if (stores.length !== storeIds.length) {
    throw new CatalogError(
      "STORE_NOT_FOUND",
      "Store not found for this business.",
    )
  }
  const currencyCodes = [
    ...new Set(stores.map((store) => store.currencyCode)),
  ].sort()
  const contexts: Array<
    Awaited<ReturnType<typeof lockCommerceFinancialContext>>
  > = []
  for (const currencyCode of currencyCodes) {
    contexts.push(
      await lockCommerceFinancialContext(tx, {
        tenantId: input.tenantId,
        currencyCode,
      }),
    )
  }
  return contexts
}
