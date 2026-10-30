import { describe, expect, test } from "bun:test"
import {
  dashboardReadOperationCounts,
  readPerformancePhases,
} from "./qa-web-performance.mjs"
import { assertReadActivityBudget } from "./qa-web-route-families.mjs"

describe("private local navigation diagnostics", () => {
  test("accepts fixed numeric phases and excludes arbitrary or sensitive header text", () => {
    expect(
      readPerformancePhases(
        'ew_auth;dur=12.3;desc="2 calls",ew_sql;dur=4;desc="3 calls",ew_responseSetup;dur=2,ew_qaProofFacts;dur=3;desc="1 calls",ew_qaDomain;dur=7;desc="1 calls",ew_connection;dur=900;desc="1 calls",ew_poolBusy;dur=200;desc="2 calls",ew_actor;dur=1;desc="private",ew_scope;dur=2;desc="private",ew_pool;dur=Infinity,ew_legal;dur=-1',
      ),
    ).toEqual({
      auth: { milliseconds: 12.3, count: 2 },
      sql: { milliseconds: 4, count: 3 },
      responseSetup: { milliseconds: 2, count: 1 },
      qaProofFacts: { milliseconds: 3, count: 1 },
      qaDomain: { milliseconds: 7, count: 1 },
      connection: { milliseconds: 900, count: 1 },
      poolBusy: { milliseconds: 200, count: 2 },
    })
  })
})

test("counts RPC operations separately from batches without retaining private labels", () => {
  const counts = dashboardReadOperationCounts(
    "/api/trpc/businessBanking.pendingReportCount%2Ctenant.current%2Ctenant.current%2Cprivate-sentinel",
  )
  expect(counts).toEqual({
    notificationCounts: 1,
    workspaceScope: 2,
    otherRpc: 1,
  })
  expect(JSON.stringify(counts)).not.toContain("private-sentinel")
  expect(
    dashboardReadOperationCounts("/api/trpc-lookalike/tenant.current"),
  ).toEqual({})
  expect(dashboardReadOperationCounts("/api/trpc/%E0%A4%A")).toEqual({
    otherRpc: 1,
  })
  expect(
    dashboardReadOperationCounts("/api/assistant/runs/private-sentinel"),
  ).toEqual({})
})

test("accepts only fixed Activity and transaction timing facts", () => {
  const names = [
    "activityAdmission",
    "activityStores",
    "activityPageSql",
    "activityFilterSql",
    "activityList",
    "activityFilters",
    "transactionSql",
  ]
  const header = names
    .map((name) => `ew_${name};dur=1.5;desc="2 calls"`)
    .join(",")
  expect(
    readPerformancePhases(`${header},ew_businessId;dur=1;desc="private"`),
  ).toEqual(
    Object.fromEntries(
      names.map((name) => [name, { milliseconds: 1.5, count: 2 }]),
    ),
  )
})

test("inactive base-route budgets reject new API work without suppressing visible recovery", () => {
  const active = { started: 1, timeline: { api: { started: 1 } } }
  for (const phase of ["controlled-hidden", "offline-idle"]) {
    expect(() => assertReadActivityBudget(phase, active)).toThrow(
      "inactive base representative",
    )
    expect(() =>
      assertReadActivityBudget(phase, { started: 0, timeline: {} }),
    ).not.toThrow()
  }
  expect(() => assertReadActivityBudget("focus-return", active)).not.toThrow()
  expect(() => assertReadActivityBudget("reconnect", active)).not.toThrow()
})
