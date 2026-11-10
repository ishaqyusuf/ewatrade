import { expect, mock, test } from "bun:test"
import { DOMParser } from "@xmldom/xmldom"
import { type ReactNode, act, createElement, isValidElement } from "react"

// Actual shipment screens, real React state; inert queries/mutations and UI ports.
// This synthetic in-memory record is never sent to a database or provider.
const root = new URL("../../../../../", import.meta.url)
const port = (path: string, exports: Record<string, unknown>) =>
  mock.module(new URL(path, root).pathname, () => exports)
type Props = {
  children?: ReactNode
  title?: string
  label?: string
  accessibilityLabel?: string
  "aria-label"?: string
  value?: string
  disabled?: boolean
  onClick?: () => void
  onPress?: () => void
  onChange?: (event: { target: { value: string } }) => void
  onChangeText?: (value: string) => void
  footer?: ReactNode
  message?: string
}
const controls = new Map<string, Props>()
const textOf = (node: ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textOf).join("")
  return isValidElement<{ children?: ReactNode }>(node)
    ? textOf(node.props.children)
    : ""
}
const box = ({ children }: Props) => createElement("div", null, children)
const control = (props: Props) => {
  const label =
    props["aria-label"] ??
    props.accessibilityLabel ??
    props.label ??
    props.title ??
    textOf(props.children)
  controls.set(label, props)
  return createElement("div", null, props.children, props.message)
}
const line = (id: string, outstandingQuantity: string) => ({
  id,
  outstandingQuantity,
  expectedQuantity: outstandingQuantity,
  receivedQuantity: "0",
  balanceSourceId: `balance-${id}`,
  stockItem: { name: id, variantName: null },
  description: id,
  landedUnitMinor: "100",
  landedMinor: "100",
  unreceivedCostMinor: "100",
  goodsMinor: "100",
  freightMinor: "0",
  adjustmentMinor: "0",
})
let detail = {
  id: "shipment",
  bookId: "book",
  storeId: "store",
  status: "EXPECTED",
  revision: 1,
  supplierName: "Inert supplier",
  reference: null,
  rates: [],
  lines: [line("one", "0.5")],
  receipts: [],
  adjustments: [],
  totals: { landedMinor: "100", freightMinor: "0", adjustmentMinor: "0" },
}
type MutationInput = {
  lines: Array<{ quantity: string; categories: unknown[] }>
  offeringId?: string
  priceMinor?: number
  expectedRevision?: number
}
const calls: Array<{ path: string; input: MutationInput }> = []
let dashboardStep = "arrival"
let priceFailure: string | null = null
let refreshes = 0
type Offering = { id: string; revision: number; priceMinor: number }
let serverPrices: Record<string, Offering> = {}
let visiblePrices: Record<string, Offering> = {}
const endpoint = (path: string) => ({
  queryOptions: () => ({ path }),
  mutationOptions: () => ({ path }),
})
const trpc = {
  finance: {
    shipments: Object.fromEntries(
      [
        "detail",
        "confirm",
        "reopen",
        "receive",
        "mapLine",
        "adjustLineCost",
      ].map((path) => [path, endpoint(path)]),
    ),
  },
  inventory: { balanceReport: endpoint("balances") },
  catalog: { updatePrice: endpoint("price") },
}
for (const app of ["dashboard", "mobile"])
  port(`apps/${app}/src/trpc/client`, { useTRPC: () => trpc })
mock.module("@tanstack/react-query", () => ({
  useQuery: ({ path }: { path: string }) => ({
    data:
      path === "detail"
        ? detail
        : {
            rows: detail.lines.map((l) => ({
              balanceSourceId: l.balanceSourceId,
              revision: 7,
              configurationVersionId: "configuration",
            })),
          },
  }),
  useMutation: ({ path }: { path: string }) => ({
    isPending: false,
    mutateAsync: async (input: MutationInput) => {
      calls.push({ path, input })
      if (path === "price" && input.offeringId) {
        if (priceFailure === input.offeringId) {
          priceFailure = null
          throw Error("Inert second-price failure")
        }
        const current = serverPrices[input.offeringId]
        if (!current || current.revision !== input.expectedRevision)
          throw Error("Stale price revision")
        serverPrices[input.offeringId] = {
          ...current,
          priceMinor: input.priceMinor ?? 0,
          revision: current.revision + 1,
        }
      }
      return { id: "receipt" }
    },
  }),
}))
const data = {
  OPEN_SHIPMENT: ["EXPECTED", "PARTIALLY_RECEIVED"],
  SHIPMENT_PILL_TONE: { EXPECTED: "info" },
  errorText: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
  isOpenShipment: (status: string) => status === "EXPECTED",
  lineName: (l: { id: string }) => l.id,
  money: (minor: string) => minor,
  useCurrentStoreId: () => "store",
  useRefreshShipments: () => async () => {
    refreshes += 1
    visiblePrices = { ...serverPrices }
  },
  useStoreStockChoices: () => ({
    choices: detail.lines.map((line) => ({
      balanceSourceId: line.balanceSourceId,
      offering: visiblePrices[`offering-${line.id}`],
    })),
  }),
}
port("apps/dashboard/src/components/shipments/shipment-data", data)
port("apps/mobile/src/components/mobile/shipments/shipment-data", data)
port("apps/dashboard/src/components/shipments/shipment-draft-form", {
  ShipmentDraftForm: box,
  ShipmentCostTable: box,
})
port("apps/dashboard/src/components/shipments/shipment-status", {
  ShipmentStatusBadge: box,
})
port("apps/dashboard/src/components/forms/form-feedback", { FormFeedback: box })
port("apps/dashboard/src/components/sheets/sheet-frame", {
  SheetFrame: ({ children, footer }: Props) =>
    createElement("div", null, children, footer),
})
port("apps/dashboard/src/hooks/use-sheet-dismissal", {
  useSheetDismissal: () => ({ requestClose: () => {} }),
})
port("apps/dashboard/src/hooks/use-shipment-params", {
  useShipmentParams: () => ({
    shipmentId: "shipment",
    step: dashboardStep,
    lineId: null,
    setParams: () => {},
  }),
})
mock.module("@ewatrade/ui", () => ({
  Button: control,
  Input: control,
  Select: control,
  Sheet: box,
  ControlField: box,
  Table: box,
  TableBody: box,
  TableCell: box,
  TableHead: box,
  TableHeader: box,
  TableRow: box,
}))
mock.module("react-native", () => ({ ScrollView: box, View: box }))
mock.module("expo-router", () => ({ useRouter: () => ({}) }))
port("apps/mobile/src/components/mobile/action-button", {
  ActionButton: control,
})
port("apps/mobile/src/components/mobile/form-field", { FormField: control })
port("apps/mobile/src/components/mobile/status-banner", {
  StatusBanner: control,
})
port("apps/mobile/src/components/ui/pressable", { Pressable: control })
port("apps/mobile/src/components/ui/text", { Text: box })
port("apps/mobile/src/components/mobile/finance/finance-form-body", {
  FinanceFormBody: box,
})
port("apps/mobile/src/components/mobile/finance/finance-workspace-gate", {
  FinanceWorkspaceGate: ({
    children,
  }: {
    children: (workspace: {
      book: { id: string; currencyCode: string }
    }) => ReactNode
  }) => children({ book: { id: "book", currencyCode: "NGN" } }),
})
port("apps/mobile/src/components/mobile/green-till/hero-card", {
  HeroCard: box,
})
port("apps/mobile/src/components/mobile/green-till/kit", {
  ListCard: box,
  RecordRow: control,
  StatusPill: box,
})
port("apps/mobile/src/components/mobile/shipments/shipment-draft-screen", {
  ShipmentDraftScreen: box,
})
const { ShipmentSheet } = await import("./shipment-sheet")
// Resolve the second app at runtime: each app's native/alias types are checked
// in its own project rather than pulling mobile into Dashboard's TS graph.
const mobileScreen = new URL(
  "../../../../mobile/src/components/mobile/shipments/shipment-screen.tsx",
  import.meta.url,
)
const { ShipmentScreen } = await import(mobileScreen.pathname)

async function mount(
  surface: "dashboard" | "mobile",
  quantities = ["0.5"],
  step: "arrival" | "prices" = "arrival",
) {
  controls.clear()
  calls.length = 0
  dashboardStep = step
  refreshes = 0
  priceFailure = null
  serverPrices = Object.fromEntries(
    quantities.map((_, i) => {
      const id = `offering-${i ? "two" : "one"}`
      return [id, { id, revision: 1, priceMinor: 100 }]
    }),
  )
  visiblePrices = { ...serverPrices }
  detail = {
    ...detail,
    lines: quantities.map((quantity, i) => line(i ? "two" : "one", quantity)),
  }
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
  const view = createRoot(host as unknown as HTMLElement)
  await act(async () =>
    view.render(
      surface === "dashboard"
        ? createElement(ShipmentSheet, {
            book: { id: "book", currencyCode: "NGN" },
            store: { id: "store", name: "Store" },
          })
        : createElement(ShipmentScreen, { shipmentId: "shipment" }),
    ),
  )
  const press = async (name: string) => {
    const props = controls.get(name)
    if (!props) throw Error(`Missing control: ${name}`)
    if (props.disabled) throw Error(`Disabled control: ${name}`)
    await act(async () => {
      ;(props.onPress ?? props.onClick)?.()
    })
  }
  const enter = async (name: string, value: string) => {
    const props = controls.get(name)
    if (!props) throw Error(`Missing input: ${name}`)
    await act(async () => {
      props.onChangeText
        ? props.onChangeText(value)
        : props.onChange?.({ target: { value } })
    })
  }
  if (surface === "mobile")
    await press(step === "prices" ? "Selling prices" : "Record arrival")
  return {
    host,
    press,
    enter,
    close: async () => {
      await act(async () => view.unmount())
    },
  }
}

test("dashboard incomplete arrival input stays rendered and sends nothing", async () => {
  const ui = await mount("dashboard")
  try {
    await ui.enter("Arrived now: one", "1.")
    expect(ui.host.textContent).toContain("?")
    await ui.press("Pick what arrived")
    expect(calls).toHaveLength(0)
    expect(ui.host.textContent).toContain("Enter a valid quantity")
  } finally {
    await ui.close()
  }
})
test("dashboard malformed second line refuses the entire arrival", async () => {
  const ui = await mount("dashboard", ["2", "2"])
  try {
    await ui.enter("Arrived now: one", "1")
    await ui.enter("Arrived now: two", "-1")
    await ui.press("Receive 1 items")
    expect(calls).toHaveLength(0)
    expect(ui.host.textContent).toContain("Enter a valid quantity")
  } finally {
    await ui.close()
  }
})
test("dashboard partial arrival uses exact remaining quantity and canonical receipt input", async () => {
  const ui = await mount("dashboard", ["0.3"])
  try {
    await ui.enter("Arrived now: one", "0.1")
    expect(ui.host.textContent).toContain("0.2")
    expect(ui.host.textContent).not.toContain("0.199999999")
    await ui.press("Receive 0.1 items")
    expect(calls).toHaveLength(1)
    expect(calls[0]?.input.lines[0]).toMatchObject({
      quantity: "0.1",
      categories: [{ name: "Shipment" }],
      expectedBalanceRevision: 7,
      expectedConfigurationVersionId: "configuration",
    })
  } finally {
    await ui.close()
  }
})
test("mobile everything-arrived preserves a fractional final receipt", async () => {
  const ui = await mount("mobile", ["2.5"])
  try {
    await ui.press("Everything still to come arrived")
    await ui.press("Receive 2.5 items")
    expect(calls).toHaveLength(1)
    expect(calls[0]?.input.lines[0]).toMatchObject({
      quantity: "2.5",
      categories: [{ name: "Shipment" }],
    })
  } finally {
    await ui.close()
  }
})
test("mobile stepper can receive the last fraction", async () => {
  const ui = await mount("mobile")
  try {
    await ui.press("More one")
    await ui.press("Receive 0.5 items")
    expect(calls[0]?.input.lines[0]?.quantity).toBe("0.5")
  } finally {
    await ui.close()
  }
})
test("mobile decimal input records a partial fraction and refuses an over-receipt", async () => {
  const ui = await mount("mobile", ["0.3"])
  try {
    await ui.enter("Arrived now: one", "0.4")
    await ui.press("Pick what arrived")
    expect(calls).toHaveLength(0)
    expect(ui.host.textContent).toContain("Only 0.3")
    await ui.enter("Arrived now: one", "0.1")
    expect(ui.host.textContent).toContain("0.2 still to come")
    await ui.press("Receive 0.1 items")
    expect(calls[0]?.input.lines[0]?.quantity).toBe("0.1")
  } finally {
    await ui.close()
  }
})
test("ordinary whole-unit arrivals still submit on both surfaces", async () => {
  for (const surface of ["dashboard", "mobile"] as const) {
    const ui = await mount(surface, ["2"])
    try {
      if (surface === "dashboard") await ui.enter("Arrived now: one", "1")
      else await ui.press("More one")
      await ui.press("Receive 1 items")
      expect(calls).toHaveLength(1)
      expect(calls[0]?.input.lines[0]?.quantity).toBe("1")
    } finally {
      await ui.close()
    }
  }
})

test("both price screens validate every entry before any Catalog write", async () => {
  for (const surface of ["dashboard", "mobile"] as const) {
    const ui = await mount(surface, ["2", "2"], "prices")
    try {
      await ui.enter(
        surface === "dashboard" ? "New price for one" : "New price: one",
        "2",
      )
      await ui.enter(
        surface === "dashboard" ? "New price for two" : "New price: two",
        "bad",
      )
      await ui.press("Save prices")
      expect(calls).toHaveLength(0)
      expect(ui.host.textContent).toContain(
        "Enter a valid selling price for two",
      )
    } finally {
      await ui.close()
    }
  }
})
test("both price screens refresh revisions after a partial save before retry", async () => {
  for (const surface of ["dashboard", "mobile"] as const) {
    const ui = await mount(surface, ["2", "2"], "prices")
    try {
      await ui.enter(
        surface === "dashboard" ? "New price for one" : "New price: one",
        "2",
      )
      await ui.enter(
        surface === "dashboard" ? "New price for two" : "New price: two",
        "3",
      )
      priceFailure = "offering-two"
      await ui.press("Save prices")
      expect(refreshes).toBe(1)
      expect(ui.host.textContent).toContain("1 price was saved.")
      await ui.press("Save prices")
      expect(calls.map((call) => call.input.offeringId)).toEqual([
        "offering-one",
        "offering-two",
        "offering-two",
      ])
      expect(serverPrices["offering-one"]?.priceMinor).toBe(200)
      expect(serverPrices["offering-two"]?.priceMinor).toBe(300)
    } finally {
      await ui.close()
    }
  }
})
