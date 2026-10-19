import { expect, test } from "bun:test"
import {
  exitOutcome,
  outcomeExitRoutes,
  rebaseOutcomeOnHome,
  showOperationSuccess,
} from "./operation-success-navigation"

const admin = { salesRep: false }
const rep = { salesRep: true }
const adminHome = { name: "(admin-tabs)", params: { screen: "admin-home" } }

function capture() {
  const actions: unknown[] = []
  return { actions, navigation: { dispatch: (a: unknown) => actions.push(a) } }
}

test("every completed-sale action leaves only Home under its destination", () => {
  expect(outcomeExitRoutes({ to: "home" }, admin)).toEqual([adminHome])
  expect(outcomeExitRoutes({ to: "new-sale" }, admin)).toEqual([
    adminHome,
    { name: "create-sale-modal" },
  ])
  expect(outcomeExitRoutes({ to: "receipt", orderId: "o-1" }, admin)).toEqual([
    adminHome,
    { name: "order-receipts-modal", params: { orderIds: "o-1" } },
  ])
  expect(outcomeExitRoutes({ to: "order", orderId: "o-1" }, admin)).toEqual([
    adminHome,
    { name: "order/[orderId]", params: { orderId: "o-1" } },
  ])
  expect(outcomeExitRoutes({ to: "sync-status" }, admin)).toEqual([
    adminHome,
    { name: "sync-status-modal" },
  ])
})

test("a fresh New sale never reuses the completed checkout route", () => {
  const [, sale] = outcomeExitRoutes({ to: "new-sale" }, admin)
  expect(sale).not.toHaveProperty("key")
  expect(sale).not.toHaveProperty("params")
})

test("sales reps return to their own Home, not the dashboard redirect", () => {
  expect(outcomeExitRoutes({ to: "order", orderId: "o-2" }, rep)[0]).toEqual({
    name: "sales-rep-home",
  })
  for (const exit of [{ to: "home" }, { to: "new-sale" }] as const)
    expect(
      outcomeExitRoutes(exit, admin).some((r) => r.name === "dashboard"),
    ).toBe(false)
})

test("exit dispatches one reset focused on the destination", () => {
  const { actions, navigation } = capture()
  exitOutcome(navigation, { to: "receipt", orderId: "o-3" }, admin)
  expect(actions).toEqual([
    {
      type: "RESET",
      payload: {
        index: 1,
        routes: [
          adminHome,
          { name: "order-receipts-modal", params: { orderIds: "o-3" } },
        ],
      },
    },
  ])
  exitOutcome(navigation, { to: "home" }, rep)
  expect(actions[1]).toEqual({
    type: "RESET",
    payload: { index: 0, routes: [{ name: "sales-rep-home" }] },
  })
})

test("rebasing keeps the outcome screen's own route key under Home", () => {
  const { actions, navigation } = capture()
  rebaseOutcomeOnHome(
    navigation,
    {
      key: "create-sale-abc",
      name: "create-sale-modal",
      params: { kind: "x" },
    },
    admin,
  )
  expect(actions).toEqual([
    {
      type: "RESET",
      payload: {
        index: 1,
        routes: [
          adminHome,
          {
            key: "create-sale-abc",
            name: "create-sale-modal",
            params: { kind: "x" },
          },
        ],
      },
    },
  ])
})

test("product and service success keep their existing history", () => {
  const { actions, navigation } = capture()
  showOperationSuccess(navigation, { kind: "product", name: "Feed" })
  expect(actions).toEqual([
    {
      type: "RESET",
      payload: {
        index: 1,
        routes: [
          { name: "dashboard" },
          {
            name: "operation-success",
            params: { kind: "product", name: "Feed" },
          },
        ],
      },
    },
  ])
})

test("New sale from a Service outcome starts another Service order", () => {
  expect(
    outcomeExitRoutes({ to: "new-sale", service: true }, { salesRep: false }),
  ).toEqual([
    { name: "(admin-tabs)", params: { screen: "admin-home" } },
    { name: "create-sale-modal", params: { kind: "service" } },
  ])
  expect(outcomeExitRoutes({ to: "new-sale" }, { salesRep: true })[1]).toEqual({
    name: "create-sale-modal",
  })
})

test("WhatsApp from Sales recorded leaves only Home under the composer", () => {
  expect(
    outcomeExitRoutes(
      {
        to: "customer-message",
        orderId: "order-a",
        eventKey: "order.recorded",
      },
      { salesRep: false },
    ),
  ).toEqual([
    { name: "(admin-tabs)", params: { screen: "admin-home" } },
    {
      name: "customer-message-modal",
      params: { orderId: "order-a", eventKey: "order.recorded" },
    },
  ])
})
