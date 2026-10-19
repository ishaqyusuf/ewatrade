import type { CommonActions } from "@react-navigation/native"

export type OperationSuccessKind = "order" | "product" | "service"

export type OperationSuccessParams = {
  orderId?: string
  paymentMethod?: string
  unitCount?: string
  balance?: string
  amount?: string
  customer?: string
  itemCount?: string
  kind: OperationSuccessKind
  name?: string
  paymentState?: "paid" | "partially_paid" | "pending"
  reference?: string
  status?: "created" | "queued"
  /** Where the money went: the destination account's display name only. */
  moneyAccount?: string
  /** A Service order: New sale starts another Service order. */
  saleKind?: "service"
  /** A saved Product's usage; Internal use skips the first-order prompt. */
  usage?: "FOR_SALE" | "INTERNAL_USE" | "BOTH"
}

type ResetAction = ReturnType<typeof CommonActions.reset>
type OperationSuccessNavigation = { dispatch: (action: ResetAction) => void }
type RouteRef = { key?: string; name: string; params?: object }

// The same plain action CommonActions.reset builds, without loading React
// Navigation at runtime, so these history rules stay testable under Bun.
const reset = (routes: RouteRef[]) =>
  ({
    type: "RESET",
    payload: { index: routes.length - 1, routes },
  }) as unknown as ResetAction

/** The role's real Home (not the `dashboard` redirect, which would bounce). */
export function outcomeHomeRoute(salesRep: boolean): RouteRef {
  return salesRep
    ? { name: "sales-rep-home" }
    : { name: "(admin-tabs)", params: { screen: "admin-home" } }
}

/** Where a completed outcome's action leads; nothing else stays in history. */
export type OutcomeExit =
  | { to: "home" }
  | { to: "new-sale"; service?: boolean }
  | { to: "receipt"; orderId: string }
  | { to: "order"; orderId: string }
  | { to: "sync-status" }
  /** WhatsApp for a recorded Order: the protected composer, over Home. */
  | { to: "customer-message"; orderId: string; eventKey: string }
  | { to: "catalog-item"; catalogItemId: string }

export function outcomeExitRoutes(
  exit: OutcomeExit,
  { salesRep }: { salesRep: boolean },
): RouteRef[] {
  const home = outcomeHomeRoute(salesRep)
  switch (exit.to) {
    case "home":
      return [home]
    case "new-sale":
      // No key: a fresh draft, never the completed checkout.
      return [
        home,
        exit.service
          ? { name: "create-sale-modal", params: { kind: "service" } }
          : { name: "create-sale-modal" },
      ]
    case "receipt":
      return [
        home,
        { name: "order-receipts-modal", params: { orderIds: exit.orderId } },
      ]
    case "order":
      return [
        home,
        { name: "order/[orderId]", params: { orderId: exit.orderId } },
      ]
    case "sync-status":
      return [home, { name: "sync-status-modal" }]
    case "customer-message":
      // Opaque ids only; closing the composer returns Home.
      return [
        home,
        {
          name: "customer-message-modal",
          params: { orderId: exit.orderId, eventKey: exit.eventKey },
        },
      ]
    case "catalog-item":
      return [
        home,
        {
          name: "catalog-item/[catalogItemId]",
          params: { catalogItemId: exit.catalogItemId },
        },
      ]
  }
}

/** Leave a completed outcome: Home → destination, so back reaches Home. */
export function exitOutcome(
  navigation: OperationSuccessNavigation,
  exit: OutcomeExit,
  options: { salesRep: boolean },
) {
  navigation.dispatch(reset(outcomeExitRoutes(exit, options)))
}

/**
 * While an outcome shows, rebase history to Home + the current route (same
 * key, so the screen and its state survive). Back, swipe and close then reach
 * Home instead of earlier screens or a submitted form. Works for cold entry.
 */
export function rebaseOutcomeOnHome(
  navigation: OperationSuccessNavigation,
  current: RouteRef & { key: string },
  options: { salesRep: boolean },
) {
  navigation.dispatch(
    reset([
      outcomeHomeRoute(options.salesRep),
      { key: current.key, name: current.name, params: current.params },
    ]),
  )
}

export function showOperationSuccess(
  navigation: OperationSuccessNavigation,
  params: OperationSuccessParams,
) {
  navigation.dispatch(
    reset([{ name: "dashboard" }, { name: "operation-success", params }]),
  )
}
