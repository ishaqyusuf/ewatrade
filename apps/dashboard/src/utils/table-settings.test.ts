import { describe, expect, test } from "bun:test"
import {
  normalizeColumnOrder,
  normalizeTableSettings,
  tableSettingsSchema,
} from "./table-settings"

describe("persisted table layout", () => {
  test("drops removed and duplicate columns, keeps fixed columns at the edges", () => {
    expect(
      normalizeColumnOrder(
        ["actions", "status", "status", "removed", "name"],
        ["select", "name", "date", "status", "actions"],
        ["name"],
      ),
    ).toEqual(["select", "name", "date", "status", "actions"])
  })
  test("uses the default order when nothing is saved", () => {
    expect(
      normalizeColumnOrder(
        [],
        ["select", "order", "createdAt", "payment", "status", "actions"],
        ["order"],
      ),
    ).toEqual(["select", "order", "createdAt", "payment", "status", "actions"])
  })
  test("inserts new columns beside their default neighbours, keeping the saved order", () => {
    const columnIds = [
      "order",
      "createdAt",
      "payment",
      "customer",
      "status",
      "total",
      "actions",
    ]
    expect(
      normalizeColumnOrder(
        ["order", "total", "customer", "status", "actions"],
        columnIds,
      ),
    ).toEqual([
      "order",
      "createdAt",
      "payment",
      "total",
      "customer",
      "status",
      "actions",
    ])
    expect(
      normalizeColumnOrder(
        ["order", "total", "createdAt", "status"],
        columnIds,
      ),
    ).toEqual([
      "order",
      "total",
      "createdAt",
      "payment",
      "customer",
      "status",
      "actions",
    ])
  })
  test("places a new first column before its nearest saved follower", () => {
    expect(
      normalizeColumnOrder(
        ["status", "removed", "name"],
        ["date", "name", "status"],
      ),
    ).toEqual(["status", "date", "name"])
  })
  test("ignores saved positions of removed and fixed columns", () => {
    expect(
      normalizeColumnOrder(
        ["actions", "gone", "status", "select", "name", "sku"],
        ["select", "sku", "name", "price", "status", "actions"],
        ["sku"],
      ),
    ).toEqual(["select", "sku", "status", "name", "price", "actions"])
  })
  test("keeps required columns visible and filters stale layout data", () => {
    expect(
      normalizeTableSettings(
        {
          columns: { name: false, status: false, removed: false },
          sizing: { name: 220, removed: 90 },
          order: ["status", "name"],
        },
        ["name", "status", "actions"],
        ["name"],
      ),
    ).toEqual({
      columns: { name: true, status: false },
      sizing: { name: 220 },
      order: ["name", "status", "actions"],
      scope: undefined,
    })
  })
  test("rejects unbounded, invalid and non-settings payloads", () => {
    expect(
      tableSettingsSchema.safeParse({
        columns: {},
        sizing: { name: Number.NaN },
        order: [],
      }).success,
    ).toBe(false)
    expect(
      tableSettingsSchema.safeParse({
        columns: {},
        sizing: { name: 2001 },
        order: [],
      }).success,
    ).toBe(false)
    expect(
      tableSettingsSchema.safeParse({
        columns: {},
        sizing: {},
        order: Array(41).fill("name"),
      }).success,
    ).toBe(false)
    expect(
      tableSettingsSchema.safeParse({
        columns: {},
        sizing: {},
        order: [],
        tenantId: "foreign",
      }).success,
    ).toBe(false)
  })
  test("retains valid widths and optional server scope through normalization", () => {
    expect(
      normalizeTableSettings({ sizing: { name: 300 }, scope: "server-scope" }, [
        "name",
        "status",
      ]),
    ).toEqual({
      columns: {},
      sizing: { name: 300 },
      order: ["name", "status"],
      scope: "server-scope",
    })
  })
})
