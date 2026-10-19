import { expect, mock, test } from "bun:test"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import { type ReactNode, act, createElement } from "react"
import {
  type NativeStockAction,
  isNativeStockAction,
} from "../../../../apps/mobile/src/components/mobile/assistant/native-stock-values"

// Actual mounted native stock editors (React DOM over xmldom), isolated from
// native primitives, tRPC, device and network state. Run alone: module
// stand-ins are process-wide. Retained Save handlers are invoked directly,
// as a stale closure would be, to prove the live fence.
const root = new URL("../../../../", import.meta.url)
function standIn(path: string, value: Record<string, unknown>) {
  mock.module(new URL(`apps/mobile/src/${path}`, root).pathname, () => value)
}
const children = ({ children }: { children?: ReactNode }) => (
  <div>{children}</div>
)
const handlers = new Map<string, () => void>()
const button = ({
  children,
  disabled,
  onPress,
  accessibilityLabel,
}: {
  children?: ReactNode
  disabled?: boolean
  onPress?: () => void
  accessibilityLabel?: string
}) => {
  const key =
    accessibilityLabel ?? (typeof children === "string" ? children : "")
  if (key && onPress) handlers.set(key, onPress)
  return (
    <button type="button" disabled={disabled}>
      {children}
    </button>
  )
}
const edits = new Map<string, (value: string) => void>()
const field = ({
  label,
  value,
  editable,
  onChangeText,
}: {
  label: string
  value: string
  editable?: boolean
  onChangeText?: (value: string) => void
}) => {
  if (onChangeText) edits.set(label, onChangeText)
  return (
    <label>
      {label}
      <input value={value} readOnly disabled={editable === false} />
    </label>
  )
}
let categoryChange: ((value: { name: string }[]) => void) | undefined
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
      StockCategoriesInput: ({
        value,
        onChange,
      }: {
        value: { name: string }[]
        onChange: (value: { name: string }[]) => void
      }) => {
        categoryChange = onChange
        return (
          <span>Categories: {value.map((row) => row.name).join(", ")}</span>
        )
      },
    },
  ],
  ["components/mobile/green-till/kit", { ListCard: children }],
] as const)
  standIn(path, value)
mock.module("react-native", () => ({ ScrollView: children }))

let role = "MANAGER"
const storeId = "store-a"
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

const tenant = {
  tenant: { id: "business" },
  activeStore: { id: "store-a", status: "ACTIVE" },
  actorUserId: "actor",
  membership: { tenantId: "business", role: "MANAGER" },
  stores: [
    { id: "store-a", name: "Ikeja" },
    { id: "store-b", name: "Lekki" },
  ],
}
const balance = (id: string, extra: Record<string, unknown> = {}) => ({
  balanceSourceId: id,
  storeId: "store-a",
  storeName: "Ikeja",
  productId: "product-milk",
  productName: "Peak Milk",
  variantId: "variant-tin",
  variantName: "400g tin",
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
  ...extra,
})
const transfer = (id: string, source: string, target: string) => ({
  id,
  status: "IN_TRANSIT",
  productName: "Golden Penny Flour",
  variantName: "50kg bag",
  sourceStore: { id: source, name: source === "store-a" ? "Ikeja" : "Lekki" },
  targetStore: { id: target, name: target === "store-a" ? "Ikeja" : "Lekki" },
  unitName: "50kg bag",
  transactionScale: 0,
  dispatchedQuantity: "10",
  transit: { quantity: "6", reserved: "0" },
})
function base() {
  reads = {
    tenant: () => ready(tenant),
    balance: ({ balanceSourceId }) =>
      ready(
        balanceSourceId === "balance-staff"
          ? balance(balanceSourceId, {
              custodyType: "STAFF",
              custodyReferenceId: "user-1",
            })
          : balanceSourceId === "balance-crate"
            ? balance(balanceSourceId, { inventoryUnitFactor: "24" })
            : balanceSourceId === "balance-tray"
              ? balance(balanceSourceId, { inventoryUnitFactor: "6" })
              : balance(balanceSourceId),
      ),
    units: () =>
      ready([
        {
          id: "cfg-2",
          productId: "product-milk",
          status: "current",
          units: [
            { id: "unit-tin", name: "Tin", factor: "1", transactionScale: 0 },
            {
              id: "unit-carton",
              name: "Carton",
              factor: "24",
              transactionScale: 0,
            },
          ],
        },
      ]),
    assignees: () =>
      ready({
        storeId: "store-a",
        assignees: [
          { id: "user-1", name: "Adaeze Okafor", role: "CASHIER" },
          { id: "user-2", name: "Bola Ade", role: "MANAGER" },
        ],
      }),
    transfer: ({ transferId }) =>
      ready(
        transferId === "t-in"
          ? transfer("t-in", "store-b", "store-a")
          : transfer("t-out", "store-a", "store-b"),
      ),
    count: () =>
      ready({
        id: "count-1",
        storeId: "store-a",
        status: "DRAFT",
        canFinalize: true,
        lines: [],
      }),
    closeout: () =>
      ready({
        id: "closeout-1",
        storeId: "store-a",
        custodyType: "STAFF",
        status: "DRAFT",
        canFinalize: true,
        lines: [],
      }),
    operation: () =>
      ready({
        id: "op-1",
        storeId: "store-a",
        type: "RECEIPT",
        reason: "Delivery",
        movements: [
          {
            id: "m-1",
            productName: "Peak Milk",
            variantName: "400g tin",
            custodyType: "STORE",
            enteredQuantity: "5",
            enteredInventoryUnitName: "Tin",
            unitFactorSnapshot: "1",
            transactionScaleSnapshot: 0,
          },
        ],
      }),
  }
}

// Every stock action with the read that decides whether its Save is live.
const cases: [NativeStockAction, string][] = [
  [
    {
      action: "stock_receive",
      balanceSourceId: "balance-tin",
      enteredInventoryUnitId: "unit-carton",
      enteredQuantity: "2",
      source: "Invoice 42",
      reason: "Delivery",
    },
    "balance",
  ],
  [
    {
      action: "stock_adjust",
      balanceSourceId: "balance-tin",
      enteredInventoryUnitId: "unit-tin",
      enteredQuantity: "1",
      direction: "decrease",
      purpose: "waste",
      categories: [{ name: "Damaged" }],
      reason: "Broken",
    },
    "units",
  ],
  [
    {
      action: "stock_correct",
      targetOperationId: "op-1",
      reason: "Typo",
      corrections: [{ movementId: "m-1", correctedEnteredQuantity: "4" }],
    },
    "operation",
  ],
  [
    {
      action: "stock_count_create",
      reason: "Weekly",
      lines: [
        {
          balanceSourceId: "balance-tin",
          entries: [
            { enteredInventoryUnitId: "unit-tin", enteredQuantity: "0" },
          ],
        },
      ],
    },
    "balance",
  ],
  [
    { action: "stock_count_finalize", stockCountId: "count-1", reason: "Done" },
    "count",
  ],
  [
    {
      action: "inventory_closeout_create",
      custodyType: "staff",
      custodyReferenceId: "user-1",
      reason: "Shift end",
      declarations: [
        { balanceSourceId: "balance-staff", declaredQuantity: "0" },
      ],
    },
    "balance",
  ],
  [
    {
      action: "inventory_closeout_finalize",
      closeoutId: "closeout-1",
      reason: "Checked",
    },
    "closeout",
  ],
  [
    {
      action: "stock_transfer_dispatch",
      sourceBalanceSourceId: "balance-tin",
      targetStoreId: "store-b",
      quantity: "3",
      reason: "Restock",
    },
    "balance",
  ],
  [
    {
      action: "stock_transfer_receive",
      transferId: "t-in",
      quantity: "6",
      reason: "Arrived",
    },
    "transfer",
  ],
  [
    { action: "stock_transfer_cancel", transferId: "t-out", reason: "Wrong" },
    "transfer",
  ],
  [
    {
      action: "stock_custody_move",
      sourceBalanceSourceId: "balance-tin",
      target: { type: "staff", userId: "user-1" },
      quantity: "2",
      reason: "Route",
    },
    "assignees",
  ],
  [
    {
      action: "stock_package_transform",
      sourceBalanceSourceId: "balance-crate",
      targetBalanceSourceId: "balance-tray",
      sourceQuantity: "2",
      reason: "Repack",
    },
    "balance",
  ],
]

const SAVE = "Save and review"
const emitted: NativeStockAction[] = []
async function mount(initial: NativeStockAction) {
  const { DOMImplementation } = await import("@xmldom/xmldom")
  const document = new DOMImplementation().createDocument(
    "http://www.w3.org/1999/xhtml",
    "html",
    null,
  )
  const window = {
    document,
    HTMLIFrameElement: class {},
    HTMLElement: class {},
    addEventListener() {},
    removeEventListener() {},
  }
  Object.assign(globalThis, {
    window,
    document,
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
  const host = document.createElement("div")
  document.documentElement?.appendChild(host)
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(host as unknown as HTMLElement)
  return {
    render: async (disabled = false) => {
      handlers.delete(SAVE)
      await act(async () =>
        root.render(
          createElement(GeneralStockEditor, {
            initial,
            currencyCode: "NGN",
            disabled,
            onSave: (payload: GeneralAction) => {
              if (!isNativeStockAction(payload))
                throw Error(`Stock editor saved ${payload.action}`)
              emitted.push(payload)
            },
          }),
        ),
      )
      return { html: host.toString(), save: handlers.get(SAVE) }
    },
    close: async () => act(async () => root.unmount()),
  }
}

for (const [initial, decisive] of cases)
  test(`${initial.action}: only the latest live ready render can Save`, async () => {
    role = "MANAGER"
    base()
    emitted.length = 0
    const ui = await mount(initial)
    const first = await ui.render()
    expect(first.html).not.toContain("Retry")
    // A re-render with the same data supersedes the earlier handler.
    const second = await ui.render()
    first.save?.()
    expect(emitted).toHaveLength(0)
    second.save?.()
    expect(emitted).toHaveLength(1)
    expect(emitted[0]?.action).toBe(initial.action)
    // Checking and refused reads invalidate it, even with no new handler.
    const keep = reads[decisive]
    reads[decisive] = () => ({ state: "checking" })
    const checking = await ui.render()
    second.save?.()
    checking.save?.()
    reads[decisive] = () => ({ state: "refused" })
    const refused = await ui.render()
    second.save?.()
    refused.save?.()
    expect(emitted).toHaveLength(1)
    // Ready again is a new generation: older handlers stay dead.
    if (keep) reads[decisive] = keep
    const fresh = await ui.render()
    second.save?.()
    expect(emitted).toHaveLength(1)
    // A disabled parent blocks both the old and the current handler.
    const disabled = await ui.render(true)
    fresh.save?.()
    disabled.save?.()
    expect(emitted).toHaveLength(1)
    // Same scope, fresh and allowed: the current handler saves once.
    const allowed = await ui.render()
    allowed.save?.()
    expect(emitted).toHaveLength(2)
    // Losing the stock role unmounts the editor; nothing can Save after.
    role = "CASHIER"
    await ui.render()
    allowed.save?.()
    role = "MANAGER"
    const remounted = await ui.render()
    allowed.save?.()
    expect(emitted).toHaveLength(2)
    // A scope change (another Store) remounts and kills the handler too.
    reads.tenant = () =>
      ready({ ...tenant, activeStore: { id: "store-b", status: "ACTIVE" } })
    await ui.render()
    remounted.save?.()
    expect(emitted).toHaveLength(2)
    reads.tenant = () => ready(tenant)
    const last = await ui.render()
    await ui.close()
    last.save?.()
    expect(emitted).toHaveLength(2)
  })

const actionOf = (name: NativeStockAction["action"]) => {
  const found = cases.find(([initial]) => initial.action === name)
  if (!found) throw Error(name)
  return found[0]
}
/**
 * Mounts a ready editor, then runs `change` and the Save handler drawn by
 * that ready render in ONE act turn, so React has not re-rendered between
 * the edits and Save. Returns what Save sent and the html after the turn.
 */
async function sameTurn(
  initial: NativeStockAction,
  change: () => void,
): Promise<{ sent: NativeStockAction[]; html: string }> {
  role = "MANAGER"
  base()
  emitted.length = 0
  edits.clear()
  const ui = await mount(initial)
  const ready = await ui.render()
  await act(async () => {
    change()
    ready.save?.()
  })
  const after = await ui.render()
  const sent = [...emitted]
  // Once the edit has rendered, the handler drawn before it stays dead.
  ready.save?.()
  expect(emitted).toHaveLength(sent.length)
  await ui.close()
  return { sent, html: after.html }
}
const typed = (label: string, value: string) => {
  const set = edits.get(label)
  if (!set) throw Error(`No field ${label}`)
  set(value)
}
const pressed = (label: string) => {
  const press = handlers.get(label)
  if (!press) throw Error(`No choice ${label}`)
  press()
}

test("same-turn invalid quantity or time never sends the earlier valid draft", async () => {
  const receive = actionOf("stock_receive")
  let run = await sameTurn(receive, () => typed("Quantity received", "1.5"))
  expect(run.sent).toEqual([])
  expect(run.html).toContain("whole numbers only")
  run = await sameTurn(receive, () =>
    typed("Effective time (UTC, optional)", "2026-10-15 09:00"),
  )
  expect(run.sent).toEqual([])
  expect(run.html).toContain("Enter a valid UTC time, including seconds and Z.")
  run = await sameTurn(receive, () =>
    typed("Effective time (UTC, optional)", "2026-10-15T09:00:00.123456Z"),
  )
  expect(run.sent).toEqual([])
})

test("same-turn valid edits, including two queued edits to one field, are what Save sends", async () => {
  const receive = actionOf("stock_receive")
  const run = await sameTurn(receive, () => {
    typed("Quantity received", "5")
    typed("Quantity received", "3")
    typed("Reason", "Latest reason")
    typed("Source or delivery reference", "Invoice 43")
    typed("Effective time (UTC, optional)", "2026-10-15T09:00:00.123Z")
    categoryChange?.([{ name: "Fresh" }])
  })
  expect(run.sent).toHaveLength(1)
  expect(run.sent[0]).toMatchObject({
    enteredQuantity: "3",
    reason: "Latest reason",
    source: "Invoice 43",
    effectiveAt: "2026-10-15T09:00:00.123Z",
    categories: [{ name: "Fresh" }],
  })
})

test("cost is validated exactly as typed: unknown, zero and exact amounts only", async () => {
  const receive = actionOf("stock_receive")
  const cost = "Reported cost per entered unit (optional)"
  for (const bad of ["1.234", "12a", "-5", "1.2.3"]) {
    const run = await sameTurn(receive, () => typed(cost, bad))
    expect(run.sent).toEqual([])
  }
  const blank = await sameTurn(receive, () => typed(cost, ""))
  expect(blank.sent[0]).not.toHaveProperty("unitCostMinor")
  const zero = await sameTurn(receive, () => typed(cost, "0"))
  expect(zero.sent[0]).toMatchObject({ unitCostMinor: 0 })
  const exact = await sameTurn(receive, () => typed(cost, "2,345.67"))
  expect(exact.sent[0]).toMatchObject({ unitCostMinor: 234567 })
})

test("same-turn choice edits: purpose, direction and custody staff", async () => {
  const adjust = {
    ...actionOf("stock_adjust"),
    purpose: "adjustment",
    direction: "increase",
  } as NativeStockAction
  let run = await sameTurn(adjust, () =>
    pressed("Waste or loss (always removes stock)"),
  )
  expect(run.sent[0]).toMatchObject({ purpose: "waste", direction: "decrease" })
  run = await sameTurn(adjust, () => pressed("Remove stock"))
  expect(run.sent[0]).toMatchObject({
    purpose: "adjustment",
    direction: "decrease",
  })
  run = await sameTurn(actionOf("stock_custody_move"), () => {
    pressed("Bola Ade · manager")
    typed("Quantity to give or return", "4")
  })
  expect(run.sent[0]).toMatchObject({
    target: { type: "staff", userId: "user-2" },
    quantity: "4",
  })
})

test("same-turn grid edits: count observations and closeout declarations", async () => {
  let run = await sameTurn(actionOf("stock_count_create"), () =>
    typed("Counted · Tin", "9"),
  )
  expect(run.sent[0]).toMatchObject({
    lines: [{ entries: [{ enteredQuantity: "9" }] }],
  })
  run = await sameTurn(actionOf("stock_count_create"), () =>
    typed("Counted · Tin", "1.5"),
  )
  expect(run.sent).toEqual([])
  run = await sameTurn(actionOf("inventory_closeout_create"), () => {
    typed("Declared · Tin", "7")
    typed("Reason", "Counted twice")
  })
  expect(run.sent[0]).toMatchObject({
    declarations: [{ declaredQuantity: "7" }],
    reason: "Counted twice",
  })
})

test("same-turn edits on correction, transfer and repack quantities", async () => {
  let run = await sameTurn(actionOf("stock_correct"), () =>
    typed("Replacement quantity · Tin", "6"),
  )
  expect(run.sent[0]).toMatchObject({
    corrections: [{ correctedEnteredQuantity: "6" }],
  })
  run = await sameTurn(actionOf("stock_transfer_dispatch"), () =>
    typed("Quantity to send", "0"),
  )
  expect(run.sent).toEqual([])
  run = await sameTurn(actionOf("stock_transfer_receive"), () =>
    typed("Quantity received", "5"),
  )
  expect(run.sent[0]).toMatchObject({ quantity: "5" })
  run = await sameTurn(actionOf("stock_transfer_receive"), () =>
    typed("Quantity received", "7"),
  )
  expect(run.sent).toEqual([])
  expect(run.html).toContain("Only 6 50kg bag is in transit.")
  run = await sameTurn(actionOf("stock_package_transform"), () =>
    typed("Source packs to repack", "3"),
  )
  expect(run.sent[0]).toMatchObject({ sourceQuantity: "3" })
  run = await sameTurn(actionOf("stock_transfer_cancel"), () =>
    typed("Reason", ""),
  )
  expect(run.sent).toEqual([])
})
