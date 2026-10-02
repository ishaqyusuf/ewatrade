import { describe, expect, test } from "bun:test"
import {
  normalizeColumnOrder,
  normalizeTableSettings,
  tableSettingsSchema,
} from "./table-settings"

describe("persisted table layout", () => {
  test("drops removed and duplicate columns, adds new columns before fixed actions", () => {
    expect(
      normalizeColumnOrder(
        ["actions", "status", "status", "removed", "name"],
        ["select", "name", "date", "status", "actions"],
        ["name"],
      ),
    ).toEqual(["select", "name", "status", "date", "actions"])
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
