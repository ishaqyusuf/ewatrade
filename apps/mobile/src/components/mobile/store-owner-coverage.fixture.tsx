import { beforeEach, expect, mock, test } from "bun:test"
import { type ReactNode, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

const actions: string[] = []
const presses: Array<() => void> = []
let confirmation: Array<{ text: string; onPress?: () => void }> = []
const initial = () => ({
  catalog: {
    data: {
      billingScope: "owner",
      coverageAvailable: true,
      ownerCoverage: {
        enrolled: false,
        reason: "uncovered",
        businessLimit: 3,
        coveredBusinessCount: 1,
      },
    },
  },
  verification: { isPending: false },
  coveragePending: false,
  changeCoverage: async (action: string) => {
    actions.push(action)
  },
})
let billing = initial()
mock.module("./store-subscription-provider", () => ({
  useStoreSubscription: () => billing,
}))
mock.module("@/components/ui/view", () => ({
  View: ({ children }: { children: ReactNode }) =>
    createElement("div", null, children),
}))
mock.module("@/components/ui/text", () => ({
  Text: ({ children }: { children: ReactNode }) =>
    createElement("span", null, children),
}))
mock.module("@/components/ui/pressable", () => ({
  Pressable: ({
    children,
    onPress,
    disabled,
  }: { children: ReactNode; onPress: () => void; disabled: boolean }) => {
    if (!disabled) presses.push(onPress)
    return createElement("button", { disabled, type: "button" }, children)
  },
}))
mock.module("react-native", () => ({
  Alert: {
    alert: (_title: string, _message: string, buttons: typeof confirmation) => {
      confirmation = buttons
    },
  },
}))
const { StoreOwnerCoverage } = await import("./store-owner-coverage")
const render = () => renderToStaticMarkup(createElement(StoreOwnerCoverage))
beforeEach(() => {
  billing = initial()
  actions.length = 0
  presses.length = 0
  confirmation = []
})
test("uncovered business can explicitly enroll without implying a new charge", async () => {
  const markup = render()
  expect(markup).toContain("Cover this business")
  expect(markup).toContain("1 of 3 business slots in use.")
  expect(markup).toContain("Staff do not need separate subscriptions.")
  presses[0]?.()
  expect(actions).toEqual(["enroll"])
})
test("saved inactive coverage requires confirmation before release", () => {
  billing.catalog.data.ownerCoverage = {
    enrolled: true,
    reason: "inactive_subscription",
    businessLimit: 0,
    coveredBusinessCount: 0,
  }
  expect(render()).toContain("Release this business")
  presses[0]?.()
  expect(actions).toEqual([])
  expect(confirmation[0]?.text).toBe("Keep coverage")
  confirmation[1]?.onPress?.()
  expect(actions).toEqual(["release"])
})
test("full slots and disabled coverage expose no enroll action", () => {
  billing.catalog.data.ownerCoverage.coveredBusinessCount = 3
  expect(render()).toContain("All business slots are in use.")
  expect(presses).toHaveLength(0)
  billing.catalog.data.ownerCoverage.enrolled = true
  billing.catalog.data.coverageAvailable = false
  expect(render()).not.toContain("Release this business</span>")
  expect(presses).toHaveLength(0)
})
test("legacy billing has no owner coverage controls", () => {
  billing.catalog.data.billingScope = "business"
  expect(render()).toBe("")
})
