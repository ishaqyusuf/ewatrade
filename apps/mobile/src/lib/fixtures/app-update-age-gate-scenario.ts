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
mock.module("@/components/mobile/screen", () => ({ MobileScreen: box }))
mock.module("@/components/mobile/status-banner", () => ({ StatusBanner: box }))

const { AccountAgeStartupGate } = await import(
  "@/components/mobile/account-age-startup-gate"
)
const render = () =>
  renderToStaticMarkup(createElement(AccountAgeStartupGate, null, "WORKSPACE"))
for (const value of [
  { isPending: true },
  { isError: true },
  { isSuccess: true, data: { eligible: false } },
]) {
  status = value
  const markup = render()
  assert.ok(markup.includes('data-update-restore="false"'))
  assert.ok(!markup.includes("WORKSPACE"))
}
status = { isSuccess: true, data: { eligible: true } }
assert.equal(render(), "WORKSPACE")
auth = { ...auth, isAuthenticated: false }
assert.equal(render(), "WORKSPACE")
console.log("age-gate: passed")
