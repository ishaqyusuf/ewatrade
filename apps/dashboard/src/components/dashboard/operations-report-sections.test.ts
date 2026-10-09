import { describe, expect, test } from "bun:test"
import { metricTone, sectionTone } from "@/components/reports/report-metrics"

import {
  buildInventoryGroups,
  buildServiceGroups,
} from "./operations-report-sections"

const service = {
  commercial: { immutableServiceQuantity: 3, serviceRevenueMinor: 150_000 },
  communications: { intents: 2 },
  work: {
    blocked: 0,
    completed: 5,
    exceptions: 1,
    overdueJobs: 0,
    ready: 2,
    rework: 0,
    wip: 4,
  },
}

describe("Operations report sections", () => {
  test("counts balance kinds and keeps provisional commands separate", () => {
    const groups = buildInventoryGroups({
      balances: {
        rows: [
          { kind: "SHARED_POOL" },
          { kind: "PACKAGED_STOCK" },
          { kind: "PACKAGED_STOCK" },
          { kind: "OTHER" },
        ],
      },
      reconciliation: { provisionalCommands: 1 },
    })
    expect(
      groups.map((group) => [
        group.title,
        group.metrics.map((m) => [m.label, m.value]),
      ]),
    ).toEqual([
      [
        "Balances",
        [
          ["Balance sources", 4],
          ["Shared pools", 1],
          ["Packaged balances", 2],
        ],
      ],
      ["Offline reconciliation", [["Provisional commands", 1]]],
    ])
  })

  test("emphasises only blocked and overdue work, and only above zero", () => {
    expect(sectionTone({ groups: buildServiceGroups(service) })).toBeNull()
    const blocked = buildServiceGroups({
      ...service,
      work: { ...service.work, blocked: 2 },
    })
    expect(sectionTone({ groups: blocked })).toBe("block")
    const overdue = buildServiceGroups({
      ...service,
      work: { ...service.work, blocked: 2, overdueJobs: 1 },
    })
    expect(sectionTone({ groups: overdue })).toBe("failure")
    const exceptions = overdue
      .flatMap((group) => group.metrics)
      .find((m) => m.label === "Exceptions")
    expect(exceptions && metricTone(exceptions)).toBeNull()
  })
})
