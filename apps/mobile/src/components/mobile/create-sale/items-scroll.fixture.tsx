import { beforeEach, expect, mock, test } from "bun:test"
import { DOMParser } from "@xmldom/xmldom"
import { type ReactElement, act, createElement } from "react"

// The actual ClassicSaleItems and its actual restore helper. Only UI leaves
// and the native list are ports: the probe reads the real FlatList props the
// component returns and plays native measurement events in different orders.
// No copied scroll logic; not native scroll acceptance.
const source = new URL("../../../", import.meta.url)
const leaf = () => null
function ui(path: string, names: string[]) {
  mock.module(new URL(path, source).pathname, () =>
    Object.fromEntries(names.map((name) => [name, leaf])),
  )
}
ui("components/mobile/action-button", ["ActionButton"])
ui("components/mobile/bottom-search-footer", ["BottomSearchFooter"])
ui("components/mobile/catalog/catalog-shelf-model", ["catalogAvatarTint"])
ui("components/mobile/create-sale/catalog-free-sale-lines", [
  "CatalogFreeSaleLines",
])
ui("components/mobile/floating-search-field", ["FloatingSearchCaption"])
ui("components/mobile/qa-quick-fill-button", ["QaQuickFillButton"])
ui("components/mobile/sale-item-picker", ["saleOfferingTitle"])
ui("components/mobile/sale-item-picker-model", ["getSaleOfferingStockLabel"])
ui("components/mobile/status-banner", ["StatusBanner"])
ui("components/ui/icon", ["Icon"])
ui("components/ui/pressable", ["Pressable"])
ui("components/ui/text", ["Text"])
ui("components/ui/view", ["View"])
ui("components/mobile/appearances/classic/create-sale", [
  "ClassicSelectedOrderLine",
])
let dockScrolls = 0
mock.module(new URL("hooks/use-bottom-search-scroll", source).pathname, () => ({
  useBottomSearchScroll: () => ({
    hidden: false,
    onScroll: () => {
      dockScrolls++
    },
  }),
}))
mock.module(new URL("hooks/use-color", source).pathname, () => ({
  useColorScheme: () => ({ colorScheme: "light" }),
  useColors: () => ({}),
}))
mock.module(new URL("hooks/use-large-text-layout", source).pathname, () => ({
  useLargeTextLayout: () => false,
}))
mock.module("react-native", () => ({ Text: leaf }))
mock.module("react-native-css/components/FlatList", () => ({ FlatList: leaf }))
mock.module("react-native-keyboard-controller", () => ({
  KeyboardAwareScrollView: leaf,
}))
const { ClassicSaleItems } = await import(
  "../appearances/classic/create-sale-items"
)

type ListPort = {
  ref: {
    current: {
      scrollToOffset: (input: { offset: number; animated: boolean }) => void
    } | null
  }
  onLayout: (event: { nativeEvent: { layout: { height: number } } }) => void
  onContentSizeChange: (width: number, height: number) => void
  onScroll: (event: { nativeEvent: { contentOffset: { y: number } } }) => void
  onScrollBeginDrag: () => void
}
const VIEWPORT = 500
beforeEach(() => {
  dockScrolls = 0
})

async function mount(memory: { current: number }) {
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
  let list: ListPort | undefined
  let content = 0
  let position = 0
  const calls: number[] = []
  function Probe() {
    const element = ClassicSaleItems({
      model: {
        itemKind: "service",
        productSearch: "",
        selectedLines: [],
        selectedRows: [],
        allRows: [],
        catalogFreeLines: [],
        saleUnits: [],
        currencyCode: "NGN",
        totalMinor: 0,
        paymentMethod: "cash",
        actionsLocked: false,
        hasSaleLines: false,
      },
      actionsHeight: 96,
      onActionsHeightChange() {},
      itemsScroll: memory,
    } as unknown as Parameters<typeof ClassicSaleItems>[0]) as ReactElement<{
      children: ReactElement[]
    }>
    list = element.props.children[0]?.props as ListPort
    list.ref.current = {
      scrollToOffset({ offset }) {
        calls.push(offset)
        // The native list clamps to what it can scroll right now.
        position = Math.min(Math.max(0, content - VIEWPORT), offset)
      },
    }
    return null
  }
  await act(async () => root.render(createElement(Probe)))
  if (!list) throw Error("Actual FlatList handlers missing")
  const port = list
  return {
    content(height: number) {
      content = height
      port.onContentSizeChange(390, height)
    },
    layout(height = VIEWPORT) {
      port.onLayout({ nativeEvent: { layout: { height } } })
    },
    scroll(y: number) {
      position = y
      port.onScroll({ nativeEvent: { contentOffset: { y } } })
    },
    drag() {
      port.onScrollBeginDrag()
    },
    get position() {
      return position
    },
    calls,
    close: async () => act(async () => root.unmount()),
  }
}

test("layout first, then pagination: restores only once the content is tall enough", async () => {
  const ui = await mount({ current: 800 })
  try {
    ui.layout()
    ui.content(1_000)
    expect(ui.calls).toEqual([])
    ui.content(2_000)
    expect(ui.calls).toEqual([800])
    expect(ui.position).toBe(800)
    // One restore only.
    ui.content(3_000)
    expect(ui.calls).toEqual([800])
  } finally {
    await ui.close()
  }
})

test("content before layout never settles early on a clamped offset", async () => {
  const ui = await mount({ current: 800 })
  try {
    ui.content(1_000)
    ui.layout()
    expect(ui.calls).toEqual([])
    ui.content(2_000)
    expect(ui.position).toBe(800)
  } finally {
    await ui.close()
  }
})

test("a late layout restores content that was already tall enough", async () => {
  const ui = await mount({ current: 800 })
  try {
    ui.content(2_000)
    expect(ui.calls).toEqual([])
    ui.layout()
    expect(ui.position).toBe(800)
  } finally {
    await ui.close()
  }
})

test("a zero-height layout waits for a real measurement", async () => {
  const ui = await mount({ current: 800 })
  try {
    ui.layout(0)
    ui.content(2_000)
    expect(ui.calls).toEqual([])
    ui.layout()
    expect(ui.position).toBe(800)
  } finally {
    await ui.close()
  }
})

test("scrolling is remembered after the restore; the dock still hears every scroll", async () => {
  const memory = { current: 0 }
  const ui = await mount(memory)
  try {
    ui.layout()
    ui.content(2_000)
    // A fresh sale starts at the top: nothing to restore.
    expect(ui.calls).toEqual([])
    ui.scroll(640)
    expect(memory.current).toBe(640)
    expect(dockScrolls).toBe(1)
  } finally {
    await ui.close()
  }
  // Coming back to Items: the remounted list returns to 640.
  const back = await mount(memory)
  try {
    back.layout()
    back.content(2_000)
    expect(back.position).toBe(640)
  } finally {
    await back.close()
  }
})

test("the person dragging takes over a pending restore", async () => {
  const memory = { current: 800 }
  const ui = await mount(memory)
  try {
    ui.layout()
    ui.content(1_000)
    ui.drag()
    ui.scroll(120)
    ui.content(2_000)
    expect(ui.calls).toEqual([])
    expect(memory.current).toBe(120)
  } finally {
    await ui.close()
  }
})
