import { expect, mock, test } from "bun:test"
import * as tanstack from "@tanstack/react-query"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"

let results: unknown[] = []
const requests: Array<{ name: string; input: unknown; enabled?: boolean }> = []
mock.module("@tanstack/react-query", () => ({
  ...tanstack,
  useQuery: () => results.shift(),
}))
const query = (name: string) => ({
  queryOptions: (input: unknown, config: { enabled?: boolean }) => {
    requests.push({ name, input, enabled: config.enabled })
    return {}
  },
})
mock.module("@/trpc/client", () => ({
  useTRPC: () => ({
    tenant: { current: query("context") },
    serviceAssistantIntake: { options: query("bounded-options") },
    customers: { getById: query("customer") },
  }),
}))
mock.module("@ewatrade/ui", () => ({
  Button: ({
    children,
    disabled,
    type,
  }: {
    children: ReactNode
    disabled?: boolean
    type?: "button" | "submit"
  }) => (
    <button type={type} disabled={disabled}>
      {children}
    </button>
  ),
  ControlField: ({
    children,
    label,
  }: { children: ReactNode; label: string }) => (
    <div>
      {label}
      {children}
    </div>
  ),
  FieldGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Input: ({ value }: { value?: string }) => <input value={value} readOnly />,
  Textarea: ({ value }: { value?: string }) => (
    <textarea value={value} readOnly />
  ),
  SelectControl: ({
    value,
    options,
  }: { value?: string; options: Array<{ value: string; label: string }> }) => (
    <select value={value} disabled>
      {options.map((row) => (
        <option key={row.value} value={row.value}>
          {row.label}
        </option>
      ))}
    </select>
  ),
}))
const { GeneralServiceIntakeEditor, GeneralServiceIntakeEditorView } =
  await import("./general-service-intake-editor")
const initial = {
  action: "service_intake" as const,
  customerId: "saved-customer",
  instructions: "PRIVATE DRAFT INSTRUCTIONS",
  lines: [{ offeringId: "original", quantity: "2" }],
}
const ready = {
  isPending: false,
  isFetching: false,
  isPaused: false,
  isError: false,
  isSuccess: true,
  refetch: () => {},
}
const context = {
  ...ready,
  data: {
    tenant: { id: "tenant" },
    membership: { id: "membership" },
    activeStore: { id: "store" },
  },
}
const options = {
  ...ready,
  data: {
    storeId: "store",
    offerings: [
      {
        offeringId: "original",
        itemName: "PRIVATE SERVICE",
        variantName: "Variant",
        offeringName: "Service",
        fixedPriceMinor: 1000,
        service: { workPolicy: "TRACKED" },
      },
    ],
    assignees: [{ id: "staff", name: "PRIVATE STAFF" }],
    continuation: { cursor: "next", offeringAfter: "hundredth" },
  },
}
const customer = { ...ready, data: { name: "PRIVATE CUSTOMER" } }
const props = {
  initial,
  disabled: false,
  currencyCode: "NGN",
  onSave: () => {},
  onCancel: () => {},
}
function render(...reads: unknown[]) {
  results = reads
  requests.length = 0
  return renderToStaticMarkup(<GeneralServiceIntakeEditor {...props} />)
}

test("fresh bounded choices render search/continuation and enable review", () => {
  const html = render(context, options, customer)
  expect(requests).toEqual([
    { name: "context", input: undefined, enabled: undefined },
    { name: "bounded-options", input: {}, enabled: true },
    {
      name: "customer",
      input: { customerId: "saved-customer" },
      enabled: true,
    },
  ])
  expect(html).toContain("PRIVATE SERVICE")
  expect(html).toContain("PRIVATE CUSTOMER")
  expect(html).toContain("Next choices")
  expect(html).toContain('<button type="submit">Save and review</button>')
})

test("every pending, fetching, paused or failed dependency withholds cached data and the draft fields", () => {
  for (const flags of [
    { isPending: true },
    { isFetching: true },
    { isPaused: true },
    { isError: true },
  ]) {
    for (let index = 0; index < 3; index++) {
      const reads = [context, options, customer].map((row, i) =>
        i === index ? { ...row, ...flags } : row,
      )
      const html = render(...reads)
      expect(html).not.toContain("PRIVATE SERVICE")
      expect(html).not.toContain("PRIVATE STAFF")
      expect(html).not.toContain("PRIVATE CUSTOMER")
      expect(html).not.toContain("PRIVATE DRAFT INSTRUCTIONS")
      expect(html).toContain(
        '<button type="submit" disabled="">Save and review</button>',
      )
      if (index === 0) expect(requests[1]?.enabled).toBe(false)
    }
  }
})

test("a fresh response for another Store cannot disclose or authorize choices", () => {
  const html = render(
    context,
    { ...options, data: { ...options.data, storeId: "other" } },
    customer,
  )
  expect(html).not.toContain("PRIVATE SERVICE")
  expect(html).not.toContain("PRIVATE CUSTOMER")
  expect(html).toContain("Current intake choices are unavailable")
})

test("off-page original identity stays visible as unavailable and review stays blocked", () => {
  const html = render(
    context,
    { ...options, data: { ...options.data, offerings: [] } },
    customer,
  )
  expect(html).toContain(
    '<option value="original" selected="">Selected service is outside this page or unavailable</option>',
  )
  expect(html).toContain(
    '<button type="submit" disabled="">Save and review</button>',
  )
})

test("a saved assignee outside the eligible current-Store choices is not silently removed", () => {
  const html = renderToStaticMarkup(
    <GeneralServiceIntakeEditorView
      {...props}
      initial={{ ...initial, requestedAssigneeId: "ineligible" }}
      options={{
        offerings: [
          {
            id: "original",
            name: "Service",
            priceMinor: 1000,
            workPolicy: "TRACKED",
          },
        ],
        assignees: [],
      }}
    />,
  )
  expect(html).toContain("assignee is outside these choices or unavailable")
  expect(html).toContain(
    '<option value="ineligible" selected="">Selected assignee is unavailable</option>',
  )
  expect(html).toContain(
    '<button type="submit" disabled="">Save and review</button>',
  )
})
