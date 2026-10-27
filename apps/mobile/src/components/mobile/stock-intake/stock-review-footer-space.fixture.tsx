import { expect, mock, test } from "bun:test"
import { DOMParser } from "@xmldom/xmldom"
import { type ReactNode, act, createElement } from "react"
import type { StockBalance, StockReview } from "./stock-intake-model"
import { INITIAL_STOCK_DRAFT } from "./stock-intake-model"

// The actual StockIntakeReview. Ports: the sheet renders its children and its
// real footer component (as gorhom does, at a portal host, so nothing outside
// <Modal> reaches them); View hands over its real onLayout; leaves are inert.
// The probe reads the actual BottomSheetScrollView props.
const source = new URL("../../../", import.meta.url)
const leaf = () => null
const pass = ({ children }: { children?: ReactNode }) =>
  createElement("div", null, children)
const port = (path: string, exports: Record<string, unknown>) =>
  mock.module(new URL(path, source).pathname, () => exports)
type Layout = (event: { nativeEvent: { layout: { height: number } } }) => void
let layouts: Layout[] = []
let classNames: string[] = []
let scroll: { contentContainerStyle?: { paddingBottom?: number } } = {}
port("components/ui/view", {
  View: (props: {
    children?: ReactNode
    className?: string
    onLayout?: Layout
  }) => {
    if (props.onLayout) layouts.push(props.onLayout)
    if (props.className) classNames.push(props.className)
    return createElement("div", null, props.children)
  },
})
port("components/ui/modal", {
  // Gorhom mounts sheet content and footer at a separate PortalHost.
  Modal: (props: {
    children?: ReactNode
    footerComponent?: (props: object) => ReactNode
  }) =>
    createElement(
      "div",
      null,
      props.children,
      props.footerComponent
        ? createElement(props.footerComponent as () => ReactNode, {})
        : null,
    ),
})
port("components/ui/text", { Text: leaf })
port("components/ui/icon", { Icon: leaf })
port("components/mobile/action-button", { ActionButton: leaf })
port("components/mobile/status-banner", { StatusBanner: leaf })
port("components/app/bottom-sheet-backdrop", { AppBottomSheetBackdrop: leaf })
port("lib/utils", { cn: (...names: unknown[]) => names.join(" ") })
mock.module("@gorhom/bottom-sheet", () => ({
  BottomSheetFooter: pass,
  BottomSheetScrollView: (props: typeof scroll & { children?: ReactNode }) => {
    scroll = props
    return createElement("div", null, props.children)
  },
}))
mock.module("nativewind", () => ({ VariableContextProvider: pass }))
mock.module("react-native", () => ({
  useWindowDimensions: () => ({ height: 780, width: 360 }),
}))
const { StockIntakeReview } = await import("./stock-intake-review")

const balance: StockBalance = {
  availableQuantity: "5",
  balanceSourceId: "balance",
  catalogItemId: "catalog-layer-feed",
  configurationVersionId: "version",
  custodyReferenceId: null,
  custodyType: "STORE",
  inventoryUnitFactor: "1",
  inventoryUnitId: "unit",
  inventoryUnitName: "Bag",
  inventoryUnitTransactionScale: 2,
  kind: "SHARED_POOL",
  lowStockLevel: null,
  onHandQuantity: "10",
  productId: "layer-feed",
  productName: "Layer feed",
  reservedQuantity: "5",
  revision: 2,
  storeId: "store",
  storeName: "Jawdah Poultry QA",
  variantId: "variant",
  variantName: "Layer feed",
}
const review: StockReview = {
  balance,
  draft: {
    ...INITIAL_STOCK_DRAFT,
    mode: "receipt",
    quantity: "2",
    categories: [{ categoryNameId: 1, name: "mobile-phase1-20261017" }],
  },
  quantity: "2",
  recipientName: "",
  businessId: "business",
  userId: "user",
  storeId: "store",
}
const model = {
  review,
  people: [],
  pending: false,
  offline: false,
  canManage: true,
  scopeChanged: false,
  phase: "editing",
  reviewStale: false,
  hasCountDraft: false,
  hasAttempt: false,
  error: null,
  confirm: async () => {},
  refreshReview() {},
  dismissReview() {},
  afterDismiss() {},
  reviewModal: { ref: { current: null } },
}

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
  const run = async (step: () => void) => {
    layouts = []
    classNames = []
    await act(async () => step())
  }
  await run(() =>
    root.render(
      createElement(StockIntakeReview, {
        model: model as unknown as Parameters<
          typeof StockIntakeReview
        >[0]["model"],
      }),
    ),
  )
  return {
    // The fixed footer measures itself natively.
    measureFooter: (height: number) => {
      // Handlers from the latest render, captured before the next one.
      const current = [...layouts]
      if (!current.length) throw Error("Footer onLayout missing")
      return run(() => {
        for (const layout of current)
          layout({ nativeEvent: { layout: { height } } })
      })
    },
    close: () => act(async () => root.unmount()),
  }
}

test("the scroll body reserves the measured footer height inside the sheet portal", async () => {
  const ui = await mount()
  try {
    await ui.measureFooter(301)
    expect(scroll.contentContainerStyle?.paddingBottom).toBe(317)
    // A taller footer (e.g. Refresh plus Edit, or large text) grows the reserve.
    await ui.measureFooter(402)
    expect(scroll.contentContainerStyle?.paddingBottom).toBe(418)
  } finally {
    await ui.close()
  }
})

test("no content reserve depends on a CSS variable provided outside the sheet", async () => {
  const ui = await mount()
  try {
    await ui.measureFooter(301)
    expect(
      classNames.some((name) => name.includes("--stock-review-footer")),
    ).toBe(false)
  } finally {
    await ui.close()
  }
})

test("before the footer measures itself the body still reserves a default", async () => {
  const ui = await mount()
  try {
    expect(scroll.contentContainerStyle?.paddingBottom).toBeGreaterThan(100)
  } finally {
    await ui.close()
  }
})
