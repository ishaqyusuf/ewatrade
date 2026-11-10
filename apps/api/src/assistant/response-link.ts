import { readAssistantResponseSource } from "@ewatrade/db/assistant-response"
import { TRPCError } from "@trpc/server"
import { resolveProtectedTenantContext } from "../trpc/init"
import { requireBrowserIdentity } from "./channel-principal"
import { type GeneralContext, requireGeneralScope } from "./general-context"

/** A read-only lookup. This never changes selected workspace, runs AI or sends a reply. */
export async function readAssistantResponseLink(
  ctx: GeneralContext,
  messageId: string,
) {
  const session = requireBrowserIdentity(ctx.session)
  const source = await readAssistantResponseSource(
    ctx.db,
    session.user.id,
    messageId,
  )
  if (!source) return { status: "unavailable" as const }
  try {
    // Re-resolve the original scope without inheriting the currently selected context.
    // QA scope, age, membership, staff assignment and Store checks remain canonical.
    const fresh = await resolveProtectedTenantContext({
      ...ctx,
      tenantContext: null,
      tenantId: null,
      tenantSlug: source.conversation.tenant.slug,
      activeStoreId: source.conversation.storeId,
    })
    const scope = requireGeneralScope(fresh)
    if (
      scope.tenantId !== source.conversation.tenantId ||
      scope.storeId !== source.conversation.storeId
    )
      return { status: "unavailable" as const }
    const current = requireGeneralScope(ctx)
    return {
      status:
        current.tenantId === scope.tenantId && current.storeId === scope.storeId
          ? ("ready" as const)
          : ("scope_mismatch" as const),
      messageId: source.id,
      conversationId: source.conversation.id,
      tenantId: scope.tenantId,
      tenantSlug: fresh.tenantContext.tenant.slug,
      storeId: scope.storeId,
      businessName: fresh.tenantContext.tenant.name,
      storeName: fresh.tenantContext.activeStore?.name ?? "Store",
      currencyCode:
        fresh.tenantContext.activeStore?.currencyCode ??
        fresh.tenantContext.tenant.currencyCode,
      role: fresh.tenantContext.membership.role,
      staffAccessMode: fresh.tenantContext.staffAccess?.mode,
      catalogEditor: fresh.tenantContext.staffAccess?.catalogEditor,
    }
  } catch (error) {
    if (
      error instanceof TRPCError &&
      [
        "NOT_FOUND",
        "FORBIDDEN",
        "UNAUTHORIZED",
        "BAD_REQUEST",
        "CONFLICT",
      ].includes(error.code)
    )
      return { status: "unavailable" as const }
    throw error
  }
}
