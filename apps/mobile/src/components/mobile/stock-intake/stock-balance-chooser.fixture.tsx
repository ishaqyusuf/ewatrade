import { beforeEach, expect, mock, test } from "bun:test"
import { DOMParser } from "@xmldom/xmldom"
import { type ReactNode, act, createElement } from "react"
import type { StockBalance } from "./stock-intake-model"

// The actual StockBalanceChooser. Ports: the sheet hands over its real props
// and renders children plus its footer inside its containerComponent (as at
// a gorhom portal host); the scroll view hands over its real measurement
// handlers; rows and the search field record their props.
const source = new URL("../../../", import.meta.url)
const leaf = () => null
const pass = ({ children }: { children?: ReactNode }) =>
  createElement("div", null, children)
const port = (path: string, exports: Record<string, unknown>) =>
  mock.module(new URL(path, source).pathname, () => exports)
type SheetProps = Record<string, unknown> & {
  children?: ReactNode
  containerComponent?: (props: { children?: ReactNode }) => ReactNode
  footerComponent?: (props: object) => ReactNode
}
type ScrollProps = {
  onLayout?: (event: { nativeEvent: { layout: { height: number } } }) => void
  onContentSizeChange?: (width: number, height: number) => void
  contentContainerStyle?: { paddingBottom?: number }
  children?: ReactNode
}
let sheet: SheetProps = {}
let scroll: ScrollProps = {}
let rows: Array<{ title: string; disabled?: boolean; onPress: () => void }> = []
let searches: Array<{
  value: string
  placeholder?: string
  onChangeText: (value: string) => void
}> = []
let os = "ios"
let skeletons = 0
let texts: Array<{ children?: ReactNode; style?: Record<string, unknown> }> = []
let presses: Array<{
  accessibilityLabel?: string
  style?: Record<string, unknown>
}> = []
let retries: Array<{ children: ReactNode }> = []
port("components/ui/modal", {
  Modal: (props: SheetProps) => {
    sheet = props
    const Container = props.containerComponent ?? pass
    return createElement(
      Container,
      null,
      props.children,
      props.footerComponent
        ? createElement(props.footerComponent as () => ReactNode, {})
        : null,
      // Gorhom also renders a custom handle (the Android screen header).
      typeof props.handleComponent === "function"
        ? createElement(props.handleComponent as () => ReactNode, {})
        : null,
    )
  },
})
port("components/mobile/appearances/classic/stock-intake", {
  StockRow: (props: (typeof rows)[number]) => {
    rows.push(props)
    return null
  },
})
port("components/mobile/floating-search-field", {
  FloatingSearchField: (props: (typeof searches)[number]) => {
    searches.push(props)
    return null
  },
})
port("components/mobile/bottom-search-footer", { FLOATING_SEARCH_GAP: 10 })
port("components/ui/bottom-sheet-input-context", {
  BottomSheetInputProvider: pass,
})
port("components/ui/icon", { Icon: leaf })
port("components/ui/skeleton", {
  SkeletonGroup: pass,
  Skeleton: () => {
    skeletons++
    return null
  },
})
port("components/mobile/action-button", {
  ActionButton: (props: { children: ReactNode }) => {
    retries.push(props)
    return null
  },
})
port("components/ui/pressable", {
  Pressable: (props: (typeof presses)[number] & { children?: ReactNode }) => {
    presses.push(props)
    return createElement("div", null, props.children)
  },
})
port("components/ui/text", {
  Text: (props: (typeof texts)[number]) => {
    texts.push(props)
    return null
  },
})
port("hooks/use-color", {
  useColors: () => ({
    background: "#101414",
    border: "#2a3333",
    card: "#1b2222",
    foreground: "#f4f7f6",
  }),
})
let views: Array<{ style?: Record<string, unknown> }> = []
port("components/ui/view", {
  View: (props: { children?: ReactNode; style?: Record<string, unknown> }) => {
    views.push(props)
    return createElement("div", null, props.children)
  },
})
mock.module("@gorhom/bottom-sheet", () => ({
  BottomSheetFooter: pass,
  BottomSheetScrollView: (props: ScrollProps) => {
    scroll = props
    return createElement("div", null, props.children)
  },
}))
mock.module("react-native", () => ({
  Platform: {
    get OS() {
      return os
    },
  },
  StyleSheet: { hairlineWidth: 1 },
  useWindowDimensions: () => ({ height: 800, width: 400 }),
}))
mock.module("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 40, bottom: 20, left: 0, right: 0 }),
}))
const { StockBalanceChooser, stockChooserLayout, stockChooserSearch } =
  await import("./stock-balance-chooser")

const balance = (index: number): StockBalance => ({
  availableQuantity: "5",
  balanceSourceId: `source-${index}`,
  catalogItemId: "catalog",
  configurationVersionId: "version",
  custodyReferenceId: null,
  custodyType: "STORE",
  inventoryUnitFactor: "1",
  inventoryUnitId: "unit",
  inventoryUnitName: "Bird",
  inventoryUnitTransactionScale: 0,
  kind: "SHARED_POOL",
  onHandQuantity: "5",
  productId: "product",
  productName: `Broilers ${index}`,
  reservedQuantity: "0",
  revision: 1,
  storeId: "store",
  storeName: "Jawdah Poultry QA",
  variantId: `variant-${index}`,
  variantName: `Variant ${index}`,
})

beforeEach(() => {
  os = "ios"
})

async function mount(input: {
  total: number
  shown?: number
  query?: string
  locked?: boolean
  loading?: boolean
  loadError?: string | null
}) {
  const edits: unknown[] = []
  const queries: string[] = []
  let dismissed = 0
  const model = {
    totalRows: input.total,
    rows: Array.from({ length: input.shown ?? input.total }, (_, i) =>
      balance(i),
    ),
    query: input.query ?? "",
    setQuery: (value: string) => queries.push(value),
    people: [],
    selected: null,
    locked: input.locked ?? false,
    loading: input.loading ?? false,
    loadError: input.loadError ?? null,
    hasBalanceData: !input.loading,
    retryLoad() {},
    edit: (patch: unknown) => edits.push(patch),
  }
  const modal = { ref: { current: null }, dismiss: () => dismissed++ }
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
  const render = async () => {
    rows = []
    searches = []
    texts = []
    presses = []
    skeletons = 0
    retries = []
    await act(async () =>
      root.render(
        createElement(StockBalanceChooser, {
          modal,
          model: model as unknown as Parameters<
            typeof StockBalanceChooser
          >[0]["model"],
        } as Parameters<typeof StockBalanceChooser>[0]),
      ),
    )
  }
  await render()
  return {
    edits,
    queries,
    get dismissed() {
      return dismissed
    },
    measure: async (viewport: number, content: number) => {
      const current = scroll
      rows = []
      searches = []
      await act(async () => {
        current.onLayout?.({ nativeEvent: { layout: { height: viewport } } })
        current.onContentSizeChange?.(400, content)
      })
    },
    filter: async (shown: number) => {
      model.rows = model.rows.slice(0, shown)
      await render()
    },
    // The first authoritative read resolves with this many eligible balances.
    resolve: async (count: number) => {
      model.loading = false
      model.hasBalanceData = true
      model.totalRows = count
      model.rows = Array.from({ length: count }, (_, i) => balance(i))
      await render()
    },
    close: () => act(async () => root.unmount()),
  }
}

test("thresholds: five or fewer is compact; search past seven, or six-seven when overflowing", () => {
  expect([1, 5, 6, 7, 8].map(stockChooserLayout)).toEqual([
    "compact",
    "compact",
    "full",
    "full",
    "full",
  ])
  expect(stockChooserSearch(5, true)).toBe(false)
  expect(stockChooserSearch(6, false)).toBe(false)
  expect(stockChooserSearch(7, true)).toBe(true)
  expect(stockChooserSearch(8, false)).toBe(true)
})

test("up to five balances: a small sheet with no search, and a stale query is cleared", async () => {
  const ui = await mount({ total: 3, query: "old" })
  try {
    expect(sheet.enableDynamicSizing).toBe(true)
    expect(sheet.snapPoints).toBeUndefined()
    expect(sheet.footerComponent).toBeUndefined()
    expect(searches).toHaveLength(0)
    expect(rows.map((row) => row.title)).toEqual([
      "Broilers 0",
      "Broilers 1",
      "Broilers 2",
    ])
    expect(ui.queries).toContain("")
    // Even overflowing text never adds search to the compact sheet.
    await ui.measure(100, 900)
    expect(searches).toHaveLength(0)
  } finally {
    await ui.close()
  }
})

test("six or seven: full, search appears only once the list overflows, then stays while filtering", async () => {
  const ui = await mount({ total: 6 })
  try {
    expect(sheet.snapPoints).toEqual(["92%"])
    expect(searches).toHaveLength(0)
    await ui.measure(500, 400)
    expect(searches).toHaveLength(0)
    await ui.measure(300, 900)
    expect(searches.length).toBeGreaterThan(0)
    // Filtering to one row (no overflow) keeps the search on screen.
    await ui.filter(1)
    await ui.measure(300, 80)
    expect(searches.length).toBeGreaterThan(0)
  } finally {
    await ui.close()
  }
})

test("the bottom search uses the standard floating pill with standard side spacing", async () => {
  views = []
  const ui = await mount({ total: 8 })
  try {
    expect(searches.length).toBeGreaterThan(0)
    expect(searches.at(-1)?.placeholder).toBe("Product, variant, unit, custody")
    const footer = views.find((view) => view.style?.paddingHorizontal === 24)
    expect(footer?.style).toMatchObject({
      paddingHorizontal: 24,
      paddingTop: 10,
    })
    // Bottom spacing clears the safe area (20) plus the standard gap (10).
    expect(footer?.style?.paddingBottom).toBe(30)
  } finally {
    await ui.close()
  }
})

test("more than seven: bottom search from the start, decided by the unfiltered count", async () => {
  const ui = await mount({ total: 8, shown: 1, query: "Broilers 0" })
  try {
    expect(sheet.snapPoints).toEqual(["92%"])
    expect(searches.length).toBeGreaterThan(0)
    expect(searches.at(-1)?.value).toBe("Broilers 0")
    // The full layout keeps the query (search is visible to edit it).
    expect(ui.queries).not.toContain("")
    expect(scroll.contentContainerStyle?.paddingBottom).toBeGreaterThan(24)
  } finally {
    await ui.close()
  }
})

test("Android full: an edge-to-edge screen with its own header; iOS keeps a full sheet", async () => {
  os = "android"
  const android = await mount({ total: 8 })
  try {
    expect(sheet.snapPoints).toEqual(["100%"])
    expect(sheet.detached).toBe(false)
    expect(typeof sheet.handleComponent).toBe("function")
    expect(sheet.enablePanDownToClose).toBe(false)
    // The docked search must ride above the keyboard (not "extend").
    expect(sheet.keyboardBehavior).toBe("fillParent")
    // Edge-to-edge Android doesn't resize the window, so gorhom subtracts the
    // keyboard itself for the docked search.
    expect(sheet.android_keyboardInputMode).toBe("adjustPan")
    expect(sheet.bottomInset).toBe(0)
    // The header's colours are explicit: theme classes don't reach the
    // gorhom handle layer, which left the title invisible in dark mode.
    const title = texts.find((text) => text.children === "Choose stock balance")
    expect(title?.style?.color).toBe("#f4f7f6")
    const close = presses.find(
      (press) => press.accessibilityLabel === "Close stock balances",
    )
    expect(close?.style?.backgroundColor).toBe("#1b2222")
    // Layout is explicit too: classes don't apply in the handle layer either.
    expect(close?.style).toMatchObject({
      width: 44,
      height: 44,
      borderRadius: 22,
    })
    expect(title?.style).toMatchObject({ flex: 1, textAlign: "center" })
  } finally {
    await android.close()
  }
  os = "ios"
  const ios = await mount({ total: 8 })
  try {
    // The shared detached sheet default applies (not overridden).
    expect(sheet.detached).not.toBe(false)
    expect(sheet.handleComponent).toBeUndefined()
    expect(sheet.keyboardBehavior).toBe("fillParent")
    expect(sheet.android_keyboardInputMode).toBeUndefined()
  } finally {
    await ios.close()
  }
})

test("choosing a balance edits the draft and closes; locked drafts disable rows", async () => {
  const ui = await mount({ total: 2 })
  try {
    rows[1]?.onPress()
    expect(ui.edits).toEqual([{ balanceId: "source-1" }])
    expect(ui.dismissed).toBe(1)
  } finally {
    await ui.close()
  }
  const locked = await mount({ total: 2, locked: true })
  try {
    expect(rows.every((row) => row.disabled)).toBe(true)
  } finally {
    await locked.close()
  }
})

test("a first server load opens a compact sheet with exactly three skeleton rows, then settles into the full view", async () => {
  const ui = await mount({ total: 0, loading: true })
  try {
    expect(sheet.enableDynamicSizing).toBe(true)
    expect(skeletons).toBe(3)
    expect(rows).toHaveLength(0)
    expect(searches).toHaveLength(0)
    const before = sheet
    await ui.resolve(8)
    // The same sheet element changes props in place: no reopen needed.
    expect(sheet.snapPoints).toEqual(["92%"])
    expect(sheet.enableDynamicSizing).toBeUndefined()
    expect(skeletons).toBe(0)
    expect(new Set(rows.map((row) => row.title)).size).toBe(8)
    expect(searches.length).toBeGreaterThan(0)
    expect(sheet.ref).toBe(before.ref)
  } finally {
    await ui.close()
  }
})

test("already loaded balances open directly without skeletons; a load error is distinct from loading", async () => {
  const loaded = await mount({ total: 4 })
  try {
    expect(skeletons).toBe(0)
    expect(rows).toHaveLength(4)
  } finally {
    await loaded.close()
  }
  const failed = await mount({ total: 0, loadError: "Network unavailable" })
  try {
    expect(skeletons).toBe(0)
    expect(rows).toHaveLength(0)
    expect(retries.map((props) => props.children)).toEqual(["Try again"])
  } finally {
    await failed.close()
  }
})
