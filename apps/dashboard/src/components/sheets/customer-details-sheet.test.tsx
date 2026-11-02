import { afterEach, expect, mock, test } from "bun:test"
import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import { QueryClientProvider } from "@tanstack/react-query"
import { TRPCClientError, createTRPCClient } from "@trpc/client"
import { observable } from "@trpc/server/observable"
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query"
import { DOMImplementation } from "@xmldom/xmldom"
import { NuqsTestingAdapter } from "nuqs/adapters/testing"
import { type ComponentProps, type ReactNode, act } from "react"

// Actual contact sheet, Customer form, URL state, tRPC options and app
// QueryClient. Transport and presentation are inert; no DB or provider.
mock.module("@/observability/sentry", () => ({ captureDashboardError() {} }))
const { makeQueryClient } = await import("@/trpc/query-client")
let client = makeQueryClient()
type Op = { path: string; type: string; input: unknown }
const ops: Op[] = []
const initial = {
  id: "customer-a",
  name: "Halima",
  email: "halima@example.invalid",
  phone: "+2348000000001",
}
let contact = { ...initial }
let refuse = false
const stamp = new Date("2026-10-02T00:00:00Z")
const denial = "You do not have permission to use the customer directory."
const rpc = createTRPCClient<AppRouter>({
  links: [
    () =>
      ({ op }) =>
        observable((observer) => {
          ops.push({ path: op.path, type: op.type, input: op.input })
          if (op.path === "customers.contact" && refuse) {
            observer.error(
              new TRPCClientError(denial, {
                result: {
                  error: {
                    code: -32003,
                    message: denial,
                    data: { code: "FORBIDDEN", httpStatus: 403 },
                  },
                },
              }),
            )
            return
          }
          if (op.path === "customers.update") {
            const { name } = op.input as { name?: string }
            if (name) contact = { ...contact, name }
            observer.next({
              result: {
                data: { ...contact, createdAt: stamp, updatedAt: new Date() },
              },
            })
            observer.complete()
            return
          }
          const data =
            op.path === "customers.contact"
              ? { ...contact }
              : op.path === "customers.getById"
                ? {
                    ...contact,
                    createdAt: stamp,
                    updatedAt: stamp,
                    revision: stamp.toISOString(),
                    orders: [],
                  }
                : null
          if (!data) {
            observer.error(new TRPCClientError("Unexpected inert operation"))
            return
          }
          observer.next({ result: { data } })
          observer.complete()
        }),
  ],
})
const trpc = createTRPCOptionsProxy<AppRouter>({
  client: rpc,
  queryClient: () => client,
})
mock.module("@/trpc/client", () => ({ useTRPC: () => trpc }))
let changeSheet: ((open: boolean) => void) | undefined
const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>
mock.module("@ewatrade/ui", () => ({
  Alert: ({ children }: { children?: ReactNode }) => (
    <div role="alert">{children}</div>
  ),
  AlertDescription: Pass,
  Button: (props: ComponentProps<"button">) => <button {...props} />,
  ControlField: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  Input: (props: ComponentProps<"input">) => <input {...props} />,
  Sheet: ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    children?: ReactNode
  }) => {
    changeSheet = onOpenChange
    return open ? <section>{children}</section> : null
  },
}))
mock.module("@/components/sheets/sheet-frame", () => ({
  SheetFrame: ({
    title,
    children,
    footer,
  }: { title: string; children?: ReactNode; footer?: ReactNode }) => (
    <div>
      <h2>{title}</h2>
      {children}
      {footer}
    </div>
  ),
}))

const document = new DOMImplementation().createDocument(
  "http://www.w3.org/1999/xhtml",
  "html",
  null,
)
const location = {
  origin: "https://inert.invalid",
  href: "https://inert.invalid/customers",
  pathname: "/customers",
  search: "",
}
const window = {
  document,
  location,
  HTMLIFrameElement: class {},
  HTMLElement: class {},
  addEventListener() {},
  removeEventListener() {},
}
Object.assign(globalThis, {
  window,
  document,
  location,
  IS_REACT_ACT_ENVIRONMENT: true,
})
Object.assign(document, {
  defaultView: window,
  addEventListener() {},
  removeEventListener() {},
})
const element = document.createElement.bind(document)
document.createElement = (name: string) =>
  Object.assign(element(name), {
    style: {},
    focus() {},
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
const { CustomerDetailsSheet } = await import("./customer-details-sheet")
const { CustomerFormSheet } = await import(
  "@/components/customers/customer-form-sheet"
)

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 8))
const host = document.createElement("div")
let root: ReturnType<typeof createRoot> | undefined
async function mount(params: Record<string, string>, node: ReactNode) {
  root ??= createRoot(host as unknown as HTMLElement)
  await act(async () => {
    root?.render(
      <QueryClientProvider client={client}>
        <NuqsTestingAdapter searchParams={params} hasMemory>
          {node}
        </NuqsTestingAdapter>
      </QueryClientProvider>,
    )
    await settle()
  })
}
async function invoke(
  target: object | undefined,
  event: string,
  value: unknown,
) {
  const props = Object.entries(target ?? {}).find(([key]) =>
    key.startsWith("__reactProps$"),
  )?.[1] as Record<string, (value: unknown) => unknown> | undefined
  const handler = props?.[event]
  if (!handler) throw new Error(`Mounted ${event} handler unavailable`)
  await act(async () => {
    await handler(value)
    await settle()
  })
}

async function waitForForm() {
  for (let attempt = 0; attempt < 30; attempt++) {
    await act(async () => {
      await settle()
    })
    if (host.getElementsByTagName("input").length === 3) return
  }
  throw new Error("Actual Customer edit form did not finish its initial read")
}

async function waitForContact() {
  for (let attempt = 0; attempt < 30; attempt++) {
    await act(async () => {
      await settle()
    })
    if (host.getElementsByTagName("dl").length === 1) return
  }
  throw new Error("Actual contact sheet did not finish its initial read")
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  root = undefined
  client.clear()
  client = makeQueryClient()
  ops.length = 0
  contact = { ...initial }
  refuse = false
  changeSheet = undefined
})

test("the contact sheet reads only the contact projection and closes without commands", async () => {
  await mount({ customerDetail: "customer-a" }, <CustomerDetailsSheet />)
  await waitForContact()
  expect(ops).toEqual([
    {
      path: "customers.contact",
      type: "query",
      input: { customerId: "customer-a" },
    },
  ])
  for (const value of Object.values(initial).slice(1))
    expect(host.textContent).toContain(value)
  await act(async () => {
    changeSheet?.(false)
    await settle()
  })
  expect(host.textContent).not.toContain("Halima")
  expect(ops).toHaveLength(1)
})

test("a fresh refusal erases contact details after broad customer invalidation", async () => {
  await mount({ customerDetail: "customer-a" }, <CustomerDetailsSheet />)
  await waitForContact()
  refuse = true
  await act(async () => {
    await client.invalidateQueries({ queryKey: trpc.customers.pathKey() })
    await settle()
  })
  expect(ops.filter((op) => op.path === "customers.contact")).toHaveLength(2)
  expect(host.textContent).toContain(denial)
  expect(host.textContent).not.toContain("Halima")
  expect(host.textContent).not.toContain("halima@example.invalid")
  expect(ops.every((op) => op.type === "query")).toBe(true)
})

test("saving the Customer form refreshes an open contact sheet", async () => {
  const saved: { name: string; created: boolean }[] = []
  await mount(
    {
      customerDetail: "customer-a",
      customerSheet: "edit",
      customerId: "customer-a",
    },
    <>
      <CustomerDetailsSheet />
      <CustomerFormSheet onSaved={(result) => saved.push(result)} />
    </>,
  )
  await waitForForm()
  await waitForContact()
  await invoke(host.getElementsByTagName("input")[0], "onChange", {
    target: { value: "Halima Musa" },
  })
  await invoke(host.getElementsByTagName("form")[0], "onSubmit", {
    preventDefault() {},
  })
  expect(
    ops.filter((op) => op.type === "mutation").map((op) => op.path),
  ).toEqual(["customers.update"])
  expect(ops.filter((op) => op.path === "customers.contact")).toHaveLength(2)
  expect(host.textContent).toContain("Halima Musa")
  expect(saved).toEqual([{ name: "Halima Musa", created: false }])
})
