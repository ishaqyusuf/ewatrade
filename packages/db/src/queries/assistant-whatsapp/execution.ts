import { createHash } from "node:crypto"
import { capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import { whatsAppCapabilityPolicyStamp } from "@ewatrade/assistant/channels/policy"
import { whatsAppWorkflowPolicy } from "@ewatrade/assistant/channels/workflow"
import type { AssistantConversationPurpose } from "../../../generated/prisma/client"
import { readStaffStoreAccess } from "../staff-store-access"
import type { TenantContext } from "../tenants"
import type { DbClient } from "../types"
import type { WhatsAppActorScope } from "./authority"
import { AssistantWhatsAppError } from "./authority"
import type { resolveAssistantWhatsAppConversation } from "./conversations"
import type { WhatsAppInboxLease } from "./processing"

type Resolved = Awaited<ReturnType<typeof resolveAssistantWhatsAppConversation>>
/** Stable policy evidence, not a role chosen by a caller or inferred from model text. */
export async function assistantWhatsAppAuthorityDigest(
  db: DbClient,
  resolved: Resolved,
) {
  return assistantWhatsAppScopeAuthorityDigest(db, {
    scope: resolved.scope,
    tenantContext: resolved.tenantContext,
    purpose: resolved.conversation.purpose,
  })
}

/** Same current domain policy for personal controls; no synthetic conversation or Session. */
export async function assistantWhatsAppScopeAuthorityDigest(
  db: DbClient,
  resolved: {
    scope: WhatsAppActorScope
    tenantContext: TenantContext
    purpose: AssistantConversationPurpose
  },
) {
  const policy = await readStaffStoreAccess(
    db,
    resolved.scope.membershipId,
    resolved.scope.tenantId,
  )
  if (!policy) throw new AssistantWhatsAppError("UNAUTHORIZED")
  const { tenantContext: ctx, scope } = resolved
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: "whatsapp-authority-v2",
        channelPolicy: whatsAppCapabilityPolicyStamp(capabilityManifest),
        workflowPolicy: whatsAppWorkflowPolicy(),
        scope,
        purpose: resolved.purpose,
        role: ctx.membership.role,
        businessRole: policy.role,
        status: policy.status,
        mode: policy.staffAccessMode,
        catalogEditor: policy.catalogEditor,
        revision: policy.staffAccessRevision,
        assignments: [...policy.staffStoreAssignments]
          .sort((a, b) =>
            a.storeId < b.storeId ? -1 : a.storeId > b.storeId ? 1 : 0,
          )
          .map(({ storeId, role, status, revision }) => ({
            storeId,
            role,
            status,
            revision,
          })),
        type: ctx.tenant.type,
        modes: [...ctx.tenant.enabledModes].sort(),
        plan: ctx.tenant.retailOpsPlanId ?? null,
        classification: ctx.tenant.dataClassification,
        tenantCurrency: ctx.tenant.currencyCode,
        storeCurrency: ctx.activeStore?.currencyCode,
      }),
    )
    .digest("hex")
}

/** Called under the existing linked/run transaction locks before canonical run admission. */
export async function stampAssistantWhatsAppExecution(
  db: DbClient,
  lease: WhatsAppInboxLease,
  resolved: Resolved,
  now = new Date(),
) {
  if (resolved.binding.id !== lease.bindingId)
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  const digest = await assistantWhatsAppAuthorityDigest(db, resolved)
  const updated = await db.assistantWhatsAppInbox.updateMany({
    where: {
      id: lease.inboxId,
      bindingId: lease.bindingId,
      state: "PROCESSING",
      leaseOwner: lease.owner,
      leaseGeneration: lease.generation,
      leaseExpiresAt: { gt: now },
      expiresAt: { gt: now },
      OR: [
        { executionAuthorityDigest: null },
        { executionAuthorityDigest: digest },
      ],
    },
    data: { executionAuthorityDigest: digest },
  })
  if (updated.count !== 1) throw new AssistantWhatsAppError("UNAUTHORIZED")
  return digest
}
