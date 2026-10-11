import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import { getFinancePurchaseRegistrationReview } from "./purchase-registration-review"
import { normalizePurchaseRegistration } from "./purchase-registration-source"
const input = { tenantId: "tenant", actorUserId: "owner", bookId: "book", supplierId: "supplier", storeId: "store", description: " Feed agreement ", agreedAt: new Date("2026-10-01T12:00:00.123Z"), lines: [{ balanceSourceId: "balance", description: " Feed ", amountMinor: "12345", enteredQuantity: "1.25", enteredInventoryUnitId: "unit", expectedConfigurationVersionId: "config", categories: [{ name: " Purchase " }] }] }
function fixture(change: { denied?: boolean; missingBook?: boolean; closed?: boolean; currency?: boolean; supplier?: boolean; store?: boolean; config?: boolean; packaged?: boolean; precision?: boolean } = {}) {
  return {
    $queryRaw: async () => [],
    membership: { findFirst: async () => change.denied ? null : { tenant: { isActive: true, currencyCode: change.currency ? "USD" : "NGN" } } },
    financeBook: { findFirst: async (args: unknown) => { expect(args).toMatchObject({ where: { id: "book", tenantId: "tenant" } }); return change.missingBook ? null : { id: "book", currencyCode: "NGN", startsAt: new Date("2026-01-01"), closedThrough: change.closed ? new Date("2026-10-02") : null } } },
    financeSupplierAccount: { findFirst: async (args: unknown) => { expect(args).toMatchObject({ where: { id: "supplier", bookId: "book" } }); return change.supplier ? null : { id: "supplier", name: "ACME", code: "ACME" } } },
    store: { findFirst: async (args: unknown) => { expect(args).toMatchObject({ where: { id: "store", tenantId: "tenant", currencyCode: "NGN" } }); return change.store ? null : { id: "store" } } },
    financeAccount: { findUnique: async () => ({ id: "inventory", kind: "ASSET", purpose: "INVENTORY", archivedAt: null }) },
    stockBalanceSource: { findFirst: async (args: unknown) => { expect(args).toMatchObject({ where: { id: "balance", tenantId: "tenant", storeId: "store" } }); return { kind: change.packaged ? "PACKAGED_STOCK" : "BULK", inventoryUnitId: "other-unit", inventoryUnit: { configurationVersionId: "config" }, product: { currentUnitConfigurationVersionId: change.config ? "changed" : "config" } } } },
    inventoryUnit: { findUnique: async () => ({ id: "unit", configurationVersionId: "config", transactionScale: change.precision ? 0 : 2 }) },
  } as unknown as Prisma.TransactionClient
}
test("registration review preserves exact agreement without posting effects", async () => {
  expect(await getFinancePurchaseRegistrationReview(fixture(), input)).toMatchObject({ description: "Feed agreement", supplierName: "ACME", agreedAt: input.agreedAt.toISOString(), totalMinor: "12345", effect: "AGREEMENT_ONLY_NO_PAYABLE_OR_STOCK", lines: [{ enteredQuantity: "1.25", amountMinor: "12345", categories: [{ name: "purchase" }] }] })
})
test("registration review repeats canonical authority, period, supplier, Store and unit guards", async () => {
  for (const change of [{ denied: true }, { missingBook: true }, { closed: true }, { currency: true }, { supplier: true }, { store: true }, { config: true }, { packaged: true }, { precision: true }]) await expect(getFinancePurchaseRegistrationReview(fixture(change), input)).rejects.toBeDefined()
})
test("registration normalizer rejects duplicate goods, excessive totals and malformed exact quantities", () => {
  for (const lines of [[], [input.lines[0]!, input.lines[0]!], [{ ...input.lines[0]!, amountMinor: "100000000000001" }], [{ ...input.lines[0]!, enteredQuantity: "1e3" }], [{ ...input.lines[0]!, categories: [] }]]) expect(() => normalizePurchaseRegistration({ ...input, lines })).toThrow()
})
