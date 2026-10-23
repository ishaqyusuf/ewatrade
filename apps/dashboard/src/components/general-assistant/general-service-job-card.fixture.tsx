import { expect, mock, test } from "bun:test"
import type {
  ServiceJobCreated,
  ServiceJobDraft,
} from "@ewatrade/assistant/general/contracts"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"

let context = { tenant: { id: "freshcare" }, activeStore: { id: "main" } }
const opened: unknown[] = []
const handed: unknown[] = []
let receipt: ServiceJobCreated | null = null
const trpc = {
  services: {
    assistantJobCard: { queryOptions: () => ({}), queryKey: () => ["card"] },
  },
}
const clicks = new Map<string, () => Promise<void>>()
mock.module("@/trpc/client", () => ({
  getDataCacheGeneration: () => 1,
  useTRPC: () => trpc,
  useTRPCClient: () => ({
    tenant: { current: { query: async () => context } },
    services: { assistantJobCard: { query: async () => receipt } },
  }),
}))
mock.module("@tanstack/react-query", () => ({
  useQuery: () => ({ data: receipt, isPending: false, isError: false }),
  useQueryClient: () => ({ setQueryData() {} }),
}))
mock.module("@/hooks/use-order-params", () => ({
  useOrderParams: () => ({
    setParams: async (value: unknown) => {
      opened.push(value)
    },
  }),
}))
mock.module("@/hooks/use-service-work-params", () => ({
  useServiceWorkParams: () => ({
    setParams: async (value: unknown) => {
      opened.push(value)
    },
  }),
}))
mock.module("@/hooks/use-service-intake-draft", () => ({
  setServiceIntakeDraft: (value: unknown) => handed.push(value),
}))
mock.module("./open-missing-catalog-item", () => ({
  OpenMissingCatalogItem: () => <button type="button">Add service</button>,
}))
mock.module("@ewatrade/ui", () => ({
  Button: ({
    children,
    onClick,
  }: { children: ReactNode; onClick: () => Promise<void> }) => {
    clicks.set(String(children), onClick)
    return <button type="button">{children}</button>
  },
}))
const { GeneralServiceJobCard } = await import("./general-service-job-card")
const draft: ServiceJobDraft = {
  origin: { tenantId: "freshcare", storeId: "main" },
  currencyCode: "NGN",
  customer: { name: "Ishaq Yusuf", phone: null, email: null },
  lines: [
    {
      name: "Shirt · Wash & iron",
      quantity: "40",
      offeringId: "shirt",
      unitPriceMinor: 20_000,
      totalMinor: 800_000,
    },
    {
      name: "Socks · Wash & iron",
      quantity: "5",
      unitPriceMinor: 10_000,
      totalMinor: 50_000,
    },
  ],
  totalMinor: 850_000,
  assumptions: [],
}
test("one final review contains all lines, optional new customer and missing-service addition", () => {
  const html = renderToStaticMarkup(
    <GeneralServiceJobCard
      draft={draft}
      answerId="card-1"
      messageId="message"
    />,
  )
  expect(html.match(/Laundry job/g)).toHaveLength(1)
  expect(html).toContain("40 × Shirt")
  expect(html).toContain("5 × Socks")
  expect(html).toContain("New customer")
  expect(html).toContain("Add service")
  expect(html).toContain("Review job")
  expect(html).toContain("No payment recorded")
  expect(html).not.toContain("Catalog page")
})
test("review opens the native form in place after a fresh exact-scope check", async () => {
  opened.length = 0
  handed.length = 0
  renderToStaticMarkup(
    <GeneralServiceJobCard
      draft={draft}
      answerId="card-1"
      messageId="message"
    />,
  )
  await clicks.get("Review job")?.()
  expect(handed).toEqual([
    { ...draft, sourceAnswerId: "card-1", sourceMessageId: "message" },
  ])
  expect(opened).toEqual([{ serviceSheet: "intake" }])
  context = { ...context, tenant: { id: "other" } }
  opened.length = 0
  handed.length = 0
  await clicks.get("Review job")?.()
  expect(handed).toHaveLength(0)
  expect(opened).toHaveLength(0)
})

test("a saved receipt replaces Review job with Open job and never stages another intake", async () => {
  context = { tenant: { id: "freshcare" }, activeStore: { id: "main" } }
  receipt = {
    intakeId: "intake",
    jobId: "saved-job",
    orderId: "order",
    orderNumber: "ORD-006",
    currencyCode: "NGN",
    totalMinor: 850_000,
    customerName: "Saved customer",
    createdAt: "2026-10-23T12:00:00.000Z",
    lines: draft.lines.map((line) => ({
      ...line,
      offeringId: line.offeringId ?? "socks",
    })),
  }
  opened.length = 0
  handed.length = 0
  const html = renderToStaticMarkup(
    <GeneralServiceJobCard
      draft={draft}
      answerId="card-1"
      messageId="message"
    />,
  )
  expect(html).toContain("Created · ORD-006")
  expect(html).toContain("Open job")
  expect(html).toContain("Saved customer")
  expect(html).not.toContain("Review job")
  expect(html).not.toContain("Add service")
  expect(html).not.toContain("No payment recorded")
  await clicks.get("Open job")?.()
  expect(handed).toHaveLength(0)
  expect(opened).toEqual([
    { serviceSheet: "job", jobId: "saved-job", jobStep: null },
  ])
})
