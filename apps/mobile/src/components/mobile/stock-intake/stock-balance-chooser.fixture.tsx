import { expect, mock, test } from "bun:test"
import { DOMParser } from "@xmldom/xmldom"
import { type ReactNode, act, createElement } from "react"
import type { StockBalance } from "./stock-intake-model"

// The actual StockBalanceChooser. Ports: the full-screen view hands over its
// real props and renders its children; the scroll view hands over its real
// measurement handlers; rows and the search field record their props.
const source = new URL("../../../", import.meta.url)
const leaf = () => null
const pass = ({ children }: { children?: ReactNode }) =>
  createElement("div", null, children)
const port = (path: string, exports: Record<string, unknown>) =>
  mock.module(new URL(path, source).pathname, () => exports)
type ScreenProps = Record<string, unknown> & { children?: ReactNode }
type ScrollProps = {
  onLayout?: (event: { nativeEvent: { layout: { height: number } } }) => void
  onContentSizeChange?: (width: number, height: number) => void
  contentContainerStyle?: { paddingBottom?: number }
  children?: ReactNode
}
let screen: ScreenProps = {}
let scroll: ScrollProps = {}
let rows: Array<{ title: string; disabled?: boolean; onPress: () => void }> = []
let searches: Array<{
  value: string
  placeholder?: string
  localSearch?: boolean
  onChangeText: (value: string) => void
}> = []
let spacers = 0
let skeletons = 0
let retries: Array<{ children: ReactNode }> = []
port("components/mobile/full-screen-form", {
  FullScreenModal: (props: ScreenProps) => {
    screen = props
    return createElement("div", null, props.children)
  },
})
port("components/mobile/search-footer-scope", {
  SearchFooterScope: pass,
  SearchFooterField: (props: (typeof searches)[number]) => {
    searches.push(props)
    return null
  },
  SearchFooterSpacer: () => {
    spacers++
    return null
  },
})
port("components/mobile/appearances/classic/stock-intake", {
  StockRow: (props: (typeof rows)[number]) => {
    rows.push(props)
    return null
  },
})
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
port("components/ui/text", { Text: leaf })
port("components/ui/view", { View: pass })
mock.module("react-native", () => ({
  ScrollView: (props: ScrollProps) => {
    scroll = props
    return createElement("div", null, props.children)
  },
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
  lowStockLevel: null,
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
    spacers = 0
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

test("up to five balances: a short list with no search, and a stale query is cleared", async () => {
  const ui = await mount({ total: 3, query: "old" })
  try {
    expect(screen.title).toBe("Choose stock balance")
    expect(screen.bottomInset).toBe(true)
    expect(searches).toHaveLength(0)
    expect(rows.map((row) => row.title)).toEqual([
      "Broilers 0",
      "Broilers 1",
      "Broilers 2",
    ])
    expect(ui.queries).toContain("")
    // Even overflowing text never adds search to the short list.
    await ui.measure(100, 900)
    expect(searches).toHaveLength(0)
  } finally {
    await ui.close()
  }
})

test("six or seven: full, search appears only once the list overflows, then stays while filtering", async () => {
  const ui = await mount({ total: 6 })
  try {
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

test("the bottom search is the shared docked search over the list", async () => {
  const ui = await mount({ total: 8 })
  try {
    expect(searches.at(-1)).toMatchObject({
      localSearch: true,
      placeholder: "Item, variant, unit, custody",
    })
    // The docked search sits on the safe area itself, and the list ends
    // with the shared spacer so its last row clears the search.
    expect(screen.bottomInset).toBe(false)
    expect(spacers).toBeGreaterThan(0)
  } finally {
    await ui.close()
  }
})

test("more than seven: bottom search from the start, decided by the unfiltered count", async () => {
  const ui = await mount({ total: 8, shown: 1, query: "Broilers 0" })
  try {
    expect(searches.length).toBeGreaterThan(0)
    expect(searches.at(-1)?.value).toBe("Broilers 0")
    // The full layout keeps the query (search is visible to edit it).
    expect(ui.queries).not.toContain("")
  } finally {
    await ui.close()
  }
})

test("it opens full screen with a labelled close, never as a sheet", async () => {
  const ui = await mount({ total: 8 })
  try {
    expect(screen.closeLabel).toBe("Close stock balances")
    expect(screen.snapPoints).toBeUndefined()
    expect(typeof screen.onDismiss).toBe("function")
  } finally {
    await ui.close()
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

test("a first server load shows exactly three skeleton rows, then settles into the full view", async () => {
  const ui = await mount({ total: 0, loading: true })
  try {
    expect(skeletons).toBe(3)
    expect(rows).toHaveLength(0)
    expect(searches).toHaveLength(0)
    const before = screen
    await ui.resolve(8)
    // The same screen changes in place: no reopen needed.
    expect(skeletons).toBe(0)
    expect(new Set(rows.map((row) => row.title)).size).toBe(8)
    expect(searches.length).toBeGreaterThan(0)
    expect(screen.ref).toBe(before.ref)
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
