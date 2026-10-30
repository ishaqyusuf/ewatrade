import { afterEach, expect, mock, test } from "bun:test"
import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
} from "@tanstack/react-query"
import { createTRPCClient } from "@trpc/client"
import { observable } from "@trpc/server/observable"
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query"
import { DOMImplementation } from "@xmldom/xmldom"
import { type ReactNode, act, useEffect, useState } from "react"

const document = new DOMImplementation().createDocument(
  "http://www.w3.org/1999/xhtml",
  "html",
  null,
)
const window = {
  document,
  HTMLIFrameElement: class {},
  HTMLElement: class {},
  addEventListener() {},
  removeEventListener() {},
}
Object.assign(globalThis, { window, document, IS_REACT_ACT_ENVIRONMENT: true })
Object.assign(document, {
  defaultView: window,
  addEventListener() {},
  removeEventListener() {},
})
const element = document.createElement.bind(document)
document.createElement = (name: string) =>
  Object.assign(element(name), {
    style: {},
    addEventListener() {},
    removeEventListener() {},
  })
const text = document.createTextNode.bind(document)
document.createTextNode = (value: string) => {
  const node = text(value)
  Object.defineProperty(node, "nodeValue", {
    get: () => node.data,
    set: (next: string) => {
      node.data = next
    },
  })
  return node
}
const { createRoot } = await import("react-dom/client")
notifyManager.setScheduler((callback) => queueMicrotask(callback))
const client = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})
let reads = 0
let denied = false
const rpc = createTRPCClient<AppRouter>({
  links: [
    () =>
      ({ op }) =>
        observable((observer) => {
          expect(op.path).toBe("qaAccess.fixtureContext")
          reads++
          if (denied) observer.error(new Error("inert fixture refusal"))
          else {
            observer.next({
              result: {
                data: {
                  currencyCode: "NGN",
                  qaDomain: "inert.qa.test",
                  seed: "seed",
                  storeId: "store",
                  tenantId: "tenant",
                  testerIdentity: "inert",
                  timezone: "UTC",
                },
              },
            })
            observer.complete()
          }
        }),
  ],
})
const trpc = createTRPCOptionsProxy<AppRouter>({
  client: rpc,
  queryClient: client,
})
mock.module("@/trpc/client", () => ({ useTRPC: () => trpc }))
mock.module("@ewatrade/ui", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Button: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
}))
mock.module("@/components/modals/confirm-draft-modal", () => ({
  ConfirmDraftModal: () => null,
}))
const { QaDashboardProvider, QaDashboardQuickFill } = await import(
  "./qa-quick-fill"
)
const { QaDashboardProvider: ProductionProvider } = await import(
  "./qa-quick-fill.production"
)
let mounts = 0
let edit: (value: string) => void = () => {}
function Draft() {
  const [value, setValue] = useState("draft")
  edit = setValue
  useEffect(() => {
    mounts++
  }, [])
  return (
    <>
      <output>{value}</output>
      <QaDashboardQuickFill
        formId="inert"
        onFill={() => {
          throw new Error("No fill requested")
        }}
      />
    </>
  )
}
const container = document.createElement("div")
let root: ReturnType<typeof createRoot> | undefined
async function render(enabled: boolean | Promise<boolean>) {
  root ??= createRoot(container as unknown as HTMLElement)
  await act(async () => {
    root?.render(
      <QueryClientProvider client={client}>
        <QaDashboardProvider enabled={enabled}>
          <Draft />
        </QaDashboardProvider>
      </QueryClientProvider>,
    )
    await new Promise((resolve) => setTimeout(resolve, 8))
  })
}
async function settle(work: () => void) {
  await act(async () => {
    work()
    await new Promise((resolve) => setTimeout(resolve, 8))
  })
}
afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  root = undefined
  client.clear()
  reads = 0
  mounts = 0
  denied = false
})

test("pending policy leaves actual children mounted and editable; activation preserves their draft", async () => {
  const policy = Promise.withResolvers<boolean>()
  await render(policy.promise)
  expect(container.textContent).toBe("draft")
  expect(reads).toBe(0)
  await settle(() => edit("edited before policy"))
  await settle(() => policy.resolve(true))
  expect(container.textContent).toBe("edited before policyQuick FillQA")
  expect(reads).toBe(1)
  expect(mounts).toBe(1)
  await render(policy.promise)
  expect(reads).toBe(1)
  expect(mounts).toBe(1)
})

test("disabled or failed optional policy starts no fixture query and keeps the ordinary page", async () => {
  const policy = Promise.withResolvers<boolean>()
  await render(policy.promise)
  await settle(() => policy.reject(new Error("inert policy failure")))
  expect(container.textContent).toBe("draft")
  await render(false)
  expect(reads).toBe(0)
  expect(mounts).toBe(1)
})

test("a replaced policy ignores late resolution and immediately hides retained QA controls", async () => {
  const old = Promise.withResolvers<boolean>()
  const current = Promise.withResolvers<boolean>()
  await render(old.promise)
  await render(current.promise)
  await settle(() => old.resolve(true))
  expect(reads).toBe(0)
  await settle(() => current.resolve(false))
  expect(reads).toBe(0)
  await render(true)
  expect(reads).toBe(1)
  expect(container.textContent).toBe("draftQuick FillQA")
  const replacement = Promise.withResolvers<boolean>()
  await render(replacement.promise)
  expect(container.textContent).toBe("draft")
  expect(reads).toBe(1)
  await settle(() => replacement.resolve(false))
  expect(container.textContent).toBe("draft")
  expect(mounts).toBe(1)
})

test("allowed display policy cannot substitute for the authenticated fixture admission", async () => {
  denied = true
  await render(Promise.resolve(true))
  expect(reads).toBe(1)
  expect(container.textContent).toBe("draft")
  expect(mounts).toBe(1)
})

test("unmounted providers ignore late policy deliveries", async () => {
  const policy = Promise.withResolvers<boolean>()
  await render(policy.promise)
  await act(async () => root?.unmount())
  root = undefined
  await settle(() => policy.resolve(true))
  expect(reads).toBe(0)
})

test("production replacement renders children without consuming QA policy or fetching", async () => {
  const policy = Promise.withResolvers<boolean>()
  root = createRoot(container as unknown as HTMLElement)
  await act(async () =>
    root?.render(
      <ProductionProvider enabled={policy.promise}>
        <output>production page</output>
      </ProductionProvider>,
    ),
  )
  expect(container.textContent).toBe("production page")
  expect(reads).toBe(0)
})
