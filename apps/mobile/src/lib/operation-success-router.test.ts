import { expect, test } from "bun:test"
import {
  CommonActions,
  StackRouter,
  TabRouter,
} from "@react-navigation/routers"
import {
  type OutcomeExit,
  exitOutcome,
  rebaseOutcomeOnHome,
} from "./operation-success-navigation"

// Exercise the installed router, including RESET rehydration and GO_BACK.
// This verifies navigation state, not native gestures or screen lifecycle.
const routeNames = [
  "(admin-tabs)",
  "sales-rep-home",
  "dashboard",
  "create-sale-modal",
  "operation-success",
  "order-receipts-modal",
  "order/[orderId]",
  "sync-status-modal",
  "catalog-item/[catalogItemId]",
]
const options = { routeNames, routeParamList: {}, routeGetIdList: {} }
const stack = StackRouter({ initialRouteName: "(admin-tabs)" })
type State = ReturnType<typeof stack.getInitialState>
function withRoutes(
  routes: Array<{ key: string; name: string; params?: object }>,
) {
  return stack.getRehydratedState({ routes }, options)
}
function apply(
  state: State,
  action: Parameters<typeof stack.getStateForAction>[1],
) {
  const next = stack.getStateForAction(state, action, options)
  return next ? stack.getRehydratedState(next, options) : null
}
function actualAdminHome(route: State["routes"][number]) {
  expect(route.name).toBe("(admin-tabs)")
  if (
    !route.params ||
    !("screen" in route.params) ||
    typeof route.params.screen !== "string"
  )
    throw Error("Expected an explicit nested Home destination")
  const tabs = TabRouter({
    initialRouteName: "admin-home",
    backBehavior: "initialRoute",
  })
  const tabState = tabs.getRehydratedState(
    { routes: [{ name: route.params.screen }] },
    {
      routeNames: ["admin-home", "orders", "catalog", "more"],
      routeParamList: {},
      routeGetIdList: {},
    },
  )
  expect(tabState.routes[tabState.index].name).toBe("admin-home")
}
const exits: OutcomeExit[] = [
  { to: "home" },
  { to: "new-sale" },
  { to: "receipt", orderId: "saved-order" },
  { to: "order", orderId: "saved-order" },
  { to: "sync-status" },
  { to: "catalog-item", catalogItemId: "origin-product" },
]

for (const salesRep of [false, true]) {
  for (const exit of exits) {
    test(`real StackRouter ${salesRep ? "rep" : "admin"} ${exit.to} removes the completed route before back`, () => {
      let state = withRoutes([
        { name: "dashboard", key: "old-dashboard" },
        {
          name: "create-sale-modal",
          key: "completed-sale",
          params: { offeringId: "old-offering" },
        },
      ])
      const navigation = {
        dispatch: (action: ReturnType<typeof CommonActions.reset>) => {
          const next = apply(state, action)
          if (!next) throw Error("Router rejected a real exit action")
          state = next
        },
      }
      const completed = state.routes[state.index]
      rebaseOutcomeOnHome(navigation, completed, { salesRep })
      expect(state.routes[state.index].key).toBe(completed.key)
      exitOutcome(navigation, exit, { salesRep })
      expect(state.routes.some((route) => route.key === "completed-sale")).toBe(
        false,
      )
      expect(state.routes.some((route) => route.name === "dashboard")).toBe(
        false,
      )
      expect(
        state.routes.some((route) => route.name === "operation-success"),
      ).toBe(false)
      expect(state.routes).toHaveLength(exit.to === "home" ? 1 : 2)
      if (exit.to === "new-sale") {
        expect(state.routes[state.index].key).not.toBe(completed.key)
        expect(state.routes[state.index].params).toBeUndefined()
      }
      const backed = apply(state, CommonActions.goBack())
      if (exit.to === "home") expect(backed).toBeNull()
      else {
        if (!backed) throw Error("Destination should have Home beneath it")
        expect(backed.routes).toHaveLength(1)
        expect(backed.index).toBe(0)
        expect(apply(backed, CommonActions.goBack())).toBeNull()
      }
      const home = (backed ?? state).routes[0]
      if (salesRep) expect(home.name).toBe("sales-rep-home")
      else actualAdminHome(home)
    })
  }
}

for (const name of ["create-sale-modal", "operation-success"]) {
  test(`a cold ${name} gains Home while preserving the existing route key`, () => {
    const cold = withRoutes([
      {
        name,
        key: "cold-outcome",
        params: { kind: "order", orderId: "saved-order" },
      },
    ])
    const retained = { state: cold }
    rebaseOutcomeOnHome(
      {
        dispatch: (action) => {
          const next = apply(cold, action)
          if (!next) throw Error("Router rejected the rebase")
          retained.state = next
        },
      },
      cold.routes[0],
      { salesRep: false },
    )
    // The router returns a new navigator state, but the retained route keeps its
    // key. React/native screen-state preservation still needs mounted evidence.
    const result = retained.state
    expect(result.routes.map((route) => route.name)).toEqual([
      "(admin-tabs)",
      name,
    ])
    expect(result.routes[1].key).toBe("cold-outcome")
    expect(result.routes[1].params).toEqual(cold.routes[0].params)
    const backed = apply(result, CommonActions.goBack())
    if (!backed) throw Error("Expected Home after back")
    actualAdminHome(backed.routes[0])
  })
}
