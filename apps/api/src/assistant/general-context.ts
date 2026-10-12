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
import { assertCanAmendOrders } from "../trpc/routers/order-amendments"
import {
  assertCanManageSalesOperations,
  assertCanOperateOrders,
} from "../trpc/routers/orders"
import { assertServiceManager } from "../trpc/routers/service-permissions"
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
  "sales.items.report": (tenant) =>
    assertCanOperateOrders(tenant.membership.role),
  "sales.collections.report": (tenant) =>
    assertCanOperateOrders(tenant.membership.role),
  "customers.debt.report": (tenant) => assertFinanceAccess(tenant),
  "inventory.stock.report": (tenant) => assertCanManageInventory(tenant),
  "finance.supplier_aging.report": (tenant) => assertFinanceAccess(tenant),
  "finance.posted_profit.report": (tenant) => assertFinanceAccess(tenant),
  "finance.cash_count.record": (tenant) => assertFinanceAccess(tenant),
  "finance.cash_accounts.read": (tenant) => assertFinanceAccess(tenant),
  "finance.cash_counts.read": (tenant) => assertFinanceAccess(tenant),
  "finance.cash_count.read": (tenant) => assertFinanceAccess(tenant),
  "finance.day_close.read": (tenant) => assertFinanceAccess(tenant),

  "staff.invitation.manage": assertStaffInvitationAccess,
  "staff.access.change": assertStaffInvitationAccess,
  "staff.access.review": assertStaffInvitationAccess,
  "staff.access.receipt.read": assertStaffInvitationAccess,
  "staff.status.change": assertStaffInvitationAccess,
  "staff.status.review": assertStaffInvitationAccess,
  "staff.status.receipt.read": assertStaffInvitationAccess,
  "staff.invitations.read": assertStaffInvitationAccess,
  "staff.invitation.command.read": assertStaffInvitationAccess,
  "staff.invitation.review": (tenant) => {
    if (!["OWNER", "ADMIN"].includes(tenant.membership.role))
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Owner/Admin access is required for staff invitations.",
      })
  },
  "staff.history.read": (tenant) => {
    if (!["OWNER", "ADMIN"].includes(tenant.membership.role))
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Owner/Admin access is required for staff history.",
      })
  },
  "staff.directory.read": (tenant) =>
    assertCanManageSalesOperations(tenant.membership.role),
  "staff.member.read": (tenant) =>
    assertCanManageSalesOperations(tenant.membership.role),
  "finance.supplier.allocation.release": (tenant) =>
    assertFinanceAccess(tenant),
  "finance.bills.read": (tenant) => assertFinanceAccess(tenant),
  "finance.purchase.recognize": (tenant) => assertFinanceAccess(tenant),
  "finance.purchase.record": (tenant) => assertFinanceAccess(tenant),
  "finance.purchase.register": (tenant) => assertFinanceAccess(tenant),
  "finance.supplier.advance": (tenant) => assertFinanceAccess(tenant),
  "finance.supplier.advance.allocate": (tenant) => assertFinanceAccess(tenant),
  "finance.purchase.pay": (tenant) => assertFinanceAccess(tenant),
  "finance.supplier.create": (tenant) => assertFinanceAccess(tenant),
  "finance.purchase_registrations.read": (tenant) =>
    assertFinanceAccess(tenant),
  "finance.purchase_recognition.read": (tenant) => assertFinanceAccess(tenant),
  "finance.purchases.read": (tenant) => assertFinanceAccess(tenant),
  "finance.purchase.read": (tenant) => assertFinanceAccess(tenant),
  "finance.suppliers.read": (tenant) => assertFinanceAccess(tenant),
  "finance.supplier_statement.read": (tenant) => assertFinanceAccess(tenant),
  "finance.bill.read": (tenant) => assertFinanceAccess(tenant),
  "finance.expense_categories.read": (tenant) => assertFinanceAccess(tenant),
  "finance.money_accounts.read": (tenant) => assertFinanceAccess(tenant),
  "customers.account.read": (tenant) => assertFinanceAccess(tenant),
  "customers.sources.read": (tenant) => assertFinanceAccess(tenant),
  "customers.statement.read": (tenant) => assertFinanceAccess(tenant),
  "finance.expense.void": (tenant) => assertFinanceAccess(tenant),
  "finance.purchase.fact.reverse": (tenant) => assertFinanceAccess(tenant),
  "finance.supplier.opening": (tenant) => assertFinanceAccess(tenant),
  "finance.supplier.entry.reverse": (tenant) => assertFinanceAccess(tenant),
  "finance.purchase.payment.reverse": (tenant) => assertFinanceAccess(tenant),
  "finance.bill_payment.reverse": (tenant) => assertFinanceAccess(tenant),
  "finance.bill.pay": (tenant) => assertFinanceAccess(tenant),
  "finance.expense.record": (tenant) => assertFinanceAccess(tenant),
  "finance.money_movement.record": (tenant) => assertFinanceAccess(tenant),
  "customers.entry.read": (tenant) => assertFinanceAccess(tenant),
  "customers.allocation_history.read": (tenant) => assertFinanceAccess(tenant),
  "customers.credit.apply": (tenant) => assertFinanceAccess(tenant),
  "customers.allocation.release": (tenant) => assertFinanceAccess(tenant),
  "customers.receipt.record": (tenant) => assertFinanceAccess(tenant),
  "customers.credit.refund": (tenant) => assertFinanceAccess(tenant),
  "sales.product.return": (tenant) =>
    assertCanOperateOrders(tenant.membership.role),
  "sales.products.fulfill": (tenant) =>
    assertCanOperateOrders(tenant.membership.role),
  "sales.product.fulfill": (tenant) =>
    assertCanOperateOrders(tenant.membership.role),
  "sales.service.authorize": (tenant) =>
    assertCanManageSalesOperations(tenant.membership.role),
  "sales.service.fulfill": (tenant) =>
    assertCanOperateOrders(tenant.membership.role),
  "sales.order.cancel": (tenant) =>
    assertCanAmendOrders(tenant.membership.role),
  "sales.order.metadata.update": (tenant) =>
    assertCanAmendOrders(tenant.membership.role),
  "sales.order.replace": (tenant) =>
    assertCanAmendOrders(tenant.membership.role),
  "sales.order.attachment.add": (tenant) =>
    assertCanOperateOrders(tenant.membership.role),
  "search.records": () => {},
  "catalog.history.read": (tenant) =>
    assertCanReadCatalog(tenant.membership.role),
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
  "services.intake.options.read": (tenant) =>
    assertServiceManager(tenant.membership.role),
  "services.intake.create": (tenant) =>
    assertServiceManager(tenant.membership.role),
  "services.work.rework": (tenant) =>
    assertServiceManager(tenant.membership.role),
  "services.work.handoff": (tenant) =>
    assertServiceOperator(tenant.membership.role),
  "services.work.assign": (tenant) =>
    assertServiceManager(tenant.membership.role),
  "services.work.reschedule": (tenant) =>
    assertServiceManager(tenant.membership.role),
  "services.work.transition": (tenant) =>
    assertServiceManager(tenant.membership.role),
  "services.work.note": (tenant) =>
    assertServiceManager(tenant.membership.role),
  "services.work.exception": (tenant) =>
    assertServiceManager(tenant.membership.role),
  "services.work.context.read": (tenant) =>
    assertServiceManager(tenant.membership.role),
  "services.work.review": (tenant) =>
    assertServiceManager(tenant.membership.role),
  "services.work.original.read": (tenant) =>
    assertServiceManager(tenant.membership.role),
  "services.queue.read": (tenant) =>
    assertServiceOperator(tenant.membership.role),
  // Quote reads/decisions enforce native active Store/team and selected approver rules in the DB.
  "services.quote_approval.read": () => {},
  "services.quote_approvals.read": () => {},
  "services.quote.approve": () => {},
  "services.quote.reject": () => {},
  "services.quote.review": () => {},
  "services.booking.read": (tenant) =>
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

function assertStaffInvitationAccess(tenant: TenantContext) {
  if (!["OWNER", "ADMIN"].includes(tenant.membership.role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Owner/Admin access is required for staff invitations.",
    })
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
      message: "The assistant can't do this yet.",
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
