import { expect, mock, test } from "bun:test"
import { DOMParser } from "@xmldom/xmldom"
import { type ReactNode, act, createElement } from "react"

const buttons = new Map<string, { disabled?: boolean; onClick?: () => void }>()
let openMenu: ((open: boolean) => void) | undefined
const tag =
  (name: string) =>
  ({ children }: { children?: ReactNode }) =>
    createElement(name, null, children)
mock.module("@ewatrade/ui", () => ({
  Button: tag("button"),
  DropdownMenu: ({
    children,
    onOpenChange,
  }: { children: ReactNode; onOpenChange: (open: boolean) => void }) => {
    openMenu = onOpenChange
    return children
  },
  DropdownMenuContent: tag("div"),
  DropdownMenuGroup: tag("section"),
  DropdownMenuLabel: tag("label"),
  DropdownMenuSeparator: tag("hr"),
  DropdownMenuTrigger: tag("button"),
  DropdownMenuItem: (props: {
    children: string
    onClick?: () => void
    disabled?: boolean
  }) => {
    buttons.set(props.children, props)
    return createElement(
      "button",
      { type: "button", disabled: props.disabled },
      props.children,
    )
  },
}))
let tenantId = "freshcare"
let saved = false
const writes: unknown[] = []
const forms: unknown[] = []
const added: unknown[] = []
const invalidations: unknown[] = []
const savedChoice = {
  offeringId: "socks-offer",
  itemId: "laundry",
  itemName: "Laundry",
}
const client = {
  tenant: {
    current: {
      query: async () => ({
        tenant: { id: tenantId },
        activeStore: { id: "main" },
      }),
    },
  },
  catalog: {
    listItemsPage: {
      query: async (input: { query?: string }) => ({
        items: input.query
          ? saved
            ? [
                {
                  id: "laundry",
                  name: "Laundry",
                  status: "active",
                  variants: [
                    {
                      status: "active",
                      offerings: [
                        {
                          id: "socks-offer",
                          name: "Socks · Wash & iron",
                          status: "active",
                          pricingPolicy: "fixed",
                          fixedPriceMinor: 10_000,
                          stores: [{ storeId: "main", isAvailable: true }],
                        },
                      ],
                    },
                  ],
                },
              ]
            : []
          : [
              { id: "laundry", name: "Laundry" },
              { id: "cleaning", name: "Home Cleaning" },
            ],
        nextCursor: null,
      }),
    },
    addServiceChoice: {
      mutate: async (input: unknown) => {
        writes.push(input)
        return savedChoice
      },
    },
  },
}
const trpc = { catalog: { pathFilter: () => ({ queryKey: ["catalog"] }) } }
mock.module("@/trpc/client", () => ({
  useTRPCClient: () => client,
  useTRPC: () => trpc,
  getDataCacheGeneration: () => 1,
}))
mock.module("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: async (input: unknown) => {
      invalidations.push(input)
    },
  }),
}))
mock.module("@/hooks/use-catalog-item-params", () => ({
  useCatalogItemParams: () => ({
    setParams: async (input: unknown) => {
      forms.push(input)
    },
  }),
}))
const { CreateServiceChoice } = await import("./create-service-choice")
async function mount() {
  const document = new DOMParser().parseFromString(
    "<html><body/></html>",
    "text/html",
  )
  const window = {
    document,
    HTMLIFrameElement: class {},
    HTMLElement: class {},
    addEventListener() {},
    removeEventListener() {},
  }
  Object.assign(globalThis, {
    document,
    window,
    IS_REACT_ACT_ENVIRONMENT: true,
  })
  Object.assign(document, {
    defaultView: window,
    addEventListener() {},
    removeEventListener() {},
  })
  const create = document.createElement.bind(document)
  document.createElement = (name: string) =>
    Object.assign(create(name), {
      style: {},
      addEventListener() {},
      removeEventListener() {},
    })
  const host = document.createElement("div")
  document.documentElement?.appendChild(host)
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(host as unknown as HTMLElement)
  await act(async () =>
    root.render(
      createElement(CreateServiceChoice, {
        handoff: {
          kind: "service",
          name: "Socks · Wash & iron",
          origin: { tenantId: "freshcare", storeId: "main" },
        },
        priceMinor: 10_000,
        onAdded: (choice) => {
          added.push(choice)
        },
      }),
    ),
  )
  return {
    text: () => host.textContent ?? "",
    menu: () => act(async () => openMenu?.(true)),
    press: (name: string) =>
      act(async () => {
        const button = buttons.get(name)
        if (!button || button.disabled) throw Error(`Unavailable: ${name}`)
        button.onClick?.()
      }),
    close: () => act(async () => root.unmount()),
  }
}
function reset() {
  tenantId = "freshcare"
  saved = false
  writes.length = 0
  forms.length = 0
  added.length = 0
  invalidations.length = 0
  buttons.clear()
}

test("Create lists separate Service first; selecting Laundry saves once in place and resolves the job line without a form", async () => {
  reset()
  const view = await mount()
  expect(writes).toHaveLength(0)
  await view.menu()
  expect(view.text().indexOf("Create separate service")).toBeLessThan(
    view.text().indexOf("Laundry"),
  )
  await view.press("Laundry")
  expect(writes).toEqual([
    {
      itemId: "laundry",
      originTenantId: "freshcare",
      storeId: "main",
      name: "Socks · Wash & iron",
      priceMinor: 10_000,
      clientOperationId: expect.any(String),
    },
  ])
  expect(forms).toHaveLength(0)
  expect(view.text()).toContain("Added to Laundry")
  expect(added).toEqual([savedChoice])
  expect(invalidations).toHaveLength(1)
  await view.close()
})
test("reopened saved cards reconcile the existing choice without writing again", async () => {
  reset()
  saved = true
  const view = await mount()
  expect(view.text()).toContain("Added to Laundry")
  expect(writes).toHaveLength(0)
  expect(added).toEqual([savedChoice])
  await view.close()
})
test("a changed business refuses the click; choosing separate Service only opens its existing prefilled form", async () => {
  reset()
  const view = await mount()
  await view.menu()
  tenantId = "foreign"
  await view.press("Laundry")
  expect(view.text()).toContain("original business and Store")
  expect(writes).toHaveLength(0)
  expect(forms).toHaveLength(0)
  tenantId = "freshcare"
  await view.press("Create separate service")
  expect(writes).toHaveLength(0)
  expect(forms).toEqual([
    expect.objectContaining({
      catalogItem: "create",
      catalogCreateKind: "service",
      catalogCreateName: "Socks · Wash & iron",
      catalogCreatePrice: "10000",
    }),
  ])
  await view.close()
})
