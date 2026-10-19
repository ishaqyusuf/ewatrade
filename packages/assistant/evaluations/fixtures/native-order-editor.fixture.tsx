import { expect, mock, test } from "bun:test"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import { type ReactNode, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

// Isolated component evidence, not device/layout proof. Native primitives and
// the query hook are stood in; the actual editor, dispatch, freshness policy and
// validation helpers remain real. No API, model or database request is made.
const root = new URL("../../../../", import.meta.url)
function standIn(path: string, value: Record<string, unknown>) {
  mock.module(new URL(`apps/mobile/src/${path}`, root).pathname, () => value)
}
const children = ({ children }: { children?: ReactNode }) => (
  <div>{children}</div>
)
standIn("components/ui/bottom-sheet-input-context", {
  BottomSheetInputProvider: children,
})
standIn("components/ui/bottom-sheet-keyboard-aware-scroll-view", {
  BottomSheetKeyboardAwareScrollView: children,
})
standIn("components/ui/view", { View: children })
standIn("components/ui/text", { Text: children })
const button = ({
  children,
  disabled,
}: { children: ReactNode; disabled?: boolean }) => (
  <button type="button" disabled={disabled}>
    {children}
  </button>
)
standIn("components/ui/pressable", { Pressable: button })
standIn("components/mobile/action-button", { ActionButton: button })
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
standIn("components/mobile/form-field", { FormField: field })
standIn("components/mobile/money-field", { MoneyField: field })
standIn("hooks/use-auth", {
  useAuthContext: () => ({
    profile: {
      id: "actor",
      businessId: "business",
      storeId: "store",
      role: "OWNER",
    },
  }),
})
const inputs: unknown[] = []
standIn("trpc/client", {
  useTRPC: () => ({
    orders: {
      get: {
        queryOptions: (input: unknown, options: unknown) => {
          inputs.push(input)
          return {
            queryKey: ["orders", "get", input],
            queryFn: async () => {
              throw Error("Unexpected request")
            },
            ...(options as object),
          }
        },
      },
    },
  }),
})
const original = {
  orderNumber: "ORD-1042",
  lines: [
    {
      id: "private-line-id",
      quantity: "3",
      snapshot: {
        pricingPolicy: "fixed",
        catalogItemName: "Rice",
        offeringName: "Bag",
      },
    },
    {
      id: "private-total-id",
      quantity: "2",
      snapshot: {
        pricingPolicy: "order_total",
        catalogItemName: "Laundry",
        offeringName: "Wash",
      },
    },
  ],
}
function ready() {
  return {
    isError: false,
    isSuccess: true,
    isFetching: false,
    isPaused: false,
    isFetchedAfterMount: true,
    data: original,
    refetch: async () => {},
  }
}
let query = ready()
mock.module("@tanstack/react-query", () => ({ useQuery: () => query }))
const { GeneralOrderOperationEditor } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/general-order-operation-editor"
)
function render(initial: GeneralAction, disabled = false) {
  return renderToStaticMarkup(
    createElement(GeneralOrderOperationEditor, {
      initial: initial as never,
      currencyCode: "NGN",
      disabled,
      onSave: () => {
        throw Error("Static rendering cannot save a draft")
      },
    }),
  )
}
const replaced = {
  action: "order_replace",
  orderId: "private-order-id",
  reason: "Customer corrected quantities",
  changes: [
    { orderLineId: "private-line-id", quantity: "2", unitPriceMinor: 15000 },
    { orderLineId: "private-total-id", enteredTotalMinor: 45000 },
  ],
} as const

test("replacement editor loads the exact order and labels both original pricing policies", () => {
  query = ready()
  const html = render({ ...replaced, changes: [...replaced.changes] })
  expect(inputs.at(-1)).toEqual({ orderId: "private-order-id" })
  for (const label of [
    "ORD-1042",
    "Rice",
    "Bag",
    "Laundry",
    "Wash",
    "Replacement unit price",
    "Replacement item total",
  ])
    expect(html).toContain(label)
  expect(html).not.toContain("private-line-id")
  expect(html).not.toContain("private-order-id")
})
test("an unfinished current read with cached data hides order facts and disables Save", () => {
  query = { ...ready(), isFetching: true }
  const html = render({ ...replaced, changes: [...replaced.changes] })
  expect(html).toContain("Checking the original order")
  expect(html).not.toContain("Rice")
  expect(html).toMatch(
    /<button(?=[^>]*disabled="")[^>]*>Save and review<\/button>/,
  )
})
test("denied or paused reads never render a previously cached original", () => {
  for (const state of [
    { isError: true },
    { isPaused: true },
    { isFetchedAfterMount: false },
  ]) {
    query = { ...ready(), ...state }
    const html = render({ ...replaced, changes: [...replaced.changes] })
    expect(html).not.toContain("Rice")
    expect(html).toMatch(
      /<button(?=[^>]*disabled="")[^>]*>Save and review<\/button>/,
    )
  }
})
test("a refused original offers Retry rather than editing unnamed IDs", () => {
  query = { ...ready(), isError: true }
  expect(render({ ...replaced, changes: [...replaced.changes] })).toContain(
    "Retry order",
  )
})
test("return form offers all dispositions, preserves stock identity and discloses no cash refund", () => {
  const html = render({
    action: "product_line_return",
    orderLineId: "private-line-id",
    quantity: "0.5",
    disposition: "restock",
    destinationBalanceSourceId: "private-balance",
    reason: "Unopened",
  })
  for (const text of [
    "Quantity in the sold unit",
    "Damaged",
    "Quarantine",
    "Record return without restocking",
    "Keep the reviewed destination",
    "Original stock source",
    "not a customer credit or cash refund",
  ])
    expect(html).toContain(text)
  expect(html).not.toContain("private-line-id")
  expect(html).not.toContain("private-balance")
})
test("non-restock never offers a stock destination", () => {
  const html = render({
    action: "product_line_return",
    orderLineId: "line",
    quantity: "1",
    disposition: "damaged",
    reason: "Broken",
  })
  expect(html).toContain("Available stock will not increase")
  expect(html).not.toContain("Keep the reviewed destination")
})
test("fulfilment and authorization preserve saved selection and obey the busy guard", () => {
  for (const action of [
    "product_line_fulfill",
    "service_line_authorize",
    "service_line_fulfill",
  ] as const) {
    const html = render(
      { action, orderLineId: "private-line", reason: "Checked" },
      true,
    )
    expect(html).toContain(
      action === "service_line_authorize"
        ? "Authorize the saved service selection"
        : "saved selection and quantity",
    )
    if (action === "service_line_authorize")
      expect(html).toContain("approval only, not service performance")
    expect(html).not.toContain("private-line")
    expect(html).toMatch(
      /<button(?=[^>]*disabled="")[^>]*>Save and review<\/button>/,
    )
  }
})
