import { prisma } from "@ewatrade/db/client"
import {
  claimTemplateUpdateEmail,
  enqueueTemplateUpdatePage,
  listTemplateUpdateEmails,
  readTemplateUpdateRecipient,
  startTemplateUpdateEmail,
} from "@ewatrade/db/queries"
import {
  createManagedQaEmailMessages,
  getDefaultEmailTransport,
  getTestEmailRouting,
} from "@ewatrade/email"
import {
  TEMPLATE_UPDATE_EVENT,
  implementedBusinessEventHandlers,
} from "@ewatrade/notifications/business-events"
import { liveTemplateUpdates } from "@ewatrade/storefront-templates"
import { getQaPolicyEnvironment } from "@ewatrade/utils/qa-policy-server"
import {
  dispatchTemplateUpdateEmail,
  templateUpdateEmailConfigured,
} from "../handlers/storefront-template-update-email"
import { assertQaJobProviderAllowed } from "../qa-provider-guard"

/** Existing hourly cadence; no new scheduler or live sends during source qualification. */
export async function runStorefrontTemplateUpdateEmails() {
  const config = process.env
  if (!templateUpdateEmailConfigured(config))
    return { enabled: false, candidates: 0, processed: 0 }
  const updates = liveTemplateUpdates()
  // A withdrawn target still needs stale notices closed and unknown leases recovered.
  let candidates = 0
  for (const update of updates)
    candidates += await enqueueTemplateUpdatePage(prisma, update)
  const rows = await listTemplateUpdateEmails(prisma)
  const transport = getDefaultEmailTransport()
  let processed = 0
  for (const row of rows) {
    const payload = implementedBusinessEventHandlers[
      TEMPLATE_UPDATE_EVENT
    ].schema.safeParse(row.event.payload)
    const parsed =
      row.event.type === TEMPLATE_UPDATE_EVENT && payload.success
        ? payload.data
        : null
    const update = parsed
      ? updates.find(
          (entry) =>
            entry.key === parsed.templateKey &&
            entry.version === parsed.toVersion,
        )
      : null
    let claim: Awaited<ReturnType<typeof claimTemplateUpdateEmail>> = null
    const loadRecipient = async () =>
      update && parsed && row.event.subjectMembershipId
        ? readTemplateUpdateRecipient(prisma, {
            tenantId: row.tenantId,
            membershipId: row.event.subjectMembershipId,
            siteId: parsed.siteId,
            update,
          })
        : null
    const finish = async (
      outcome: "accepted" | "skipped" | "retry" | "unknown",
    ) => {
      if (!claim) return
      return prisma.businessActivityOutbox.updateMany({
        where: claim,
        data: {
          status:
            outcome === "retry"
              ? "PENDING"
              : outcome === "unknown"
                ? "FAILED"
                : "COMPLETED",
          completedAt:
            outcome === "accepted" || outcome === "skipped" ? new Date() : null,
          failureCode:
            outcome === "accepted"
              ? "EMAIL_ACCEPTED"
              : outcome === "skipped"
                ? "NO_LONGER_ELIGIBLE"
                : outcome === "unknown"
                  ? "EMAIL_OUTCOME_UNKNOWN"
                  : "EMAIL_PREPARATION_FAILED",
          nextAttemptAt: new Date(Date.now() + 3_600_000),
          claimId: null,
          claimExpiresAt: null,
        },
      })
    }
    if (!update) {
      claim = await claimTemplateUpdateEmail(prisma, row.id, row.tenantId)
      await finish("skipped")
      continue
    }
    const result = await dispatchTemplateUpdateEmail(
      { id: row.id, tenantId: row.tenantId, update },
      {
        config,
        async claim() {
          claim = await claimTemplateUpdateEmail(prisma, row.id, row.tenantId)
          return Boolean(claim)
        },
        recipient: loadRecipient,
        async assertProviderAllowed(recipient) {
          const routing = getTestEmailRouting({
            to: recipient,
            env: await getQaPolicyEnvironment(config),
          })
          if (routing.recipients.length !== 1)
            throw Error("A single email destination is required.")
          await assertQaJobProviderAllowed({
            operation: "email",
            tenantId: row.tenantId,
            qaEmailRouted: routing.routed,
          })
        },
        async start(recipient) {
          if (!claim || !parsed || !row.event.subjectMembershipId) return false
          return startTemplateUpdateEmail(prisma, claim, {
            tenantId: row.tenantId,
            membershipId: row.event.subjectMembershipId,
            siteId: parsed.siteId,
            update,
            recipient,
          })
        },
        finish,
        async send(message) {
          const messages = await createManagedQaEmailMessages(message, {
            env: config,
          })
          if (messages.length !== 1 || !messages[0])
            throw Error("A single email destination is required.")
          return transport.send(messages[0])
        },
      },
    )
    if (result) processed++
  }
  return { enabled: true, candidates, processed }
}
