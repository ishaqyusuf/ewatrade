import { beforeEach, expect, mock, test } from "bun:test"
import { DOMParser } from "@xmldom/xmldom"
import { type ReactNode, act, createElement } from "react"
import type {
  StockBalance,
  StockOutcome,
  StockReview,
} from "./stock-intake-model"
import { INITIAL_STOCK_DRAFT } from "./stock-intake-model"

// The actual StockIntakeContent, its actual terminal outcome branch, the
// actual stock model helpers and the actual useStockActivity. Ports: the
// stock hook returns a fixed model, StockOutcomeSheet hands its real props to
// the probe, and UI leaves, navigation and analytics transport are inert.
// Not native, device or connected acceptance.
const source = new URL("../../../", import.meta.url)
const leaf = () => null
const pass = ({ children }: { children?: ReactNode }) =>
  createElement("div", null, children)
function port(path: string, exports: Record<string, unknown>) {
  mock.module(new URL(path, source).pathname, () => exports)
}
type Sheet = {
  tone: string
  title: string
  kicker: string
  rows: Array<[string, string] | [string, string, { selectable?: boolean }]>
  warning?: string | null
}
let sheets: Sheet[] = []
let events: Array<{ name: string; properties: Record<string, unknown> }> = []
let model: Record<string, unknown> = {}
port("components/mobile/stock-intake/stock-outcome-sheet", {
  StockOutcomeSheet: (props: Sheet) => {
    sheets.push(props)
    return null
  },
})
port("components/mobile/stock-intake/use-stock-intake", {
  useStockIntake: () => model,
})
port("components/mobile/stock-intake/stock-balance-chooser", {
  StockBalanceChooser: leaf,
})
port("components/mobile/stock-intake/stock-intake-review", {
  StockIntakeReview: leaf,
})
port("components/mobile/stock-intake/stock-intake-fields", {
  StockIntakeFields: leaf,
})
port("runtime/analytics-runtime", {
  trackMobileActivity: (event: (typeof events)[number]) => events.push(event),
})
port("components/mobile/action-button", { ActionButton: leaf })
port("components/mobile/appearances/classic/stock-intake", { StockRow: leaf })
port("components/mobile/appearances/workflow-chrome", {
  MobileWorkflowChrome: leaf,
})
port("components/mobile/bottom-search-footer", { BottomSearchFooter: leaf })
port("components/mobile/qa-quick-fill-button", { QaQuickFillButton: leaf })
port("components/mobile/status-banner", { StatusBanner: leaf })
port("components/mobile/form-field", { FormField: leaf })
port("components/mobile/green-till/hero-card", { HeroCard: leaf })
port("components/ui/icon", { Icon: leaf })
port("components/ui/modal", {
  Modal: leaf,
  useModal: () => ({ ref: { current: null }, present() {}, dismiss() {} }),
})
port("components/ui/pressable", { Pressable: leaf })
port("components/ui/skeleton", { Skeleton: leaf, SkeletonGroup: leaf })
port("components/ui/text", { Text: leaf })
port("components/ui/view", { View: pass })
port("hooks/use-auth", {
  useAuthContext: () => ({ profile: { role: "owner" } }),
})
port("hooks/use-bottom-search-scroll", {
  useBottomSearchScroll: () => ({ hidden: false, onScroll() {} }),
})
port("hooks/use-color", {
  useColorScheme: () => ({ colorScheme: "light" }),
  useColors: () => ({}),
})
port("hooks/use-large-text-layout", { useLargeTextLayout: () => false })
port("lib/green-till-theme", { GREEN_TILL_THEME: { light: {}, dark: {} } })
port("lib/mobile-roles", { isSalesRepRole: () => false })
port("lib/operation-success-navigation", {
  exitOutcome() {},
  rebaseOutcomeOnHome() {},
})
port("lib/utils", { cn: (...names: unknown[]) => names.join(" ") })
mock.module("@gorhom/bottom-sheet", () => ({ BottomSheetScrollView: pass }))
mock.module("@react-navigation/native", () => ({
  useRoute: () => ({ key: "stock", name: "stock-intake", params: {} }),
}))
mock.module("expo-router", () => ({
  useNavigation: () => ({}),
  useRouter: () => ({}),
}))
mock.module("nativewind", () => ({ VariableContextProvider: pass }))
mock.module("react-native", () => ({ Text: leaf, View: pass }))
mock.module("react-native-css/components/FlatList", () => ({ FlatList: leaf }))
mock.module("react-native-keyboard-controller", () => ({
  KeyboardAwareScrollView: leaf,
}))
const { StockIntakeContent } = await import("./stock-intake-screen")

const SAVED_ID = "cmh2x9k1z0001qv8f3a7b5c2d"
const balance: StockBalance = {
  availableQuantity: "60",
  balanceSourceId: "balance",
  catalogItemId: "catalog-rice",
  configurationVersionId: "version",
  custodyReferenceId: null,
  custodyType: "STORE",
  inventoryUnitFactor: "1",
  inventoryUnitId: "unit",
  inventoryUnitName: "bag",
  inventoryUnitTransactionScale: 0,
  kind: "SHARED_POOL",
  onHandQuantity: "60",
  productId: "rice",
  productName: "Rice",
  reservedQuantity: "0",
  revision: 1,
  storeId: "store",
  storeName: "Farm",
  variantId: "variant",
  variantName: "50kg",
}
const review: StockReview = {
  balance,
  draft: { ...INITIAL_STOCK_DRAFT, mode: "receipt", quantity: "10" },
  quantity: "10",
  recipientName: "",
  businessId: "business",
  userId: "user",
  storeId: "store",
}
const recorded = (
  fields: Partial<Extract<StockOutcome, { kind: "recorded" }>> = {},
) =>
  ({
    kind: "recorded",
    review,
    effectiveAt: null,
    readBaseline: 0,
    operationId: SAVED_ID,
    ...fields,
  }) as StockOutcome

beforeEach(() => {
  sheets = []
  events = []
})

async function show(
  outcome: StockOutcome,
  extra: Record<string, unknown> = {},
) {
  model = {
    phase: "complete",
    outcome,
    review: null,
    hasAttempt: true,
    reviewStale: false,
    scopeChanged: false,
    canManage: true,
    target: { kind: "generic" },
    rows: [],
    totalRows: 0,
    draft: review.draft,
    selected: null,
    locked: true,
    query: "",
    resolution: "ready",
    recordedBalance: balance,
    refreshFailed: false,
    people: [],
    edit() {},
    ...extra,
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
  const root = createRoot(host as unknown as HTMLElement)
  await act(async () =>
    root.render(
      // No target: generic entry (the hook port supplies the model).
      createElement(StockIntakeContent, {}),
    ),
  )
  await act(async () => root.unmount())
  const sheet = sheets.at(-1)
  if (!sheet) throw Error("No outcome sheet rendered")
  return sheet
}
const referenceRow = (sheet: Sheet) =>
  sheet.rows.find(([label]) => label === "Reference")
const reference = (sheet: Sheet) => referenceRow(sheet)?.[1]

test("a recorded stock result shows the saved operation reference", async () => {
  const sheet = await show(recorded())
  expect(sheet.tone).toBe("recorded")
  expect(sheet.title).toBe("Stock recorded")
  expect(reference(sheet)).toBe(SAVED_ID)
  // Only the saved reference is selectable; other rows carry no flag.
  expect(referenceRow(sheet)?.[2]).toEqual({ selectable: true })
  expect(sheet.rows.filter((row) => row.length > 2)).toHaveLength(1)
  expect(sheet.rows.map(([label]) => label)).toEqual([
    "Change",
    "Item",
    "Available now",
    "Reference",
  ])
})

test("the reference stays after a balance refresh failure", async () => {
  const sheet = await show(recorded(), {
    recordedBalance: null,
    refreshFailed: true,
  })
  expect(sheet.tone).toBe("recorded")
  expect(reference(sheet)).toBe(SAVED_ID)
  expect(sheet.warning).toContain("couldn't refresh")
})

test("an unreadable id keeps the result recorded with a truthful unavailable reference", async () => {
  const sheet = await show(recorded({ operationId: null }))
  expect(sheet.tone).toBe("recorded")
  expect(sheet.title).toBe("Stock recorded")
  expect(reference(sheet)).toBe(
    "Not available on this phone — the change is saved",
  )
  expect(referenceRow(sheet)?.[2]).toEqual({ selectable: false })
})

test("failed and unknown results never show a reference", async () => {
  for (const outcome of [
    { kind: "not_recorded", review, message: "Refused", canEdit: true },
    { kind: "unknown", review },
  ] as StockOutcome[]) {
    const sheet = await show(outcome)
    expect(sheet.tone).toBe(outcome.kind)
    expect(sheet.rows.some(([label]) => label === "Reference")).toBe(false)
    expect(JSON.stringify(sheet)).not.toContain(SAVED_ID)
  }
})

test("analytics never receive the saved reference", async () => {
  await show(recorded())
  expect(events).toEqual([
    {
      name: "mobile_stock_result",
      properties: { action: "receipt", status: "recorded" },
    },
  ])
  expect(JSON.stringify(events)).not.toContain(SAVED_ID)
})
