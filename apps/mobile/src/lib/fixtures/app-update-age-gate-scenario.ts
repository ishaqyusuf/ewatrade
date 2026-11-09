import { mock } from "bun:test"
import assert from "node:assert/strict"
import { type ReactNode, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

const box = ({ children }: { children?: ReactNode }) =>
  createElement("div", null, children)
let auth = { isAuthenticated: true, token: "test", signOutLocal() {} }
let status: Record<string, unknown> = { isPending: true }
Object.assign(globalThis, { __DEV__: false })
mock.module("@/components/app-auto-update-modal", () => ({
  AppAutoUpdateModal: ({ restoreRoute }: { restoreRoute: boolean }) =>
    createElement("span", { "data-update-restore": String(restoreRoute) }),
}))
mock.module("@/hooks/use-auth", () => ({ useAuthContext: () => auth }))
mock.module("@/lib/session-store", () => ({ isLocalSessionToken: () => false }))
mock.module("@/runtime/analytics-runtime", () => ({
  AnalyticsRuntime: () => null,
}))
mock.module("@/trpc/client", () => ({
  useTRPC: () => ({
    serviceCommerce: {
      accountAgeStatus: { queryOptions() {} },
      accountDeclareAgeBand: { mutationOptions() {} },
    },
  }),
}))
mock.module("@tanstack/react-query", () => ({
  useQuery: () => ({ ...status, refetch() {} }),
  useMutation: () => ({ isPending: false }),
}))
mock.module("@/components/ui/pressable", () => ({ Pressable: box }))
mock.module("@/components/ui/text", () => ({ Text: box }))
mock.module("react-native", () => ({ View: box }))
mock.module("@/components/mobile/auth-header", () => ({
  AuthActionButton: box,
  AuthBrandHeader: box,
}))
mock.module("@/components/mobile/green-till/auth-screen", () => ({
  AuthFlowScreen: ({
    children,
    title,
  }: { children?: ReactNode; title?: string }) =>
    createElement("main", null, createElement("h1", null, title), children),
}))

const { AccountAgeStartupGate } = await import(
  "@/components/mobile/account-age-startup-gate"
)
const render = () =>
  renderToStaticMarkup(createElement(AccountAgeStartupGate, null, "WORKSPACE"))
for (const ageBand of [null, "UNDECLARED"]) {
  status = { isSuccess: true, data: { ageBand, eligible: false } }
  const markup = render()
  assert.ok(
    markup.includes("Confirm your age range"),
    `${ageBand}: show declaration controls, not an underage refusal`,
  )
  for (const label of ["Under 13", "13–15", "16–17", "18 or older"])
    assert.ok(markup.includes(label), `${ageBand}: missing ${label}`)
  assert.ok(markup.includes('data-update-restore="false"'))
  assert.ok(!markup.includes("WORKSPACE"))
}
status = { isSuccess: true, data: { ageBand: "UNDER_13", eligible: false } }
const underageMarkup = render()
assert.ok(underageMarkup.includes("available"))
assert.ok(!underageMarkup.includes("Confirm your age range"))
assert.ok(!underageMarkup.includes("18 or older"))
assert.ok(!underageMarkup.includes("WORKSPACE"))
assert.ok(underageMarkup.includes('data-update-restore="false"'))
// The current gate opens the workspace while the background status request is
// pending or unavailable; the normal workspace owns updates in these states.
for (const value of [
  { isPending: true },
  { isError: true },
  ...["ADULT", "AGE_13_TO_15", "AGE_16_TO_17"].map((ageBand) => ({
    isSuccess: true,
    data: { ageBand, eligible: true },
  })),
]) {
  status = value
  assert.equal(render(), "WORKSPACE")
}
auth = { ...auth, isAuthenticated: false }
assert.equal(render(), "WORKSPACE")
console.log("age-gate: passed")
