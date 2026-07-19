import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const contracts = [
  {
    file: "apps/mobile/src/components/mobile/reports-sheet.tsx",
    markers: [
      "trpc.inventory.balanceReport",
      "includeCompatibleTotals: true",
      "trpc.inventory.reconciliationReport",
      "trpc.serviceReporting.summary",
      "trpc.orders.list",
      "Order value",
      "Balance sources",
      "Provisional",
      "Service work",
      "WIP",
      "Ready",
      "Blocked",
      "Overdue",
      "Compatible canonical totals are informational",
      "Exports use exact strings and posted snapshots.",
    ],
    reason:
      "mobile reports must project commercial, inventory, reconciliation, and Service truth without treating compatible totals as availability",
  },
  {
    file: "apps/api/src/trpc/routers/inventory.ts",
    markers: [
      "balanceReport: protectedProcedure",
      "reconciliationReport: protectedProcedure",
      "operationHistory: protectedProcedure",
      "operationAudit: protectedProcedure",
      "auditExport: protectedProcedure",
      "listInventoryBalanceReport",
      "getInventoryReconciliationSummary",
      "exportInventoryAuditRows",
      "assertCanManageInventory",
    ],
    reason:
      "inventory reporting must remain protected, auditable, exact, and role-aware",
  },
  {
    file: "apps/api/src/trpc/routers/service-reporting.ts",
    markers: [
      "summary: protectedProcedure",
      "auditExport: protectedProcedure",
      "getServiceOperationsReport",
      "exportServiceOperationsAudit",
      "assertServiceManager",
    ],
    reason:
      "Service reporting must retain protected summary and export projections",
  },
  {
    file: "apps/api/src/trpc/routers/orders.ts",
    markers: [
      "list: protectedProcedure",
      "get: protectedProcedure",
      "listCommercialOrders",
      "assertCanOperateOrders",
    ],
    reason: "commercial reporting sources must remain tenant- and role-scoped",
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
  console.error("Generic operations reporting flow check failed.")
  for (const failure of failures) {
    console.error(`- ${relative(REPO_ROOT, failure.file)}: ${failure.message}`)
  }
  process.exit(1)
}

console.log("Generic operations reporting flow check passed.")
