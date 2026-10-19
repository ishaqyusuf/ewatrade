import { expect, test } from "bun:test"
import {
  CommonActions,
  StackActions,
  StackRouter,
  TabRouter,
} from "@react-navigation/routers"
import {
  exitOutcome,
  rebaseOutcomeOnHome,
} from "./operation-success-navigation"

// Installed router state only. Mounted CTA eligibility, native dismiss/swipe
// and external share cancellation need their own user-flow evidence.
const options = {
  routeNames: [
    "(admin-tabs)",
    "sales-rep-home",
    "dashboard",
    "create-sale-modal",
    "operation-success",
    "customer-message-modal",
  ],
  routeParamList: {},
  routeGetIdList: {},
}
const router = StackRouter({ initialRouteName: "(admin-tabs)" })

for (const salesRep of [false, true]) {
  for (const host of ["create-sale-modal", "operation-success"]) {
    for (const service of [false, true]) {
      test(`${salesRep ? "rep" : "owner"} ${host} exits to ${service ? "fresh Service sale" : "customer composer"} with Home beneath it`, () => {
        let state = router.getRehydratedState(
          {
            routes: [
              { key: "old-dashboard", name: "dashboard" },
              {
                key: "finished-sale",
                name: host,
                params: {
                  orderId: "saved-order",
                  offeringId: "old-offering",
                  customer: "old display value",
                },
              },
            ],
          },
          options,
        )
        const navigation = {
          dispatch(action: ReturnType<typeof CommonActions.reset>) {
            const next = router.getStateForAction(state, action, options)
            if (!next) throw Error("Installed router rejected outcome reset")
            state = router.getRehydratedState(next, options)
          },
        }
        const outcome = state.routes[state.index]
        if (!outcome) throw Error("Missing finished route")
        rebaseOutcomeOnHome(navigation, outcome, { salesRep })
        exitOutcome(
          navigation,
          service
            ? { to: "new-sale", service: true }
            : {
                to: "customer-message",
                orderId: "saved-order",
                eventKey: "order.recorded",
              },
          { salesRep },
        )
        expect(state.routes).toHaveLength(2)
        expect(
          state.routes.some((route) => route.key === "finished-sale"),
        ).toBe(false)
        expect(state.routes.some((route) => route.name === "dashboard")).toBe(
          false,
        )
        const destination = state.routes[state.index]
        expect(destination?.name).toBe(
          service ? "create-sale-modal" : "customer-message-modal",
        )
        expect(destination?.params).toEqual(
          service
            ? { kind: "service" }
            : { orderId: "saved-order", eventKey: "order.recorded" },
        )
        // Both installed back action forms remove the destination to Home;
        // none can rediscover the completed checkout or its old params.
        for (const action of [CommonActions.goBack(), StackActions.pop(1)]) {
          const result = router.getStateForAction(state, action, options)
          if (!result) throw Error("Expected Home beneath destination")
          const back = router.getRehydratedState(result, options)
          expect(back.routes).toHaveLength(1)
          expect(back.index).toBe(0)
          expect(
            router.getStateForAction(back, CommonActions.goBack(), options),
          ).toBeNull()
          const home = back.routes[0]
          if (!home) throw Error("Missing Home")
          if (salesRep) expect(home.name).toBe("sales-rep-home")
          else {
            expect(home.name).toBe("(admin-tabs)")
            expect(home.params).toEqual({ screen: "admin-home" })
            const tabs = TabRouter({
              initialRouteName: "admin-home",
              backBehavior: "initialRoute",
            })
            const tabState = tabs.getRehydratedState(
              { routes: [{ name: "admin-home" }] },
              {
                routeNames: ["admin-home", "orders", "catalog", "more"],
                routeParamList: {},
                routeGetIdList: {},
              },
            )
            expect(tabState.routes[tabState.index]?.name).toBe("admin-home")
          }
        }
      })
    }
  }
}
