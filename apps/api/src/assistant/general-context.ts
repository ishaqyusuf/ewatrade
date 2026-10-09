import {
  type CapabilityId,
  capabilityForAction,
} from "@ewatrade/assistant/capabilities/manifest"
import type {
  Capability,
  CapabilityRole,
} from "@ewatrade/assistant/capabilities/types"
import type { GeneralActionName } from "@ewatrade/assistant/general/contracts"
import { canOperatePos, normalizeRole } from "@ewatrade/auth/roles"
import {
  canStaffAccessStore,
  canStaffPerform,
} from "@ewatrade/auth/store-access"
import type { AssistantScope } from "@ewatrade/db/assistant"
import { TRPCError } from "@trpc/server"
import { assertFinanceAccess } from "../trpc/finance-procedure"
import type { TRPCContext } from "../trpc/init"
import {
  assertCanManageCatalog,
  assertCanReadCatalog,
} from "../trpc/routers/catalog"
import { assertCanUseCustomers } from "../trpc/routers/customers"
import { assertCanOperateOrders } from "../trpc/routers/orders"
import { assertServiceOperator } from "../trpc/routers/service-permissions"
import { staffProcedureAction } from "../utils/staff-procedure-policy"
export type GeneralContext = TRPCContext & {
  session: NonNullable<TRPCContext["session"]>
  tenantContext: NonNullable<TRPCContext["tenantContext"]>
}
type GeneralScopeContext = Pick<GeneralContext, "session" | "tenantContext">
type TenantContext = GeneralContext["tenantContext"]
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

/**
 * The same assertions the capability's router procedures apply. Writes call
 * transaction commands directly, so these must stay in step with the routers.
 */
const domainAccess: Record<CapabilityId, (tenant: TenantContext) => void> = {
  "search.records": () => {},
  "catalog.item.read": (tenant) => assertCanReadCatalog(tenant.membership.role),
  "inventory.offering_stock.read": () => {},
  "sales.orders.read": (tenant) =>
    assertCanOperateOrders(tenant.membership.role),
  "sales.summary.read": (tenant) =>
    assertCanOperateOrders(tenant.membership.role),
  "sales.order.read": (tenant) =>
    assertCanOperateOrders(tenant.membership.role),
  "services.queue.read": (tenant) =>
    assertServiceOperator(tenant.membership.role),
  "customers.accounts.read": (tenant) => assertFinanceAccess(tenant),
  "customers.create": (tenant) => assertCanUseCustomers(tenant.membership.role),
  "catalog.product.create": (tenant) => assertCanManageCatalog(tenant),
  "sales.order.create": (tenant) =>
    assertCanOperateOrders(tenant.membership.role),
  "sales.payment.record": (tenant) =>
    assertCanOperateOrders(tenant.membership.role),
}

/** Scoped staff may use a capability only where every procedure grants it. */
function staffGranted(
  tenant: TenantContext,
  capability: Capability,
  storeId: string,
) {
  const access = tenant.staffAccess
  if (
    !access ||
    access.mode !== "SCOPED" ||
    ["OWNER", "ADMIN"].includes(access.businessRole)
  )
    return true
  const type = capability.mode === "write" ? "mutation" : "query"
  return capability.procedures.every((path) => {
    const action = staffProcedureAction(path, type)
    return action === "read"
      ? canStaffAccessStore(access, storeId)
      : action !== null && canStaffPerform(access, action, storeId)
  })
}

/**
 * Effective permission: assistant role ceiling, then the canonical domain
 * check and scoped Store grant. Chat never grants more than the forms.
 */
export function assertCapability(
  ctx: GeneralScopeContext,
  capability: Capability,
) {
  const scope = requireGeneralScope(ctx)
  const tenant = ctx.tenantContext
  const role = normalizeRole(tenant.membership.role)
  if (!role || !capability.policy.roles.includes(role as CapabilityRole))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: ["CASHIER", "OPERATOR"].includes(role ?? "")
        ? "Sales reps can draft sales in the assistant. Ask an owner or manager for this action."
        : "Your role does not permit this action at this Store.",
    })
  let allowed = staffGranted(tenant, capability, scope.storeId)
  try {
    domainAccess[capability.id as CapabilityId](tenant)
  } catch {
    allowed = false
  }
  if (!allowed)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Your role does not permit this action at this Store.",
    })
  return scope
}
export function canUseCapability(
  ctx: GeneralScopeContext,
  capability: Capability,
) {
  try {
    assertCapability(ctx, capability)
    return true
  } catch {
    return false
  }
}
export function assertGeneralAction(
  ctx: GeneralScopeContext,
  action: GeneralActionName,
) {
  return assertCapability(ctx, capabilityForAction(action))
}
