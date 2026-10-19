import { readFile, writeFile } from "node:fs/promises"
import { capabilityManifest } from "../packages/assistant/src/capabilities/manifest"
import type { Capability } from "../packages/assistant/src/capabilities/types"

const path = new URL(
  "../packages/assistant/evaluations/WHATSAPP-COVERAGE.md",
  import.meta.url,
)
const capabilities: readonly Capability[] = capabilityManifest
const count = (predicate: (entry: Capability) => boolean) =>
  capabilities.filter(predicate).length
const planned = count((entry) => entry.rollout === "planned")
const nativeReads = count(
  (entry) =>
    entry.rollout !== "planned" &&
    entry.mode === "read" &&
    entry.whatsapp?.mode === "native",
)
const nativeWrites = count(
  (entry) =>
    entry.rollout !== "planned" &&
    entry.mode === "write" &&
    entry.whatsapp?.mode === "native",
)
const appReviewWrites = count(
  (entry) =>
    entry.rollout !== "planned" &&
    entry.mode === "write" &&
    entry.whatsapp?.mode === "app_review",
)
const unclassified =
  capabilities.length - planned - nativeReads - nativeWrites - appReviewWrites

function classification(entry: Capability) {
  if (entry.rollout === "planned")
    return {
      current: "planned (canonical)",
      reason:
        "Canonical rollout is planned; existing domain/role/Store/Book acceptance is a prerequisite. Channel flags cannot promote it.",
      acceptance:
        "Closed canonical scope; no WhatsApp journey accepted. Requires canonical release plus an independently reviewed channel adapter and acceptance.",
    }
  if (entry.whatsapp?.mode === "native")
    return {
      current: `native ${entry.mode} source`,
      reason:
        entry.mode === "read"
          ? "Existing authorized reader has channel-compatible deterministic facts; original role/Store/Book and canonical rollout checks remain."
          : `Bounded complete ${entry.action} review uses canonical proposal/decision services; rich, incomplete or attached variants require authenticated app review.`,
      acceptance:
        "Source/backend test references only; no complete per-capability UI/live acceptance asserted. Requires the exact journey, current authority/replay coverage, scoped app crossover and provider pilot.",
    }
  if (entry.mode === "write" && entry.whatsapp?.mode === "app_review") {
    const sensitive =
      entry.domain === "staff" ||
      entry.id.startsWith("settings.") ||
      entry.effect === "provider"
    return {
      current: "authenticated app review source",
      reason: sensitive
        ? "Sensitive authority/provider action requires the existing authenticated app review and any canonical step-up; no native channel execution adapter."
        : `No complete native ${entry.action} review/decision adapter. Existing ${entry.domain} command facts and consequences require full app review; the channel only hands off the exact saved chat.`,
      acceptance:
        "Handoff source only; creates no draft or effect. Requires actual same-chat app continuation and canonical review/commit acceptance; native execution remains unavailable.",
    }
  }
  return {
    current: "unclassified",
    reason: "No reviewed WhatsApp classification exists.",
    acceptance:
      "Blocked: add explicit source classification, tests and acceptance dependencies before claiming coverage.",
  }
}

function channelTests(entry: Capability) {
  if (entry.rollout === "planned")
    return ["packages/assistant/src/channels/policy.test.ts"]
  if (entry.whatsapp?.mode === "app_review") {
    const tests = [
      "packages/assistant/src/channels/capability-action-handoff.test.ts",
      "apps/api/src/assistant/channel-action-race.integration.test.ts",
    ]
    if (["sales.service.authorize", "sales.service.fulfill"].includes(entry.id))
      tests.push(
        "apps/api/src/assistant/channel-service-handoff.integration.test.ts",
      )
    if (entry.id === "finance.expense.record")
      tests.push(
        "apps/api/src/assistant/channel-finance-handoff.integration.test.ts",
      )
    if (entry.id === "inventory.stock.receive")
      tests.push(
        "apps/api/src/assistant/channel-stock-receipt-handoff.integration.test.ts",
      )
    return tests
  }
  if (entry.mode === "write")
    return [
      "apps/api/src/assistant/channel-proposal-review.test.ts",
      "packages/db/src/queries/assistant-whatsapp/action-reviews.test.ts",
      "packages/db/src/queries/assistant-whatsapp/action-review-dispatch.test.ts",
      "apps/api/src/assistant/channel-action-confirmation.integration.test.ts",
    ]
  const tests = [
    "packages/assistant/src/channels/render.test.ts",
    "apps/api/src/assistant/channel-principal.integration.test.ts",
    "apps/api/src/assistant/channel-conversation-route.test.ts",
  ]
  if (
    [
      "search.records",
      "catalog.item.read",
      "inventory.offering_stock.read",
    ].includes(entry.id)
  )
    tests.push(
      "apps/api/src/assistant/channel-product-confirmation.integration.test.ts",
    )
  if (
    ["search.records", "catalog.item.read", "customers.read"].includes(entry.id)
  )
    tests.push("apps/api/src/assistant/general-read-record-context.test.ts")
  if (entry.id === "catalog.history.read")
    tests.push("apps/api/src/assistant/general-catalog-history-answer.test.ts")
  if (entry.id === "catalog.page")
    tests.push("packages/db/src/queries/catalog-stable-search.test.ts")
  if (entry.id === "customers.page")
    tests.push(
      "apps/api/src/assistant/channel-customer-pagination.integration.test.ts",
    )
  if (
    [
      "inventory.balances.read",
      "inventory.totals.read",
      "inventory.operations.history",
      "inventory.operations.read",
    ].includes(entry.id)
  )
    tests.push(
      "apps/api/src/assistant/general-inventory-decimal-producer.test.ts",
    )
  if (entry.id === "services.queue.read")
    tests.push(
      "apps/api/src/assistant/channel-service-queue-reads.integration.test.ts",
    )
  if (
    [
      "inventory.balances.read",
      "inventory.totals.read",
      "inventory.operations.read",
    ].includes(entry.id)
  )
    tests.push(
      "apps/api/src/assistant/channel-stock-receipt-handoff.integration.test.ts",
    )
  if (
    ["customers.receivables.read", "customers.accounts.read"].includes(entry.id)
  )
    tests.push(
      "apps/api/src/assistant/channel-customer-receivables.integration.test.ts",
    )
  if (
    [
      "readPurchaseRegistrations",
      "readPurchaseRecognition",
      "readPurchaseBills",
      "readPurchaseBill",
      "readSupplierStatement",
      "readMoneyAccountBalances",
    ].includes(entry.tool)
  )
    tests.push(
      "apps/api/src/assistant/channel-purchase-finance-reads.integration.test.ts",
    )
  return tests
}

const lines = [
  "# WhatsApp assistant capability inventory",
  "",
  "Generated by `bun scripts/assistant-whatsapp-coverage.ts`; use `--check` to verify freshness.",
  "",
  `GENERAL capabilities: ${capabilities.length} (${count((entry) => entry.mode === "read")} reads / ${count((entry) => entry.mode === "write")} writes).`,
  `Current classification: ${nativeReads} native read sources + ${nativeWrites} native reviewed action sources + ${appReviewWrites} authenticated app-review write sources + ${planned} canonical planned (${count((entry) => entry.rollout === "planned" && entry.mode === "read")} reads / ${count((entry) => entry.rollout === "planned" && entry.mode === "write")} writes); ${unclassified} unclassified.`,
  "Classification and test references are source/backend evidence inventory, not test execution results or per-capability acceptance. Shared proof tests exercise representative paths, not every row. Current execution outcomes and accepted leaves belong to the coordinator's dated QA packet and roadmap; this generator neither reads those outcomes nor promotes them.",
  "All native source support remains subject to independent default-off channel gates, current actor/role/Store/Book/domain authority and canonical rollout. Candidate target is a future implementation recommendation, distinct from current source classification and acceptance.",
  "In each row, canonical tests come from the manifest; shared channel tests name the relevant transport/policy/proof boundary, without claiming that a generic integration fixture executes that specific capability. The common producer/route regression proves exact saved-chat DTO compatibility, not every read's facts or rendered device navigation. Named bounded money/product and Product voice outcomes are recorded separately in evaluations/runs/2026-10-15-whatsapp-money-product-continuation.md; they do not accept a whole capability group. Planned rows retain canonical dependencies rather than pretending an app handoff makes them available.",
  "",
  "| ID | Mode | Canonical procedures | Roles | Scope | Canonical rollout | Current WhatsApp classification | WhatsApp rollout | Classification reason | Candidate target only | Canonical source tests | Shared channel source/backend test references | Acceptance status / remaining dependencies |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ...capabilities.map((capability) => {
    const target =
      capability.mode === "write" &&
      (capability.domain === "staff" ||
        capability.id.startsWith("settings.") ||
        capability.effect === "provider")
        ? "app_review"
        : "native"
    const classified = classification(capability)
    const channelRollout = capability.whatsapp?.rollout ?? "planned"
    return `| ${capability.id} | ${capability.mode} | ${capability.procedures.join(", ")} | ${capability.policy.roles.join(", ")} | ${capability.scope} | ${capability.rollout} | ${classified.current} | ${channelRollout} | ${classified.reason} | ${target} candidate | ${capability.tests.join(", ")} | ${channelTests(capability).join(", ")} | ${classified.acceptance} |`
  }),
  "",
  "Local client lifecycle references: apps/dashboard/src/components/assistant-whatsapp/connect-whatsapp.mounted.test.ts; apps/mobile/src/components/mobile/assistant-whatsapp/screen.mounted.test.ts; packages/assistant/evaluations/whatsapp-chat-attachment-switch.test.ts; apps/dashboard/src/components/product-assistant/product-form-resume.mounted.test.ts. These mount actual client orchestration with synthetic boundary responses; they do not certify authenticated browser/device or live Meta acceptance.",
  "",
  "| Additional workflow | Current source classification / reason | Source adapters | Exact source/backend test references | Candidate target only | Acceptance status / remaining dependencies |",
  "| --- | --- | --- | --- | --- | --- |",
  "| SETUP | Shared canonical runner, bounded saved draft listing/correction/selection and distinct digest-only workflow review. Native commit limited to complete selected simple product/service/customer facts; rich/account/opening/attached selections require app review. | apps/api/src/assistant/workflow-turn.ts; apps/api/src/assistant/channel-workflow-turn.ts; apps/api/src/assistant/channel-workflow-review-staging.ts; apps/api/src/assistant/channel-workflow-action-turn.ts; apps/api/src/assistant/channel-workflow-command.ts; packages/db/src/queries/assistant-whatsapp/workflow-action-reviews.ts | apps/api/src/assistant/chat-route.test.ts; apps/api/src/assistant/channel-workflow-turn.test.ts; apps/api/src/assistant/channel-workflow-turn.integration.test.ts; apps/api/src/assistant/channel-purpose-isolation.integration.test.ts; apps/api/src/assistant/setup-partial-recovery.integration.test.ts; apps/api/src/assistant/channel-workflow-command.test.ts; apps/api/src/assistant/channel-workflow-action.integration.test.ts; packages/assistant/src/channels/workflow.test.ts; packages/assistant/src/channels/workflow-action-review.test.ts; packages/db/src/queries/assistant-whatsapp/workflow-action-reviews.test.ts | Native complete selected drafts + authenticated rich review candidate | Source/backend fixtures exist; current connected outcomes require coordinator review. Requires selected commit/partial-success/retry/skip, ordinary app regressions, exact app resume, purpose/budget isolation, Owner/Admin/legal/current Store proof and consented provider/device acceptance. Independent workflow and workflow-write gates remain default off. |",
  "| PRODUCT_CREATE | Same canonical purpose/form snapshot/units/variants/draft runner and commit bridge; complete simple product native review, richer form/photo context retained for exact authenticated app handoff. Terminal receipt authority cannot create a new turn. | apps/api/src/assistant/workflow-turn.ts; apps/api/src/assistant/channel-workflow-turn.ts; apps/api/src/assistant/channel-workflow-command.ts; apps/api/src/assistant/channel-workflow-action-turn.ts; packages/db/src/queries/assistant-whatsapp/workflow-reply.ts; packages/assistant/src/channels/workflow-action-result.ts | apps/api/src/assistant/chat-route.test.ts; apps/api/src/assistant/channel-workflow-turn.test.ts; apps/api/src/assistant/channel-workflow-turn.integration.test.ts; apps/api/src/assistant/channel-purpose-isolation.integration.test.ts; apps/api/src/assistant/channel-workflow-command.test.ts; apps/api/src/assistant/channel-workflow-action.integration.test.ts; apps/api/src/assistant/channel-workflow-action-turn.test.ts; packages/assistant/src/channels/workflow.test.ts; packages/assistant/src/channels/workflow-action-review.test.ts; packages/assistant/src/channels/workflow-action-result.test.ts; apps/dashboard/src/hooks/whatsapp-product-route.test.ts; apps/dashboard/src/components/product-assistant/product-form-resume.test.ts | Native simple product + authenticated rich form review candidate | Source/backend fixtures exist; no full workflow or live acceptance inferred. Requires corrections/review/commit/closed-chat replay, rich units/variants/photo form integrity and actual same-product app resume. Canonical non-audio product media remains disabled; preserve purpose/budget/Owner/current Store checks and independent default-off gates. |",
  "| Attachments and voice notes | Bounded number/credential-scoped private ingestion, byte/MIME/digest/audio-duration checks, original provenance and retry/cancel attribution. Explicit quoted full transcript Use/Edit/Cancel precedes any shared assistant turn; original GENERAL photos stay unanalysed. | packages/communications/src/whatsapp.ts; packages/communications/src/whatsapp-media.ts; apps/api/src/assistant/whatsapp-media/ingest.ts; apps/api/src/assistant/channel-media-turn.ts; packages/db/src/queries/assistant-whatsapp/media-source.ts; packages/db/src/queries/assistant-whatsapp/media-source-lifecycle.ts; packages/db/src/queries/assistant-whatsapp/media-review.ts; packages/assistant/src/channels/media.ts | apps/api/src/assistant/channel-workflow-turn.test.ts; packages/communications/src/whatsapp-media.test.ts; packages/communications/src/whatsapp-platform.test.ts; apps/api/src/assistant/whatsapp-media/ingest.test.ts; apps/api/src/assistant/whatsapp-media/ingest-bytes.integration.test.ts; apps/api/src/assistant/whatsapp-media/ingest-audio-bytes.integration.test.ts; apps/api/src/assistant/whatsapp-media/ingest-audio-draft.integration.test.ts; apps/api/src/assistant/whatsapp-media/ingest-photo-sale-handoff.integration.test.ts; apps/api/src/assistant/whatsapp-media/ingest-pdf-provenance.integration.test.ts; apps/api/src/assistant/whatsapp-media/ingest-csv-parity-retention.integration.test.ts; apps/api/src/account-privacy/assistant-export.integration.test.ts; apps/api/src/account-privacy/assistant-whatsapp-private-cleanup.integration.test.ts; packages/db/src/queries/assistant-whatsapp/media-source-lifecycle.test.ts; packages/assistant/src/channels/media.test.ts; packages/db/src/queries/assistant-whatsapp/media-review.test.ts; apps/api/src/assistant/channel-media-review.integration.test.ts | Native canonical enabled media + explicit transcript review candidate | Fake HTTP and backend transcript-proof plus actual local original-PNG/default-job/Disconnect/bytes-first-cleanup evidence; no live download/transcriber/provider compatibility acceptance. Measured actual WAV/default QA processing through explicit transcript review to a pending draft, split original-photo app-review journeys, selectable-text PDF provenance, CSV app/channel parity, canonical own-account export and bytes-first cleanup/retention have bounded connected evidence recorded separately. Current scope excludes image interpretation/OCR: WhatsApp Setup images are refused before download, supported GENERAL original photos stay unanalysed and PRODUCT_CREATE non-audio media remains closed. Real speech-provider quality and rendered app/device crossover remain unaccepted; no OpenAI-backed image feature is required. Current Meta CDN/Graph/account eligibility and consented Android/iPhone pilot remain external gates; channel media gate remains default off. |",
  "",
  "Rich or sensitive review uses the authenticated existing object until full WhatsApp review is accepted.",
  "Explicitly excluded: provider payouts without their own domain contract, live WhatsApp calls, unrestricted general-purpose chat, and policy-denied clinical/customer flows.",
  "These exclusions retain their own domain/provider/privacy dependencies; they are not satisfied or enabled by a native candidate target, a passed source freshness check or an authenticated app link. W43 acceptance and rollout decisions remain with the coordinator.",
  "",
]
const document = lines.join("\n")
if (process.argv.includes("--check")) {
  if ((await readFile(path, "utf8").catch(() => "")) !== document)
    throw Error("WhatsApp capability inventory is stale. Regenerate it.")
  console.log(
    `WhatsApp capability inventory current: ${capabilityManifest.length} GENERAL rows + 3 workflow/media rows; no capability rollout promoted.`,
  )
} else {
  await writeFile(path, document)
  console.log(`Wrote ${path.pathname}`)
}
