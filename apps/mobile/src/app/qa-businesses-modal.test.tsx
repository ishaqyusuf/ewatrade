import { afterAll, beforeEach, expect, mock, test } from "bun:test"
import { type ReactNode, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

const previousDev = Object.getOwnPropertyDescriptor(globalThis, "__DEV__")
Object.defineProperty(globalThis, "__DEV__", {
  configurable: true,
  value: false,
})

const qa: {
  clientEnabled: boolean
  capabilityAvailable: boolean
  authorization: { token: string } | null
} = {
  clientEnabled: true,
  capabilityAvailable: true,
  authorization: { token: "synthetic-authorization" },
}

mock.module("@/hooks/use-qa-accelerator", () => ({
  useQaAccelerator: () => qa,
}))
mock.module("@/lib/app-variant", () => ({
  isDevelopmentAppVariant: () => false,
}))
mock.module("@/components/mobile/appearances/workflow-chrome", () => ({
  MobileWorkflowChrome: ({ children }: { children: ReactNode }) => children,
}))
mock.module("@/components/mobile/qa-businesses-screen", () => ({
  QaBusinessesScreen: () =>
    createElement("div", { "data-qa-businesses": true }),
}))
mock.module("react-native-reanimated", () => ({
  useReducedMotion: () => false,
}))
mock.module("expo-router", () => ({
  Redirect: ({ href }: { href: string }) =>
    createElement("div", { "data-redirect": href }),
  Stack: { Screen: () => null },
  useRouter: () => ({ canGoBack: () => false, back() {}, replace() {} }),
}))

const { default: QaBusinessesModalRoute } = await import(
  "./qa-businesses-modal"
)
const render = () => renderToStaticMarkup(createElement(QaBusinessesModalRoute))

beforeEach(() => {
  qa.clientEnabled = true
  qa.capabilityAvailable = true
  qa.authorization = { token: "synthetic-authorization" }
})
afterAll(() => {
  if (previousDev) Object.defineProperty(globalThis, "__DEV__", previousDev)
  else Reflect.deleteProperty(globalThis, "__DEV__")
  mock.restore()
})

test("opens the authorized QA full chooser in a released Preview client", () => {
  expect(render()).toContain("data-qa-businesses")
})

test("excludes the Production/no-op client even if stale QA state exists", () => {
  qa.clientEnabled = false
  expect(render()).toContain('data-redirect="/"')
})

test("refuses an unavailable server capability", () => {
  qa.capabilityAvailable = false
  expect(render()).toContain('data-redirect="/"')
})

test("refuses a missing or cleared authorization", () => {
  qa.authorization = null
  expect(render()).toContain('data-redirect="/"')
})
