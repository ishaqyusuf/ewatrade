import type {
  BusinessActivityTarget,
  BusinessActivityView,
} from "@ewatrade/notifications/business-events"

/** Params on assistantObjectParams that open the canonical original sheet. */
export function activityOriginalParams(target: BusinessActivityTarget) {
  switch (target.kind) {
    case "order":
      return { orderSheet: "details", orderId: target.id }
    case "payment":
      return { orderSheet: "details", orderId: target.orderId }
    case "staff_member":
      return { staffMember: target.id }
    case "staff_invitation":
      return { staffInvitation: target.id }
    case "stock_operation":
      return { inventoryOperation: target.id }
    case "stock_count":
      return { inventoryCount: target.id }
    case "catalog_item":
      return { catalogDetail: target.id }
    case "customer":
      return { customerDetail: target.id }
    case "service_job":
      return { serviceSheet: "job", jobId: target.id }
    case "finance_movement":
      return { financeMovement: target.id, financeMovementBook: target.bookId }
    // Expense and purchase bills open different sheets and the target does not
    // say which; never guess. No journal-entry sheet exists either.
    case "finance_bill":
    case "finance_entry":
      return null
  }
}

const OPEN_LABELS: Record<BusinessActivityTarget["kind"], string> = {
  order: "Open order",
  payment: "Open order",
  staff_member: "Open in Staff",
  staff_invitation: "Open invitation",
  stock_operation: "Open stock operation",
  stock_count: "Open stock count",
  catalog_item: "Open item",
  customer: "Open customer",
  service_job: "Open service job",
  finance_movement: "Open in Finance",
  finance_bill: "Open bill",
  finance_entry: "Open in Finance",
}

/** Which original sheets this viewer's dashboard registers (global-sheets gates). */
export type ActivityOpenAccess = {
  sales: boolean
  catalog: boolean
  staffDirectory: boolean
  staffHistory: boolean
  finance: boolean
  serviceJobs: boolean
}

export type ActivityOpenContext = {
  activeStoreId: string | null
  access: ActivityOpenAccess
}

const STORE_BOUND = new Set<BusinessActivityTarget["kind"]>([
  "order",
  "payment",
  "stock_operation",
  "stock_count",
  "service_job",
])

/**
 * Whether one freshly authorized event can open its original here. A deep link
 * never grants access; Store records open only inside their own Store.
 */
export function activityOriginalOpen(
  event: Pick<BusinessActivityView, "target" | "canOpen" | "store">,
  context: ActivityOpenContext,
) {
  const target = event.target
  if (!target || !event.canOpen)
    return { unavailable: "No original record to open" } as const
  const label = OPEN_LABELS[target.kind]
  const params = activityOriginalParams(target)
  if (!params) return { unavailable: "Open it in Finance" } as const
  const { access } = context
  const allowed = {
    order: access.sales,
    payment: access.sales,
    customer: access.sales,
    catalog_item: access.catalog,
    staff_member: access.staffDirectory,
    staff_invitation: access.staffHistory,
    stock_operation: true,
    stock_count: true,
    service_job: access.serviceJobs,
    finance_movement: access.finance,
    finance_bill: access.finance,
    finance_entry: false,
  }[target.kind]
  if (!allowed) return { unavailable: "You can’t open this" } as const
  if (
    STORE_BOUND.has(target.kind) &&
    event.store &&
    event.store.id !== context.activeStoreId
  )
    return {
      unavailable: context.activeStoreId
        ? `Switch to ${event.store.name ?? "its Store"} to open`
        : `Choose ${event.store.name ?? "its Store"} to open`,
    } as const
  return { label, params } as const
}
