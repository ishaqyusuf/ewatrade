import { expect, test } from "bun:test"
import { type Operation, TRPCClientError } from "@trpc/client"
import type { AnyTRPCRouter } from "@trpc/server"
import { observable } from "@trpc/server/observable"
import { dashboardAnalyticsLink } from "./analytics-link"

test("browser mutation link records intent and blocked errors without leaking inputs/errors", () => {
  const captured: unknown[] = []
  const link = dashboardAnalyticsLink<AnyTRPCRouter>((name, properties) =>
    captured.push({ name, properties }),
  )({})
  const op: Operation = {
    id: 1,
    type: "mutation",
    path: "orders.create",
    input: { email: "private@example.com" },
    context: {},
    signal: null,
  }
  link({
    op,
    next: () =>
      observable((observer) => {
        observer.error(
          TRPCClientError.from({
            error: {
              message: "private error detail",
              code: -32003,
              data: { code: "FORBIDDEN" },
            },
          }),
        )
        return () => {}
      }),
  }).subscribe({ error: () => {} })
  expect(captured).toHaveLength(2)
  expect(captured[0]).toMatchObject({ name: "dashboard_sales_create_started" })
  expect(captured[1]).toMatchObject({ name: "dashboard_sales_create_blocked" })
  expect(JSON.stringify(captured)).not.toContain("private")
})
test("success is server-owned; queries and excluded mobile/QA operations do not emit mutation events", () => {
  const captured: string[] = []
  const link = dashboardAnalyticsLink<AnyTRPCRouter>((name) =>
    captured.push(name),
  )({})
  for (const [type, path] of [
    ["mutation", "orders.create"],
    ["query", "orders.list"],
    ["mutation", "qaAccess.exchange"],
    ["mutation", "serviceCommerce.mobileSendText"],
  ] as const) {
    link({
      op: {
        id: 1,
        type,
        path,
        input: { patient: "private" },
        context: {},
        signal: null,
      },
      next: () =>
        observable((observer) => {
          observer.next({ result: { data: { id: "private" } } })
          observer.complete()
          return () => {}
        }),
    }).subscribe({})
  }
  expect(captured).toEqual(["dashboard_sales_create_started"])
})
