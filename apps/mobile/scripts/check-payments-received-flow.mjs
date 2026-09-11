import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const contracts = [
  {
    file: "apps/mobile/src/components/mobile/payments-received-screen.tsx",
    markers: [
      "trpc.orders.payments.infiniteQueryOptions",
      "currencyTotals",
      "PAYMENTS_RECEIVED_COPY.error",
      "buildPaymentsReceivedPresentation",
      'variant="flat"',
      "searchVisible={presentation.showSearch}",
    ],
    reason:
      "the mobile directory must keep bounded pagination, safe recovery, compact empty presentation, and conditional search",
  },
  {
    file: "apps/api/src/schemas/orders.ts",
    markers: [
      "commercialOrderPaymentsListPageSchema",
      'direction: z.enum(["forward", "backward"]).optional()',
    ],
    reason:
      "the strict payments schema must accept the direction field supplied by tRPC infinite queries",
  },
  {
    file: "apps/api/src/trpc/routers/orders.ts",
    markers: [
      "payments: protectedProcedure",
      "assertCanOperateOrders",
      "listCommercialOrderPaymentsPage",
      "defaultCurrencyCode: ctx.tenantContext.tenant.currencyCode",
    ],
    reason:
      "received payments must remain permission-checked and Tenant-scoped without a currency lookup",
  },
  {
    file: "packages/db/src/queries/commercial-payments.ts",
    markers: [
      "CommercialPaymentType.PAYMENT",
      'JOIN "CommercialOrder" AS orders',
      "COUNT(*)::bigint",
      'SUM(payments."amountMinor")',
      'GROUP BY orders."currencyCode"',
    ],
    reason:
      "the existing total-count read must also return complete received value without an additional query or transaction",
  },
]

const failures = []
for (const contract of contracts) {
  const filePath = join(REPO_ROOT, contract.file)
  const source = readFileSync(filePath, "utf8")
  const missing = contract.markers.filter((marker) => !source.includes(marker))
  if (missing.length > 0) {
    failures.push({
      file: filePath,
      message: `missing ${missing.join(", ")} (${contract.reason})`,
    })
  }
}

if (failures.length > 0) {
  console.error("Payments received flow check failed.")
  for (const failure of failures) {
    console.error(`- ${relative(REPO_ROOT, failure.file)}: ${failure.message}`)
  }
  process.exit(1)
}

console.log("Payments received flow check passed.")
