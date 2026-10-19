/** Read-only source/configuration check. No DB access unless --database is explicit. */
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import { assistantWhatsAppReadiness } from "@ewatrade/assistant/channels/readiness"
import { readAssistantWhatsAppOperations } from "../apps/api/src/assistant/channel-operations"

const sourceFiles = [
  "scripts/assistant-whatsapp-readiness.ts",
  "packages/assistant/src/channels/readiness.ts",
  "packages/assistant/src/channels/policy.ts",
  "packages/assistant/src/channels/controls.ts",
  "packages/assistant/src/channels/support.ts",
  "packages/assistant/src/channels/render.ts",
  "packages/assistant/src/channels/action-review.ts",
  "packages/assistant/src/channels/capability-action-handoff.ts",
  "packages/assistant/src/channels/conversation-links.ts",
  "packages/assistant/src/channels/workflow.ts",
  "packages/assistant/src/channels/workflow-action-review.ts",
  "packages/assistant/src/channels/workflow-action-result.ts",
  "packages/assistant/src/channels/media.ts",
  "packages/assistant/src/setup/attachment-processing.ts",
  "packages/assistant/src/capabilities/manifest.ts",
  "apps/api/src/assistant/channel-operations.ts",
  "apps/api/src/assistant/channel-principal.ts",
  "apps/api/src/trpc/routers/assistant-channels.ts",
  "apps/api/src/communications/whatsapp-platform-runtime.ts",
  "apps/api/src/assistant/channel-turn.ts",
  "apps/api/src/assistant/channel-action-turn.ts",
  "apps/api/src/assistant/channel-review-staging.ts",
  "apps/api/src/assistant/channel-proposal-review.ts",
  "apps/api/src/assistant/channel-workflow-turn.ts",
  "apps/api/src/assistant/workflow-turn.ts",
  "apps/api/src/assistant/channel-workflow-review-staging.ts",
  "apps/api/src/assistant/channel-workflow-action-turn.ts",
  "apps/api/src/assistant/channel-workflow-command.ts",
  "apps/api/src/assistant/channel-media-turn.ts",
  "apps/api/src/assistant/whatsapp-media/ingest.ts",
  "apps/api/src/assistant/general-context.ts",
  "apps/api/src/assistant/general-proposals.ts",
  "apps/api/src/assistant/general-actions.ts",
  "apps/api/src/assistant/general-simple-sale.ts",
  "apps/api/src/assistant/general-simple-expense.ts",
  "apps/api/src/assistant/general-simple-money-in.ts",
  "apps/api/src/assistant/general-simple-transfer.ts",
  "apps/api/src/assistant/general-reviewed-new-book.ts",
  "apps/api/src/assistant/proposal-security.ts",
  "apps/api/src/assistant/product-command.ts",
  "apps/api/src/assistant/setup-commit.ts",
  "packages/db/src/queries/assistant.ts",
  "packages/db/src/queries/assistant-general.ts",
  "packages/db/src/queries/assistant-whatsapp/authority.ts",
  "packages/db/src/queries/assistant-whatsapp/grants.ts",
  "packages/db/src/queries/assistant-whatsapp/controls.ts",
  "packages/db/src/queries/assistant-whatsapp/control-authority.ts",
  "packages/db/src/queries/assistant-whatsapp/conversations.ts",
  "packages/db/src/queries/assistant-whatsapp/execution.ts",
  "packages/db/src/queries/assistant-whatsapp/action-reviews.ts",
  "packages/db/src/queries/assistant-whatsapp/workflow-action-reviews.ts",
  "packages/db/src/queries/assistant-whatsapp/workflow-terminal.ts",
  "packages/db/src/queries/assistant-whatsapp/workflow-reply.ts",
  "packages/db/src/queries/assistant-whatsapp/inbox.ts",
  "packages/db/src/queries/assistant-whatsapp/outbox.ts",
  "packages/db/src/queries/assistant-whatsapp/processing.ts",
  "packages/db/src/queries/assistant-whatsapp/delivery.ts",
  "packages/db/src/queries/assistant-whatsapp/queued-work.ts",
  "packages/db/src/queries/assistant-whatsapp/lifecycle.ts",
  "packages/db/src/queries/assistant-whatsapp/media-review.ts",
  "packages/db/src/queries/assistant-whatsapp/media-source.ts",
  "packages/db/src/queries/assistant-whatsapp/media-source-lifecycle.ts",
  "packages/db/src/queries/assistant-whatsapp/notices.ts",
  "packages/db/src/queries/assistant-whatsapp/quota-notice.ts",
  "packages/db/src/queries/assistant-whatsapp/privacy.ts",
  "packages/db/src/queries/assistant-attachments.ts",
  "packages/db/src/queries/assistant-voice.ts",
  "packages/db/src/queries/assistant-operations.ts",
  "packages/db/prisma/models/assistant-whatsapp.prisma",
  "packages/communications/src/whatsapp.ts",
  "packages/communications/src/whatsapp-media.ts",
  "packages/communications/src/whatsapp-platform.ts",
  "packages/jobs/src/assistant-whatsapp.ts",
  "packages/jobs/src/handlers/assistant-attachment-process.ts",
  "packages/jobs/src/handlers/assistant-maintenance.ts",
  "apps/dashboard/src/components/assistant-whatsapp/whatsapp-connections.tsx",
  "apps/dashboard/src/components/assistant-whatsapp/whatsapp-scope-picker.tsx",
  "apps/dashboard/src/components/assistant-whatsapp/connect-whatsapp.tsx",
  "apps/dashboard/src/components/general-assistant/use-general-assistant.ts",
  "apps/dashboard/src/components/general-assistant/general-chat.tsx",
  "apps/dashboard/src/hooks/use-catalog-item-params.ts",
  "apps/dashboard/src/components/catalog-item/catalog-item-content.tsx",
  "apps/dashboard/src/components/catalog-item/form.tsx",
  "apps/dashboard/src/components/product-assistant/product-form-resume.ts",
  "packages/assistant/src/product/contracts.ts",
  "packages/assistant/src/channels/read-record-links.ts",
  "apps/dashboard/src/lib/navigation.ts",
  "apps/dashboard/src/app/(shell)/layout.tsx",
  "apps/dashboard/src/components/general-assistant/assistant-workbench.tsx",
  "apps/dashboard/src/components/sheets/global-sheets.tsx",
  "apps/dashboard/src/components/catalog-item/catalog-item-detail-modal.tsx",
  "apps/dashboard/src/components/catalog-item/detail/activity.tsx",
  "apps/dashboard/src/components/catalog-item/detail/content.tsx",
  "apps/dashboard/src/components/catalog-item/detail/header.tsx",
  "apps/dashboard/src/components/catalog-item/detail/orders.tsx",
  "apps/dashboard/src/components/catalog-item/detail/overview.tsx",
  "apps/dashboard/src/components/catalog-item/detail/read-access.ts",
  "apps/dashboard/src/hooks/use-catalog-detail-params.ts",
  "apps/mobile/src/components/mobile/assistant-whatsapp/screen.tsx",
  "apps/mobile/src/components/mobile/assistant-whatsapp/scope-picker.tsx",
  "apps/mobile/src/components/mobile/assistant-whatsapp/selected-chat-route.ts",
  "apps/mobile/src/components/mobile/assistant/use-general-assistant.ts",
  "apps/mobile/src/components/mobile/assistant/ask-assistant-live.tsx",
  "apps/mobile/src/components/mobile/assistant/assistant-chat-box.tsx",
  "apps/mobile/src/components/mobile/assistant/use-assistant-receipts.ts",
  "apps/mobile/src/components/mobile/setup-assistant/setup-route-conversation.ts",
  "apps/mobile/src/components/mobile/setup-assistant/setup-assistant-screen.tsx",
  "apps/mobile/src/components/mobile/setup-assistant/use-setup-assistant.ts",
  "packages/assistant/src/general/read-record-context.ts",
  "packages/assistant/src/general/read-continuation.ts",
  "apps/api/src/assistant/general-catalog-history.ts",
  "apps/api/src/assistant/general-catalog-history-answer.ts",
  "packages/db/src/queries/catalog-detail.ts",
  "packages/db/src/queries/catalog.ts",
  "packages/db/src/queries/inventory-reporting.ts",
  "packages/db/src/queries/assistant-private-export.ts",
  "packages/db/src/queries/assistant-private-export-projection.ts",
  "packages/db/package.json",
  "apps/api/src/account-privacy/assistant-export-session.ts",
  "apps/api/src/account-privacy/assistant-export.ts",
  "apps/api/src/index.ts",
  "apps/dashboard/src/app/account/assistant-data/page.tsx",
  "apps/dashboard/src/components/account/assistant-data-download.tsx",
  "apps/dashboard/src/app/account/whatsapp/page.tsx",
  "apps/mobile/src/app/assistant-data.tsx",
  "apps/mobile/src/components/mobile/account-privacy/assistant-data-screen.tsx",
  "apps/mobile/src/components/mobile/account-privacy/assistant-data-transfer.ts",
  "apps/mobile/src/components/mobile/account-privacy/assistant-data-file.ts",
  "apps/mobile/src/app/_layout.tsx",
  "apps/mobile/src/components/mobile/account-privacy-screen.tsx",
  "packages/db/src/queries/account-privacy-private-assistant.ts",
  "packages/db/src/queries/assistant-whatsapp/private-cleanup.ts",
  "apps/api/src/account-privacy/private-assistant-media.ts",
  "packages/assistant/src/setup/attachments.ts",
  "apps/api/src/trpc/routers/setup-assistant-attachments.ts",
]

async function main() {
  const args = process.argv.slice(2)
  const evidenceIndex = args.indexOf("--evidence")
  const evidencePath = evidenceIndex >= 0 ? args[evidenceIndex + 1] : undefined
  const allowed = new Set([
    "--database",
    "--require-enabled",
    "--require-external-evidence",
    "--evidence",
  ])
  if (
    args.some((arg, index) =>
      evidenceIndex >= 0 && index === evidenceIndex + 1
        ? false
        : !allowed.has(arg),
    ) ||
    (evidenceIndex >= 0 && (!evidencePath || evidencePath.startsWith("--")))
  )
    throw Error("Invalid options")
  const hash = createHash("sha256")
  for (const path of sourceFiles)
    hash
      .update(path)
      .update("\n")
      .update(await readFile(path))
      .update("\n")
  const sourceFingerprint = hash.digest("hex")
  let evidence: unknown
  if (evidencePath) {
    const bytes = await readFile(evidencePath)
    if (bytes.byteLength > 32_768) throw Error("Invalid evidence")
    evidence = JSON.parse(bytes.toString("utf8"))
  }
  const now = new Date()
  const readiness = assistantWhatsAppReadiness({
    environment: process.env,
    capabilities: capabilityManifest,
    sourceFingerprint,
    evidence,
    now,
  })
  let operations:
    | Awaited<ReturnType<typeof readAssistantWhatsAppOperations>>
    | { status: "not_requested" } = { status: "not_requested" }
  if (args.includes("--database")) {
    const url = new URL(process.env.EWATRADE_DATABASE_URL ?? "")
    const expectedHost =
      process.env.QA_ACCESS_ACCEPTANCE_DATABASE_HOST?.toLowerCase().replace(
        /\.$/,
        "",
      )
    if (
      process.env.APP_ENV !== "local" ||
      process.env.DEV_PROFILE !== "local" ||
      process.env.NODE_ENV === "production" ||
      process.env.DATABASE_PROFILE_VERIFIED !== "1" ||
      !expectedHost ||
      !expectedHost.endsWith(".neon.tech") ||
      url.hostname.toLowerCase().replace(/\.$/, "") !== expectedHost ||
      url.pathname !== "/ewatrade_qa_v1"
    )
      throw Error("Verified local QA profile required")
    const { prisma } = await import("@ewatrade/db")
    try {
      operations = await readAssistantWhatsAppOperations(prisma, {
        since: new Date(now.getTime() - 7 * 24 * 60 * 60_000),
        now,
      })
    } finally {
      await prisma.$disconnect()
    }
  }
  console.log(
    JSON.stringify(
      {
        checkedAt: now.toISOString(),
        sourceFingerprint,
        readiness,
        operations,
      },
      null,
      2,
    ),
  )
  if (
    readiness.configuration.status === "invalid" ||
    (args.includes("--require-enabled") && !readiness.flags.channel) ||
    (args.includes("--require-external-evidence") &&
      !readiness.externalEvidence.complete) ||
    operations.status === "unavailable"
  )
    process.exitCode = 1
}

main().catch(() => {
  // Raw configuration, file paths, connection strings and DB/provider errors are private.
  console.error(
    JSON.stringify({
      version: "whatsapp-readiness-v1",
      status: "unavailable",
      code: "READINESS_CHECK_UNAVAILABLE",
    }),
  )
  process.exitCode = 1
})
