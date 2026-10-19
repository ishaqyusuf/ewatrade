import { expect, mock, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"

// Run alone. Both consumers receive the same URL value through the real nuqs
// parsers. The audit body is replaced to observe whether it would be opened.
const nuqs = await import("nuqs")
let operation: string | null = null
mock.module("nuqs", () => ({
  ...nuqs,
  useQueryStates: (parsers: {
    inventoryOperation: typeof nuqs.parseAsString
  }) => [
    {
      inventoryOperation: operation
        ? parsers.inventoryOperation.parse(operation)
        : null,
    },
    async () => {},
  ],
}))
mock.module(
  "../../../../apps/dashboard/src/components/sheets/inventory-audit-sheet",
  () => ({
    InventoryAuditSheet: ({ record }: { record: { id: string } | null }) =>
      record ? <output>Audit record: {record.id}</output> : null,
  }),
)
const { InventoryOperationDetailsSheet } = await import(
  "../../../../apps/dashboard/src/components/sheets/inventory-operation-details-sheet"
)
const { useInventoryParams, INVENTORY_OPERATION_MODES } = await import(
  "../../../../apps/dashboard/src/hooks/use-inventory-params"
)

// The real hook reads URL state; render it inside React so useCallback is real.
function OperationFormState() {
  const { operation: mode } = useInventoryParams()
  return mode ? <output>Form mode: {mode}</output> : null
}
for (const mode of INVENTORY_OPERATION_MODES) {
  test(`${mode} opens its form without opening an audit record`, () => {
    operation = mode
    expect(renderToStaticMarkup(<OperationFormState />)).toContain(
      `Form mode: ${mode}`,
    )
    expect(
      renderToStaticMarkup(<InventoryOperationDetailsSheet storeId="store" />),
    ).toBe("")
  })
}
test("an exact record opens its audit without opening an operation form", () => {
  operation = "cmv-test-original-operation"
  expect(renderToStaticMarkup(<OperationFormState />)).toBe("")
  expect(
    renderToStaticMarkup(<InventoryOperationDetailsSheet storeId="store" />),
  ).toContain("Audit record: cmv-test-original-operation")
})
test("clearing the URL closes both consumers", () => {
  operation = null
  expect(renderToStaticMarkup(<OperationFormState />)).toBe("")
  expect(
    renderToStaticMarkup(<InventoryOperationDetailsSheet storeId="store" />),
  ).toBe("")
})
