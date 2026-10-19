import { expect, mock, test } from "bun:test"
import { type ReactNode, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { NativeStockAction } from "../../../../apps/mobile/src/components/mobile/assistant/native-stock-values"

// Actual native stock editors and originals, isolated from native primitives,
// tRPC, device and network state. Run alone: module stand-ins are
// process-wide. This is static source evidence only.
const root = new URL("../../../../", import.meta.url)
function standIn(path: string, value: Record<string, unknown>) {
  mock.module(new URL(`apps/mobile/src/${path}`, root).pathname, () => value)
}
const children = ({ children }: { children?: ReactNode }) => (
  <div>{children}</div>
)
const button = ({
  children,
  disabled,
}: { children?: ReactNode; disabled?: boolean }) => (
  <button type="button" disabled={disabled}>
    {children}
  </button>
)
const field = ({
  label,
  value,
  editable,
}: { label: string; value: string; editable?: boolean }) => (
  <label>
    {label}
    <input value={value} readOnly disabled={editable === false} />
  </label>
)
for (const [path, value] of [
  [
    "components/ui/bottom-sheet-input-context",
    { BottomSheetInputProvider: children },
  ],
  [
    "components/ui/bottom-sheet-keyboard-aware-scroll-view",
    { BottomSheetKeyboardAwareScrollView: children },
  ],
  ["components/ui/view", { View: children }],
  ["components/ui/text", { Text: children }],
  ["components/ui/pressable", { Pressable: button }],
  ["components/mobile/action-button", { ActionButton: button }],
  ["components/mobile/form-field", { FormField: field }],
  ["components/mobile/money-field", { MoneyField: field }],
  [
    "components/mobile/stock-intake/stock-categories-input",
    {
      StockCategoriesInput: ({ value }: { value: { name: string }[] }) => (
        <span>Categories: {value.map((row) => row.name).join(", ")}</span>
      ),
    },
  ],
  ["components/mobile/green-till/kit", { ListCard: children }],
] as const)
  standIn(path, value)
mock.module("react-native", () => ({ ScrollView: children }))

let role = "MANAGER"
let storeId = "store-a"
standIn("hooks/use-auth", {
  useAuthContext: () => ({
    profile: {
      id: "actor",
      businessId: "business",
      storeId,
      role,
      status: "ACTIVE",
    },
  }),
})
const calls: string[] = []
function procedure(kind: string) {
  return {
    queryOptions: (input: unknown, options: Record<string, unknown>) => ({
      queryKey: [kind, input],
      queryFn: async () => {
        throw Error("No network is permitted")
      },
      ...options,
    }),
  }
}
standIn("trpc/client", {
  useTRPC: () => ({
    tenant: { current: procedure("tenant") },
    catalog: { listUnitConfigurations: procedure("units") },
    inventory: {
      balanceSource: procedure("balance"),
      custodyAssignees: procedure("assignees"),
      transferReview: procedure("transfer"),
      stockCountReview: procedure("count"),
      closeoutReview: procedure("closeout"),
      operationAudit: procedure("operation"),
    },
  }),
})
type Read = { state: "ready" | "checking" | "refused"; data?: unknown }
const ready = (data: unknown): Read => ({ state: "ready", data })
function result(read: Read) {
  return {
    isError: read.state === "refused",
    isSuccess: read.state === "ready",
    isFetching: read.state === "checking",
    isPaused: false,
    isFetchedAfterMount: read.state === "ready",
    data: read.state === "ready" ? read.data : undefined,
    dataUpdatedAt: Date.UTC(2026, 9, 15, 14, 20),
    refetch: async () => {},
  }
}
// Per-read answers by procedure, then by the exact requested id when needed.
let reads: Record<string, (input: Record<string, string>) => Read> = {}
function answer(options: { queryKey: unknown[]; enabled?: boolean }) {
  const [kind, input] = options.queryKey as [string, Record<string, string>]
  if (options.enabled === false) return result({ state: "checking" })
  calls.push(kind)
  return result(reads[kind]?.(input ?? {}) ?? { state: "checking" })
}
mock.module("@tanstack/react-query", () => ({
  useQuery: answer,
  useQueries: ({ queries }: { queries: { queryKey: unknown[] }[] }) =>
    queries.map(answer),
}))
const { GeneralStockEditor } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/general-stock-editor"
)
const { NativeStockOriginalScreen } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/native-stock-original-screen"
)

const tenant = (activeStore = "store-a") => ({
  tenant: { id: "business" },
  activeStore: { id: activeStore, status: "ACTIVE" },
  actorUserId: "actor",
  membership: { tenantId: "business", role: "MANAGER" },
  stores: [
    { id: "store-a", name: "Ikeja" },
    { id: "store-b", name: "Lekki" },
  ],
})
const balance = (id: string, extra: Record<string, unknown> = {}) => ({
  balanceSourceId: id,
  storeId: "store-a",
  storeName: "Ikeja",
  productId: "product-milk",
  productName: "Peak Milk",
  variantId: "variant-tin",
  variantName: "400g tin",
  catalogItemId: "item-milk",
  configurationVersionId: "cfg-2",
  kind: "PACKAGED_STOCK",
  custodyType: "STORE",
  custodyReferenceId: null,
  inventoryUnitId: "unit-tin",
  inventoryUnitName: "Tin",
  inventoryUnitFactor: "1",
  inventoryUnitTransactionScale: 0,
  onHandQuantity: "120",
  reservedQuantity: "24",
  availableQuantity: "96",
  revision: 4,
  ...extra,
})
const units = [
  {
    id: "cfg-2",
    productId: "product-milk",
    status: "current",
    units: [
      { id: "unit-tin", name: "Tin", factor: "1", transactionScale: 0 },
      { id: "unit-carton", name: "Carton", factor: "24", transactionScale: 0 },
    ],
  },
]
function base(storeOf = "store-a") {
  reads = {
    tenant: () => ready(tenant(storeOf)),
    balance: ({ balanceSourceId }) => ready(balance(balanceSourceId)),
    units: () => ready(units),
  }
  calls.length = 0
}
function render(initial: NativeStockAction, disabled = false) {
  return renderToStaticMarkup(
    createElement(GeneralStockEditor, {
      initial,
      currencyCode: "NGN",
      disabled,
      onSave: () => {
        throw Error("Static render cannot Save")
      },
    }),
  )
}
const saveDisabled =
  /<button(?=[^>]*disabled="")[^>]*>Save and review<\/button>/
const saveEnabled = /<button type="button">Save and review<\/button>/

const receive: NativeStockAction = {
  action: "stock_receive",
  balanceSourceId: "balance-tin",
  enteredInventoryUnitId: "unit-carton",
  enteredQuantity: "2",
  source: "Invoice 42",
  supplierName: "Mills Ltd",
  unitCostMinor: 450000,
  reason: "Delivery",
}

test("only stock roles in an unchanged fresh scope reach any stock read", () => {
  base()
  role = "CASHIER"
  expect(render(receive)).toContain(
    "An owner, administrator or manager can edit stock drafts.",
  )
  expect(calls).toEqual([])
  role = "MANAGER"
  base("store-b")
  const moved = render(receive)
  expect(moved).toContain("Your current business, Store or access changed")
  expect(calls).toEqual(["tenant"])
  base()
  reads.tenant = () => ({ state: "checking" })
  expect(render(receive)).toContain("Checking your current business and Store")
})

test("receive shows the fixed source and drafted unit with fresh stock, never raw ids", () => {
  base()
  const html = render(receive)
  expect(html).toContain("Peak Milk")
  expect(html).toContain("Unit: Carton · whole numbers")
  expect(html).toContain("96")
  expect(html).toContain("checked")
  expect(html).toContain("14:20 UTC")
  expect(html).toContain("Invoice 42")
  expect(html).toContain("4500")
  expect(html).not.toContain("balance-tin")
  expect(html).not.toContain("unit-carton")
  expect(html).toMatch(saveEnabled)
  expect(render(receive, true)).toMatch(saveDisabled)
})

test("another Store's row, non-Store custody or a superseded unit fails closed", () => {
  base()
  reads.balance = ({ balanceSourceId }) =>
    ready(balance(balanceSourceId, { storeId: "store-b" }))
  let html = render(receive)
  expect(html).toContain("unavailable in the current Store")
  expect(html).toMatch(saveDisabled)
  base()
  reads.balance = ({ balanceSourceId }) =>
    ready(balance(balanceSourceId, { custodyType: "STAFF" }))
  expect(render(receive)).toContain("not in Store custody")
  base()
  reads.units = () => ready([{ ...units[0], status: "superseded" }])
  html = render(receive)
  expect(html).toContain("no longer part of this product")
  expect(html).toMatch(saveDisabled)
  base()
  reads.balance = () => ({ state: "refused" })
  html = render(receive)
  expect(html).toContain("Retry stock source")
  expect(html).not.toContain("Peak Milk")
})

test("transfer receipt is editable only in the destination Store while in transit", () => {
  const transferReview = {
    id: "transfer-1",
    status: "IN_TRANSIT",
    productName: "Golden Penny Flour",
    variantName: "50kg bag",
    sourceStore: { id: "store-a", name: "Ikeja" },
    targetStore: { id: "store-b", name: "Lekki" },
    unitName: "50kg bag",
    transactionScale: 0,
    dispatchedQuantity: "10",
    transit: { quantity: "6", reserved: "0" },
  }
  const action: NativeStockAction = {
    action: "stock_transfer_receive",
    transferId: "transfer-1",
    quantity: "6",
    reason: "Arrived",
  }
  base()
  reads.transfer = () => ready(transferReview)
  let html = render(action)
  expect(html).toContain("Switch to Lekki")
  expect(html).toMatch(saveDisabled)
  storeId = "store-b"
  base("store-b")
  reads.transfer = () => ready(transferReview)
  html = render(action)
  expect(html).toContain("6 50kg bag of 10 dispatched")
  expect(html).toMatch(saveEnabled)
  reads.transfer = () => ready({ ...transferReview, status: "RECEIVED" })
  expect(render(action)).toContain("Nothing is in transit")
  storeId = "store-a"
})

test("custody keeps equal names separate and flags a drafted person who is no longer eligible", () => {
  base()
  reads.assignees = () =>
    ready({
      storeId: "store-a",
      assignees: [
        { id: "user-1", name: "Bola Ade", role: "CASHIER" },
        { id: "user-2", name: "Bola Ade", role: "CASHIER" },
        { id: "user-3", name: null, role: "MANAGER" },
      ],
    })
  const html = render({
    action: "stock_custody_move",
    sourceBalanceSourceId: "balance-tin",
    target: { type: "staff", userId: "former-user" },
    quantity: "2",
    reason: "Route",
  })
  expect(html).toContain("Bola Ade · cashier · 1")
  expect(html).toContain("Bola Ade · cashier · 2")
  expect(html).toContain("Name unavailable · manager")
  expect(html).toContain("not eligible in this Store now")
  expect(html).not.toContain("former-user")
})

test("count observations name session custody without inventing a label", () => {
  base()
  reads.balance = ({ balanceSourceId }) =>
    ready(
      balance(balanceSourceId, {
        custodyType: "SESSION",
        custodyReferenceId: "session-ref",
      }),
    )
  const html = render({
    action: "stock_count_create",
    reason: "Weekly",
    lines: [
      {
        balanceSourceId: "balance-tin",
        entries: [
          { enteredInventoryUnitId: "unit-carton", enteredQuantity: "0" },
          { enteredInventoryUnitId: "unit-tin", enteredQuantity: "7" },
        ],
      },
    ],
  })
  expect(html).toContain("Session custody · label unavailable")
  expect(html).toContain("Counted · Carton")
  expect(html).toContain("Counted · Tin")
  expect(html).not.toContain("session-ref")
})

test("repack previews the exact canonical result; finalize and correction fail closed", () => {
  base()
  reads.balance = ({ balanceSourceId }) =>
    ready(
      balanceSourceId === "balance-crate"
        ? balance(balanceSourceId, {
            inventoryUnitName: "Crate",
            inventoryUnitFactor: "24",
          })
        : balance(balanceSourceId, {
            inventoryUnitName: "Tray",
            inventoryUnitFactor: "6",
          }),
    )
  expect(
    render({
      action: "stock_package_transform",
      sourceBalanceSourceId: "balance-crate",
      targetBalanceSourceId: "balance-tray",
      sourceQuantity: "2",
      reason: "Repack",
    }),
  ).toContain("2 Crate → 8 Tray")
  base()
  reads.count = () =>
    ready({
      id: "count-1",
      storeId: "store-a",
      status: "DRAFT",
      canFinalize: false,
      lines: [],
    })
  expect(
    render({
      action: "stock_count_finalize",
      stockCountId: "count-1",
      reason: "Done",
    }),
  ).toContain("no longer current")
  base()
  reads.operation = () =>
    ready({
      id: "op-1",
      storeId: "store-a",
      type: "RECEIPT",
      reason: "Delivery",
      movements: [{ id: "m-1" }],
    })
  const html = render({
    action: "stock_correct",
    targetOperationId: "op-1",
    reason: "Typo",
    corrections: [
      { movementId: "m-1", correctedEnteredQuantity: "5" },
      { movementId: "m-2", correctedEnteredQuantity: "1" },
    ],
  })
  expect(html).toContain("no longer has every drafted movement")
  expect(html).toMatch(saveDisabled)
})

test("originals open only the exact record in the active Store", () => {
  base()
  const screen = (
    original: Parameters<typeof NativeStockOriginalScreen>[0]["original"],
  ) =>
    renderToStaticMarkup(createElement(NativeStockOriginalScreen, { original }))
  expect(screen(null)).toContain("This original stock link is invalid")
  const transfer = {
    id: "transfer-1",
    status: "IN_TRANSIT",
    createdAt: "2026-10-13T15:40:00.000Z",
    productName: "Golden Penny Flour",
    variantName: "50kg bag",
    sourceStore: { id: "store-b", name: "Lekki" },
    targetStore: { id: "store-a", name: "Ikeja" },
    unitName: "50kg bag",
    factor: "50",
    dispatchedQuantity: "10",
    transit: { quantity: "6", reserved: "0" },
    acknowledgments: [],
    acknowledgmentHistoryLimited: false,
  }
  reads.transfer = () => ready(transfer)
  let html = screen({ kind: "stock_transfer", transferId: "transfer-1" })
  expect(html).toContain("Ikeja (destination)")
  expect(html).toContain("No receipt or cancellation yet")
  reads.transfer = () =>
    ready({ ...transfer, targetStore: { id: "store-c", name: "Ajah" } })
  html = screen({ kind: "stock_transfer", transferId: "transfer-1" })
  expect(html).toContain("unavailable in the current Store")
  reads.operation = () =>
    ready({ id: "op-1", storeId: "store-b", movements: [] })
  expect(screen({ kind: "stock_operation", operationId: "op-1" })).toContain(
    "unavailable in the current Store",
  )
  reads.operation = () => ready(null)
  expect(screen({ kind: "stock_operation", operationId: "op-1" })).toContain(
    "Retry original",
  )
})
