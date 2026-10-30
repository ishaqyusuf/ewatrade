import { afterEach, expect, mock, test } from "bun:test"
import { type ReactNode, isValidElement } from "react"

let resolvePolicy: (value: { QA_ACCELERATOR_ENABLED: string }) => void =
  () => {}
let rejectPolicy: (error: Error) => void = () => {}
let policy = Promise.withResolvers<{ QA_ACCELERATOR_ENABLED: string }>()
let reads = 0
const appEnv = process.env.APP_ENV
const nodeEnv = process.env.NODE_ENV
const Providers = (_props: {
  children: ReactNode
  qaAcceleratorEnabled: boolean | Promise<boolean>
}) => null
mock.module("@ewatrade/ui/globals.css", () => ({}))
mock.module("@/styles/dashboard.css", () => ({}))
mock.module("next/font/google", () => ({
  Figtree: () => ({ variable: "font" }),
}))
mock.module("@/components/analytics/events-provider", () => ({
  DashboardEventsProvider: ({ children }: { children: ReactNode }) => children,
}))
mock.module("./providers", () => ({ Providers }))
mock.module("@ewatrade/utils/qa-policy-server", () => ({
  getQaPolicyEnvironment: () => {
    reads++
    return policy.promise
  },
}))
const { default: RootLayout } = await import("./layout")

function providersIn(
  node: unknown,
): Parameters<typeof Providers>[0] | undefined {
  if (!isValidElement<{ children?: unknown }>(node)) return
  if (node.type === Providers) {
    if (isValidElement<Parameters<typeof Providers>[0]>(node)) return node.props
  }
  for (const child of [node.props.children].flat()) {
    const found = providersIn(child)
    if (found) return found
  }
}
function begin(mode: string) {
  process.env.APP_ENV = mode
  Reflect.set(process.env, "NODE_ENV", "production")
  reads = 0
  policy = Promise.withResolvers()
  resolvePolicy = policy.resolve
  rejectPolicy = policy.reject
}
afterEach(() => {
  if (appEnv === undefined) Reflect.deleteProperty(process.env, "APP_ENV")
  else process.env.APP_ENV = appEnv
  if (nodeEnv === undefined) Reflect.deleteProperty(process.env, "NODE_ENV")
  else Reflect.set(process.env, "NODE_ENV", nodeEnv)
})

test("actual root returns document and page composition while optional QA policy is pending", async () => {
  begin("local")
  const pending = RootLayout({
    children: <main>authorized page boundary</main>,
  })
  const returned = await Promise.race([
    Promise.resolve(pending).then((value) => ({ value })),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 20)),
  ])
  resolvePolicy({ QA_ACCELERATOR_ENABLED: "true" })
  await pending
  expect(returned).not.toBeNull()
  const props = providersIn(returned?.value)
  expect(props).toBeDefined()
  expect(reads).toBe(1)
  expect(await props?.qaAcceleratorEnabled).toBe(true)
})

test("policy failure disables only QA and leaves the root composition available", async () => {
  begin("preview")
  const pending = RootLayout({ children: <main>page</main> })
  rejectPolicy(new Error("inert policy failure"))
  const root = await pending
  expect(await providersIn(root)?.qaAcceleratorEnabled).toBe(false)
  expect(reads).toBe(1)
})

test("production and unknown variants start no dashboard QA policy read", async () => {
  for (const mode of ["production", "unknown"]) {
    begin(mode)
    const pending = RootLayout({ children: <main>page</main> })
    // Keep the old blocking implementation from leaking an unresolved test task.
    resolvePolicy({ QA_ACCELERATOR_ENABLED: "true" })
    expect(await providersIn(await pending)?.qaAcceleratorEnabled).toBe(false)
    expect(reads).toBe(0)
  }
})
