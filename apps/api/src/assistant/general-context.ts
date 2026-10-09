import type { GeneralActionName } from "@ewatrade/assistant/general/contracts"
import { canOperatePos, normalizeRole } from "@ewatrade/auth/roles"
import {
  canStaffAccessStore,
  canStaffPerform,
} from "@ewatrade/auth/store-access"
import type { AssistantScope } from "@ewatrade/db/assistant"
import { TRPCError } from "@trpc/server"
import type { TRPCContext } from "../trpc/init"
export type GeneralContext = TRPCContext & {
  session: NonNullable<TRPCContext["session"]>
  tenantContext: NonNullable<TRPCContext["tenantContext"]>
}
type GeneralScopeContext = Pick<GeneralContext, "session" | "tenantContext">
export function requireGeneralScope(
  ctx: GeneralScopeContext,
): AssistantScope & { dataClassification: "LIVE" | "QA" } {
  if (
    process.env.ASSISTANT_GENERAL_ENABLED !== "true" ||
    !process.env.ASSISTANT_APPROVAL_SIGNING_KEY ||
    process.env.ASSISTANT_APPROVAL_SIGNING_KEY.length < 32
  )
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "The assistant is not available.",
    })
  const tenant = ctx.tenantContext
  const role = normalizeRole(tenant.membership.role)
  const store = tenant.activeStore
  if (
    !role ||
    !canOperatePos(role) ||
    tenant.staffAccess?.status !== "ACTIVE" ||
    !store ||
    (tenant.staffAccess?.mode === "SCOPED" &&
      !canStaffAccessStore(tenant.staffAccess, store.id))
  )
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Choose an accessible Store to use the assistant.",
    })
  return {
    tenantId: tenant.tenant.id,
    storeId: store.id,
    userId: ctx.session.user.id,
    dataClassification: tenant.tenant.dataClassification,
  }
}
export function assertGeneralAction(
  ctx: GeneralScopeContext,
  action: GeneralActionName,
) {
  const scope = requireGeneralScope(ctx)
  const tenant = ctx.tenantContext
  const role = tenant.membership.role
  if (["CASHIER", "OPERATOR"].includes(role) && action !== "order_create")
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Sales reps can draft sales in the assistant. Ask an owner or manager for this action.",
    })
  const capability = action === "product_create" ? "catalog" : "orders"
  const allowed =
    tenant.staffAccess?.mode === "SCOPED"
      ? canStaffPerform(tenant.staffAccess, capability, scope.storeId)
      : action === "product_create"
        ? ["OWNER", "ADMIN", "MANAGER"].includes(role)
        : ["OWNER", "ADMIN", "MANAGER", "CASHIER", "OPERATOR"].includes(role)
  // Scoped customer creation is not exposed by the existing directory procedure.
  if (
    !allowed ||
    (action === "customer_create" &&
      tenant.staffAccess?.mode === "SCOPED" &&
      !["OWNER", "ADMIN"].includes(role))
  )
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Your role does not permit this action at this Store.",
    })
  return scope
}
