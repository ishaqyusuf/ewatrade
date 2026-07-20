import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname);
const MOBILE_DIR = join(REPO_ROOT, "apps/mobile");
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
    file: "src/app/dashboard.tsx",
    markers: ['router.push("/service-jobs-modal" as never)'],
    reason: "Service Work must remain reachable from the generic dashboard",
  },
  {
    file: "src/components/mobile/simple-catalog-item-screen.tsx",
    markers: [
      'setKind("product")',
      'setKind("service")',
      "trpc.catalog.createSimpleItem",
      "trpc.catalog.createItem",
      "Products can track stock. Services do not affect inventory.",
      "Track work after order",
      "authorizationPolicy",
      "workPolicy",
      "quote_required",
    ],
    reason:
      "Catalog setup must classify each item and configure charge-only/tracked Service policies without inventory coupling",
  },
  {
    file: "src/components/mobile/service-jobs-sheet.tsx",
    markers: [
      'trpc.catalog.listItems.queryOptions({ kind: "service" }',
      "trpc.services.createAndConfirmIntake",
      "trpc.services.queue",
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
      "Private evidence requires at least one tracked Service item.",
      "Service order created.",
      "offeringDisplayName",
      "normalizedVariantName.startsWith(`${normalizedItemName} ·`)",
      "Start work",
      "Mark ready",
      "expressSurchargeValue",
      "Amount paid now",
      "Record payment",
      "Collect balance and hand over",
      "Mark collected",
      "Send customer update",
      "Update status",
      "bottomOffset={120}",
    ],
    reason:
      "the simple Service flow must support optional details/evidence and tracked or charge-only outcomes",
  },
  {
    file: "src/components/mobile/service-jobs-sheet.tsx",
    markers: [
      'kind: "service_intake"',
      'kind: "service_evidence_capture"',
      'kind: "service_transition"',
      'kind: "service_note"',
      'kind: "service_self_assignment"',
      "dependencyClientIds: [clientIntakeId]",
      "provisional until replay",
      "expectedRevision",
    ],
    reason:
      "offline Service commands must preserve dependency order, revisions, and provisional messaging",
  },
];

const failures = [];
for (const contract of contracts) {
  const filePath = join(MOBILE_DIR, contract.file);
  const source = readFileSync(filePath, "utf8");
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
