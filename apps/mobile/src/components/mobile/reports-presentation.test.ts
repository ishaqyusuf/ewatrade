import { describe, expect, test } from "bun:test"
import { REPORTS_COPY, buildReportsPresentation } from "./reports-presentation"

describe("reports presentation", () => {
  test("turns the empty report into a compact operational ledger", () => {
    const result = buildReportsPresentation({
      balanceSources: 0,
      orderCount: 0,
      orderValueMinor: 0,
      provisionalCommands: 0,
      service: { blocked: 0, overdueJobs: 0, ready: 0, wip: 0 },
    })

    expect(result.isEmpty).toBe(true)
    expect(result.operations).toEqual([
      {
        detail: "No balance sources yet",
        id: "inventory",
        label: "Inventory",
        value: "0",
      },
      {
        detail: "No provisional records",
        id: "pending",
        label: "Pending records",
        value: "0",
      },
      {
        detail: "0 ready · 0 blocked · 0 overdue",
        id: "service",
        label: "Service work",
        value: "0 WIP",
      },
    ])
    expect(REPORTS_COPY.emptyTitle).toBe("No activity yet")
  })

  test("keeps each real report source explicit when activity exists", () => {
    const result = buildReportsPresentation({
      balanceSources: 3,
      orderCount: 4,
      orderValueMinor: 125_000,
      provisionalCommands: 2,
      service: { blocked: 1, overdueJobs: 2, ready: 3, wip: 4 },
    })

    expect(result.isEmpty).toBe(false)
    expect(result.operations[0]).toEqual({
      detail: "3 balance sources",
      id: "inventory",
      label: "Inventory",
      value: "3",
    })
    expect(result.operations[1]?.value).toBe("2")
    expect(result.operations[2]).toEqual({
      detail: "3 ready · 1 blocked · 2 overdue",
      id: "service",
      label: "Service work",
      value: "4 WIP",
    })
  })
})
