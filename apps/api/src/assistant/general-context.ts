import { assertCanAmendOrders } from "../trpc/routers/order-amendments"
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
import { assertCanManageInventory } from "../trpc/routers/inventory"
import { assertCanManageSalesOperations, assertCanOperateOrders } from "../trpc/routers/orders"
import { assertServiceOperator } from "../trpc/routers/service-permissions"
import { staffProcedureAction } from "../utils/staff-procedure-policy"
import { generalCapabilityEnabled } from "./general-rollout"
export type GeneralContext = TRPCContext & {
  session: NonNullable<TRPCContext["session"]>
  tenantContext: NonNullable<TRPCContext["tenantContext"]>
}
type GeneralScopeContext = Pick<GeneralContext, "session" | "tenantContext"> &
  Partial<Pick<GeneralContext, "requestHeaders">>

/** Client compatibility only; this never grants domain or role authority. */
export function supportsGeneralCapability(
  ctx: GeneralScopeContext,
  capability: Capability,
) {
  const client =
    ctx.requestHeaders?.get("x-assistant-client") === "dashboard"
      ? "dashboard"
      : "mobile"
  return capability.clients.includes(client)
}
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
  "sales.product.fulfill": tenant => assertCanOperateOrders(tenant.membership.role),
  "sales.service.authorize": tenant => assertCanManageSalesOperations(tenant.membership.role),
  "sales.service.fulfill": tenant => assertCanOperateOrders(tenant.membership.role),
  "sales.order.cancel": tenant=>assertCanAmendOrders(tenant.membership.role),
  "sales.order.metadata.update": tenant=>assertCanAmendOrders(tenant.membership.role),
  "sales.order.replace": tenant=>assertCanAmendOrders(tenant.membership.role),
  "search.records": () => {},
  "catalog.history.read": (tenant) => assertCanReadCatalog(tenant.membership.role),
  "catalog.page": (tenant) => assertCanReadCatalog(tenant.membership.role),
  "catalog.count": (tenant) => assertCanReadCatalog(tenant.membership.role),
  "customers.page": (tenant) => assertCanUseCustomers(tenant.membership.role),
  "customers.count": (tenant) => assertCanUseCustomers(tenant.membership.role),
  "stores.count": () => {},
  "sales.order_contacts.count": (tenant) =>
    assertCanOperateOrders(tenant.membership.role),
  "catalog.item.read": (tenant) => assertCanReadCatalog(tenant.membership.role),
  "inventory.closeout.create": (tenant) => assertCanManageInventory(tenant),
  "inventory.closeout.finalize": (tenant) => assertCanManageInventory(tenant),
  "inventory.closeout.list": (tenant) => assertCanManageInventory(tenant),
  "inventory.closeout.read": (tenant) => assertCanManageInventory(tenant),
  "inventory.count.read": (tenant) => assertCanManageInventory(tenant),
  "inventory.count.create": (tenant) => assertCanManageInventory(tenant),
  "inventory.count.finalize": (tenant) => assertCanManageInventory(tenant),
  "inventory.operations.history": (tenant) => assertCanManageInventory(tenant),
  "inventory.operations.read": (tenant) => assertCanManageInventory(tenant),
  "inventory.transfer.list": (tenant) => assertCanManageInventory(tenant),
  "inventory.transfer.read": (tenant) => assertCanManageInventory(tenant),
  "inventory.transfer.dispatch": (tenant) => assertCanManageInventory(tenant),
  "inventory.transfer.receive": (tenant) => assertCanManageInventory(tenant),
  "inventory.transfer.cancel": (tenant) => assertCanManageInventory(tenant),
  "inventory.stock.adjust": (tenant) => assertCanManageInventory(tenant),
  "inventory.stock.correct": (tenant) => assertCanManageInventory(tenant),
  "inventory.stock.receive": (tenant) => assertCanManageInventory(tenant),
  "inventory.offering_stock.read": () => {},
  "inventory.totals.read": () => {},
  "inventory.balances.read": () => {},
  "inventory.low_stock.read": () => {},
  "sales.orders.lookup": (tenant) =>
    assertCanOperateOrders(tenant.membership.role),
  "sales.orders.summary": (tenant) =>
    assertCanOperateOrders(tenant.membership.role),
  "sales.orders.read": (tenant) =>
    assertCanOperateOrders(tenant.membership.role),
  "sales.summary.read": (tenant) =>
    assertCanOperateOrders(tenant.membership.role),
  "sales.order.read": (tenant) =>
    assertCanOperateOrders(tenant.membership.role),
  "services.queue.read": (tenant) =>
    assertServiceOperator(tenant.membership.role),
  "customers.receivables.read": (tenant) => assertFinanceAccess(tenant),
  "customers.accounts.read": (tenant) => assertFinanceAccess(tenant),
  "customers.read": (tenant) => assertCanUseCustomers(tenant.membership.role),
  "customers.update": (tenant) => assertCanUseCustomers(tenant.membership.role),
  "customers.create": (tenant) => assertCanUseCustomers(tenant.membership.role),
  "catalog.product.create": (tenant) => assertCanManageCatalog(tenant),
  "catalog.units.draft": (tenant) => assertCanManageCatalog(tenant),
  "catalog.units.publish": (tenant) => assertCanManageCatalog(tenant),
  "catalog.availability.update": (tenant) => assertCanManageCatalog(tenant),
  "catalog.price.update": (tenant) => assertCanManageCatalog(tenant),
  "catalog.details.update": (tenant) => assertCanManageCatalog(tenant),
  "catalog.identifiers.update": (tenant) => assertCanManageCatalog(tenant),
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
  if (!generalCapabilityEnabled(capability))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This capability is not enabled for this assistant pilot.",
    })
  if (!supportsGeneralCapability(ctx, capability))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Use the dashboard to review this action.",
    })
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
