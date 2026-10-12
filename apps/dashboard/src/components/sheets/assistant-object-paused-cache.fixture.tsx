import { expect, mock, test } from "bun:test"
import { writeFileSync } from "node:fs"
import * as tanstack from "@tanstack/react-query"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"

// Run in a separate Bun process: these mocks test the wrapper visibility boundary,
// not native authorization, SheetFrame styling, navigation or saved runtime data.
let results: unknown[] = []
const enabled: Record<string, boolean | undefined> = {}
mock.module("@tanstack/react-query", () => ({
  ...tanstack,
  useQuery: () => results.shift(),
}))
const options = (name: string) => ({
  queryOptions: (_: unknown, config: { enabled?: boolean }) => {
    enabled[name] = config.enabled
    return {}
  },
})
mock.module("@/trpc/client", () => ({
  useTRPC: () => ({
    finance: {
      cashCount: options("count"),
      periodCloseChecklist: options("checklist"),
      reports: options("day"),
    },
    businessReporting: { read: options("report") },
    serviceAssistantIntake: { receipt: options("intake") },
  }),
}))
mock.module("nuqs", () => ({
  parseAsString: {},
  useQueryStates: () => [
    {
      assistantCashCount: "synthetic-count",
      assistantCashBook: "synthetic-book",
      assistantDayCloseBook: "synthetic-book",
      assistantDayCloseThrough: "2026-10-10T23:59:59.999Z",
    },
    () => {},
  ],
}))
mock.module("@ewatrade/ui", () => ({
  Sheet: ({ children }: { children: ReactNode }) => <>{children}</>,
  Button: ({
    children,
    disabled,
  }: { children: ReactNode; disabled?: boolean }) => (
    <button type="button" disabled={disabled}>
      {children}
    </button>
  ),
}))
mock.module("./sheet-frame", () => ({
  SheetFrame: ({
    title,
    children,
    footer,
  }: { title: string; children: ReactNode; footer?: ReactNode }) => (
    <section>
      <h2>{title}</h2>
      {children}
      {footer}
    </section>
  ),
}))
mock.module("@/components/finance/assistant-cash-count-view", () => ({
  AssistantCashCountView: () => <p>SENSITIVE ORIGINAL COUNT</p>,
}))
mock.module("@/components/finance/assistant-day-close-view", () => ({
  AssistantDayCloseView: ({ day }: { day?: unknown }) => (
    <p>AUTHORIZED CHECKLIST {day ? "SENSITIVE POSTED DAY" : "DAY WITHHELD"}</p>
  ),
}))
mock.module("@/components/business-report-content", () => ({
  BusinessReportContent: () => <p>SENSITIVE BUSINESS TOTALS</p>,
}))
mock.module("@/components/business-report-sheet-header", () => ({
  BusinessReportSheetHeader: () => null,
}))
mock.module("@/hooks/use-assistant-receipt", () => ({
  assistantObjectParams: {},
  closedAssistantObjectParams: {},
}))
mock.module("@/hooks/business-report-navigation", () => ({
  businessReportOriginalParams: () => ({}),
}))
mock.module("@/hooks/use-business-report-params", () => ({
  useBusinessReportParams: () => ({
    isOpen: true,
    close: () => {},
    open: () => {},
    target: {
      kind: "business_report",
      request: { report: "item_sales", filters: {} },
    },
  }),
}))
mock.module("@/hooks/use-service-intake-receipt-params", () => ({
  useServiceIntakeReceiptParams: () => ({
    isOpen: true,
    intakeId: "synthetic-intake",
    close: () => {},
    openOrder: () => {},
    openJob: () => {},
  }),
}))
mock.module("@/components/service-work/service-intake-receipt-content", () => ({
  ServiceIntakeReceiptContent: () => <p>SENSITIVE ORIGINAL INTAKE</p>,
}))
const { AssistantCashCountSheet } = await import("./assistant-cash-count-sheet")
const { AssistantDayCloseSheet } = await import("./assistant-day-close-sheet")
const { BusinessReportSheet } = await import("./business-report-sheet")
const { ServiceIntakeReceiptSheet } = await import(
  "./service-intake-receipt-sheet"
)
function render(value: ReactNode, ...queryResults: unknown[]) {
  results = queryResults
  return renderToStaticMarkup(value)
}
const payload = {
  from: "2026-10-01T00:00:00Z",
  snapshotSequence: "42",
  pagination: { nextCursor: "private-next" },
}
const ready = {
  data: payload,
  isPending: false,
  isFetching: false,
  isPaused: false,
  isError: false,
  isSuccess: true,
  refetch: () => {},
}
const frames: string[] = []
test("real cached TanStack success pauses a fresh authorization read without pending/fetching", () => {
  const client = new tanstack.QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const key = ["unchanged-native-object-key"]
  client.setQueryData(key, payload)
  let calls = 0
  tanstack.onlineManager.setOnline(false)
  try {
    const observer = new tanstack.QueryObserver(client, {
      queryKey: key,
      staleTime: 0,
      queryFn: async () => {
        calls++
        return payload
      },
    })
    const unsubscribe = observer.subscribe(() => {})
    const paused = observer.getCurrentResult()
    expect(paused.data).toEqual(payload)
    expect(paused.isSuccess).toBe(true)
    expect(paused.isPending).toBe(false)
    expect(paused.isFetching).toBe(false)
    expect(paused.isPaused).toBe(true)
    expect(calls).toBe(0)
    const count = render(<AssistantCashCountSheet />, paused)
    const day = render(<AssistantDayCloseSheet />, paused, paused)
    expect(enabled.day).toBe(false)
    const report = render(<BusinessReportSheet />, paused)
    const intake = render(<ServiceIntakeReceiptSheet timeZone="UTC" />, paused)
    for (const markup of [count, day, report, intake]) {
      expect(markup).toContain("Loading")
      expect(markup).not.toContain("SENSITIVE")
    }
    expect(day).not.toContain("AUTHORIZED CHECKLIST")
    expect(report).not.toContain("Next page")
    expect(report).toContain("disabled")
    expect(intake).not.toContain("Refresh")
    frames.push(
      `<h1>Offline cached success · fresh read paused</h1>${count}${day}${report}${intake}`,
    )
    unsubscribe()
  } finally {
    client.clear()
    tanstack.onlineManager.setOnline(true)
  }
})
test("authorized checklist with paused cached day withholds posted day values", () => {
  const markup = render(<AssistantDayCloseSheet />, ready, {
    ...ready,
    isPaused: true,
  })
  expect(enabled.day).toBe(true)
  expect(markup).toContain("AUTHORIZED CHECKLIST")
  expect(markup).toContain("Loading posted day summary")
  expect(markup).not.toContain("SENSITIVE POSTED DAY")
})
test("normal authorized success retains each object branch and pagination", () => {
  const count = render(<AssistantCashCountSheet />, ready)
  const day = render(<AssistantDayCloseSheet />, ready, ready)
  const report = render(<BusinessReportSheet />, ready)
  const intake = render(<ServiceIntakeReceiptSheet timeZone="UTC" />, ready)
  expect(count).toContain("SENSITIVE ORIGINAL COUNT")
  expect(day).toContain("SENSITIVE POSTED DAY")
  expect(report).toContain("SENSITIVE BUSINESS TOTALS")
  expect(report).toContain("Next page")
  expect(intake).toContain("SENSITIVE ORIGINAL INTAKE")
  expect(intake).toContain("Refresh")
  for (const markup of [count, day, report, intake])
    expect(markup).not.toContain("Loading")
  frames.push(
    `<h1>Authorized success · ordinary content branches</h1>${count}${day}${report}${intake}`,
  )
  if (process.env.G02_PAUSED_CACHE_PREVIEW)
    writeFileSync(
      process.env.G02_PAUSED_CACHE_PREVIEW,
      `<!doctype html><meta charset="utf-8"><title>G02 paused cache wrapper evidence</title><style>body{font:18px system-ui;background:#f5f4ef;color:#252721;padding:30px}main{display:grid;grid-template-columns:1fr 1fr;gap:30px}article,section{background:white;border:1px solid #ddd;border-radius:10px;padding:18px;margin-bottom:12px}h1{font-size:23px}h2{font-size:20px}output{color:#59664c}button{margin:8px;padding:8px}</style><p>Provider-free isolated source wrapper render. Synthetic cached payload; child content sentinels and SheetFrame mocked. No saved runtime, native authorization, UI styling or navigation acceptance.</p><main>${frames.map((frame) => `<article>${frame}</article>`).join("")}</main>`,
    )
})
