import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname);
const MOBILE_DIR = join(REPO_ROOT, "apps/mobile");
// A contract names one file or a feature folder (every non-test source in it).
const contracts = [
  {
    file: "src/app/_layout.tsx",
    markers: ['name="service-jobs-modal"'],
    reason: "authenticated users must be able to reach Service Work",
  },
  {
    file: "src/app/service-jobs-modal.tsx",
    markers: ["WorkflowModalScreen", "ServiceJobsContent"],
    reason: "Service Work must use the shared full-screen workflow shell",
  },
  {
    // Admin and sales rep Home both render this surface; dashboard.tsx only redirects.
    file: "src/components/mobile/dashboard/operations-dashboard-screen.tsx",
    markers: ['router.push("/service-jobs-modal" as never)'],
    reason: "Service Work must remain reachable from Home",
  },
  {
    folder: "src/components/mobile/catalog-setup",
    markers: [
      'setKind("product")',
      'setKind("service")',
      "trpc.catalog.createSimpleItem",
      "trpc.catalog.createItem",
      "Track work after order",
      "authorizationPolicy",
      "workPolicy",
      "quote_required",
    ],
    reason:
      "Catalog setup must classify each item and configure charge-only/tracked Service policies without inventory coupling",
  },
  {
    folder: "src/components/mobile/service-jobs",
    markers: [
      "trpc.catalog.listItems.queryOptions(\n      { kind: \"service\" }",
      "trpc.services.createAndConfirmIntake",
      "trpc.services.queuePage",
      "trpc.services.transitionLine",
      "trpc.services.getSettings",
      "trpc.services.handoff",
      "trpc.orders.recordPayment",
      "trpc.serviceCommunications.createIntent",
      "trpc.services.addNote",
      "trpc.services.assignJob",
      "trpc.services.captureEvidence",
      "Customer and delivery details are optional.",
      "Add date, instructions, photo or video",
      "Private evidence requires tracked Service work.",
      "Create service order",
      "offeringDisplayName",
      "normalizedVariantName.startsWith(`${normalizedItemName} ·`)",
      "Start work",
      "Mark ready",
      "expressSurchargeValue",
      "Amount paid now",
      "Record payment",
      "Mark delivered",
      "still owed",
      "Mark collected",
      "Review customer update",
      "Update status",
    ],
    reason:
      "the simple Service flow must support optional details/evidence and tracked or charge-only outcomes",
  },
  {
    // Service commands no longer queue offline (removed July 2026); intake waits for a connection.
    folder: "src/components/mobile/service-jobs",
    markers: [
      "disabled={isOfflineMode || !model.intakeProjection.value}",
      "Reconnect to create Service work",
      "expectedRevision",
    ],
    reason:
      "Service work is online-only: intake must refuse offline instead of queueing unreplayable commands, and changes keep revisions",
  },
];

function readContractSource(contract) {
  if (contract.file) return readFileSync(join(MOBILE_DIR, contract.file), "utf8");
  const dir = join(MOBILE_DIR, contract.folder);
  return readdirSync(dir)
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
    .map((name) => readFileSync(join(dir, name), "utf8"))
    .join("\n");
}

const failures = [];
for (const contract of contracts) {
  const filePath = join(MOBILE_DIR, contract.file ?? contract.folder);
  const source = readContractSource(contract);
  const missing = contract.markers.filter((marker) => !source.includes(marker));
  if (missing.length > 0) {
    failures.push({
      file: filePath,
      message: `missing ${missing.join(", ")} (${contract.reason})`,
    });
  }
  const legacy = [
    "retailOps.createCatalogItem",
    "retailOps.createSale",
    "updateServiceJobStatus",
  ].filter((marker) => source.includes(marker));
  if (legacy.length > 0) {
    failures.push({
      file: filePath,
      message: `contains legacy Service markers ${legacy.join(", ")}`,
    });
  }
}

if (failures.length > 0) {
  console.error("Generic Service Work flow check failed.");
  for (const failure of failures) {
    console.error(`- ${relative(REPO_ROOT, failure.file)}: ${failure.message}`);
  }
  process.exit(1);
}

console.log("Generic Service Work flow check passed.");
