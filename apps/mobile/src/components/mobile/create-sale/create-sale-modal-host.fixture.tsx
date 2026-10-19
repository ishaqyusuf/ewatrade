import { expect, mock, test } from "bun:test"
import { DOMParser } from "@xmldom/xmldom"
import {
  type ReactNode,
  act,
  createContext,
  createElement,
  useContext,
} from "react"

// The actual create-sale-modal route. Ports record real ancestry via context:
// on iOS this route is a native modal, so its gorhom sheets (checkout Money
// Account chooser, success sheet) must host inside a provider within the
// route, not only in the root provider behind the presented UIKit view.
const source = new URL("../../../", import.meta.url)
const port = (path: string, exports: Record<string, unknown>) =>
  mock.module(new URL(path, source).pathname, () => exports)
let seen: Array<{
  name: string
  within: string[]
  props: Record<string, unknown>
}> = []
const Ancestors = createContext<string[]>([])
const node =
  (name: string) =>
  (props: Record<string, unknown> & { children?: ReactNode }) => {
    const within = useContext(Ancestors)
    seen.push({ name, within, props })
    return createElement(
      Ancestors.Provider,
      { value: [...within, name] },
      createElement("div", null, props.children),
    )
  }
mock.module("@gorhom/bottom-sheet", () => ({
  BottomSheetModalProvider: node("BottomSheetModalProvider"),
}))
port("components/mobile/index.ts", {
  WorkflowModalScreen: node("WorkflowModalScreen"),
})
port("components/mobile/appearances/classic/sale-success-sheet", {
  ClassicSaleSuccessSheet: node("ClassicSaleSuccessSheet"),
})
port("components/mobile/create-sale/create-sale-screen", {
  CreateSaleContent: node("CreateSaleContent"),
})
port("components/mobile/create-sale/create-sale-workflow-chrome", {
  CreateSaleWorkflowChrome: () => null,
})
port("hooks/use-auth", {
  useAuthContext: () => ({ profile: { name: "Jawdah QA Owner" } }),
})
let params: Record<string, string> = {}
mock.module("expo-router", () => ({ useLocalSearchParams: () => params }))
const { default: CreateSaleModalRoute } = await import(
  "../../../app/create-sale-modal"
)

async function mount(next: Record<string, string>) {
  params = next
  seen = []
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
  await act(async () => root.render(createElement(CreateSaleModalRoute)))
  const find = (name: string) => {
    const hit = seen.findLast((entry) => entry.name === name)
    if (!hit) throw Error(`${name} not rendered`)
    return hit
  }
  return {
    find,
    has: (name: string) => seen.some((entry) => entry.name === name),
    record: (completion: Record<string, unknown>) =>
      act(async () => {
        const onRecorded = find("CreateSaleContent").props.onRecorded as (
          value: unknown,
        ) => void
        onRecorded(completion)
      }),
    close: () => act(async () => root.unmount()),
  }
}

test("the route hosts its own bottom sheets around the whole checkout workflow", async () => {
  const ui = await mount({})
  try {
    expect(ui.find("BottomSheetModalProvider").within).toEqual([])
    expect(ui.find("WorkflowModalScreen").within).toEqual([
      "BottomSheetModalProvider",
    ])
    expect(ui.find("CreateSaleContent").within).toEqual([
      "BottomSheetModalProvider",
      "WorkflowModalScreen",
    ])
  } finally {
    await ui.close()
  }
})

test("route props, initial target and customer are unchanged", async () => {
  const ui = await mount({
    catalogItemId: "catalog-1",
    offeringId: "offering-1",
    customerName: "Ada Nwosu (QA)",
    customerId: "customer-1",
    customerPhone: "+2348000000000",
  })
  try {
    const screen = ui.find("WorkflowModalScreen").props
    expect(screen.allowSalesRep).toBe(true)
    expect(screen.closeLabel).toBe("Close create sale")
    expect(screen.title).toBe("Create sale")
    expect(typeof screen.chrome).toBe("function")
    const content = ui.find("CreateSaleContent").props
    expect(content).toMatchObject({
      attendantName: "Jawdah QA Owner",
      initialCatalogItemId: "catalog-1",
      initialOfferingId: "offering-1",
      initialCustomer: {
        id: "customer-1",
        name: "Ada Nwosu (QA)",
        phone: "+2348000000000",
      },
      presentation: "screen",
    })
    expect(content.itemKind).toBeUndefined()
  } finally {
    await ui.close()
  }
})

test("a recorded service sale rises its success sheet inside the local host", async () => {
  const ui = await mount({ kind: "service" })
  try {
    expect(ui.find("WorkflowModalScreen").props.title).toBe("New service order")
    expect(ui.has("ClassicSaleSuccessSheet")).toBe(false)
    await ui.record({
      amount: "5500",
      orderId: "order-1",
      paymentMethod: "bank_transfer",
      unitCount: "2",
      balance: "0",
      customer: "Walk-in",
      itemCount: 2,
      paymentState: "paid",
      reference: "ORD-044",
      status: "confirmed",
      moneyAccount: "Bank account",
    })
    const success = ui.find("ClassicSaleSuccessSheet")
    expect(success.within).toEqual([
      "BottomSheetModalProvider",
      "WorkflowModalScreen",
    ])
    expect(success.props.params).toMatchObject({
      orderId: "order-1",
      itemCount: "2",
      kind: "order",
      moneyAccount: "Bank account",
      saleKind: "service",
    })
  } finally {
    await ui.close()
  }
})
