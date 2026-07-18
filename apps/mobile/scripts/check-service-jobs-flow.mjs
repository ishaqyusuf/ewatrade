import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const MOBILE_DIR = join(REPO_ROOT, "apps/mobile")
const FILES = {
  createItem: join(
    MOBILE_DIR,
    "src/components/mobile/first-product-setup-sheet.tsx",
  ),
  createSale: join(MOBILE_DIR, "src/components/mobile/create-sale-sheet.tsx"),
  dashboard: join(MOBILE_DIR, "src/app/dashboard.tsx"),
  jobs: join(MOBILE_DIR, "src/components/mobile/service-jobs-sheet.tsx"),
  layout: join(MOBILE_DIR, "src/app/_layout.tsx"),
  route: join(MOBILE_DIR, "src/app/service-jobs-modal.tsx"),
}

const CONTRACTS = [
  {
    file: FILES.layout,
    markers: ['name="service-jobs-modal"'],
    reason: "the authenticated layout must register the Service Jobs route",
  },
  {
    file: FILES.route,
    markers: ["WorkflowModalScreen", "ServiceJobsContent"],
    reason: "Service Jobs must use the shared full-screen workflow shell",
  },
  {
    file: FILES.dashboard,
    markers: ['router.push("/service-jobs-modal" as never)'],
    reason: "mobile homes must keep Service Jobs reachable",
  },
  {
    file: FILES.createItem,
    markers: [
      'setItemKind("product")',
      'setItemKind("service")',
      "createCatalogItem.mutationOptions",
      "Services have a selling price but no stock.",
    ],
    reason: "item creation must choose Product or Service per item",
  },
  {
    file: FILES.createSale,
    markers: [
      "catalogItems.queryOptions",
      "catalogItemVariantId",
      'selectedItem.kind === "service"',
    ],
    reason: "sales must consume the generic catalog and skip stock for Service",
  },
  {
    file: FILES.jobs,
    markers: [
      "serviceJobs.queryOptions",
      "updateServiceJobStatus.mutationOptions",
      "addServiceJobEvidence.mutationOptions",
      "Service jobs need a live connection",
    ],
    reason:
      "Service Jobs must use generic relational APIs and state offline scope",
  },
]

const failures = []
for (const contract of CONTRACTS) {
  const source = readFileSync(contract.file, "utf8")
  const missing = contract.markers.filter((marker) => !source.includes(marker))
  if (missing.length) {
    failures.push({
      file: contract.file,
      message: `missing ${missing.join(", ")} (${contract.reason})`,
    })
  }
}

if (failures.length) {
  console.error("Service jobs flow check failed.")
  for (const failure of failures) {
    console.error(`- ${relative(REPO_ROOT, failure.file)}: ${failure.message}`)
  }
  process.exit(1)
}

console.log("Service jobs flow check passed.")
