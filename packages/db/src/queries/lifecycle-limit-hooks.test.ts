import { afterEach, describe, expect, test } from "bun:test"
import {
  type LimitPressureUsage,
  reportOrderLimitUsage,
  reportStaffLimitUsage,
  setLimitPressureHandler,
} from "./lifecycle-limit-hooks"

function fakeTx() {
  const statements: string[] = []
  const tx = {
    $executeRawUnsafe: async (sql: string) => {
      statements.push(sql)
      return 0
    },
  }
  return { tx: tx as never, statements }
}

const staff = { tenantId: "tenant_1", planId: "starter" as const, cap: 2 }
const previousFlag = process.env.GROWTH_LIFECYCLE_ENABLED

afterEach(() => {
  setLimitPressureHandler(null)
  process.env.GROWTH_LIFECYCLE_ENABLED = previousFlag
})

describe("lifecycle limit hooks", () => {
  test("flag off: the handler never runs and no query is made", async () => {
    process.env.GROWTH_LIFECYCLE_ENABLED = "false"
    const calls: LimitPressureUsage[] = []
    setLimitPressureHandler(async (_tx, usage) => {
      calls.push(usage)
    })
    const { tx, statements } = fakeTx()
    await reportStaffLimitUsage(tx, { ...staff, used: 2 })
    // The order hook would read the plan first; with the flag off it must not.
    await reportOrderLimitUsage({} as never, {
      tenantId: "tenant_1",
      now: new Date(),
    })
    expect(calls).toHaveLength(0)
    expect(statements).toHaveLength(0)
  })

  test("no handler installed: nothing runs even with the flag on", async () => {
    process.env.GROWTH_LIFECYCLE_ENABLED = "true"
    const { tx, statements } = fakeTx()
    await reportStaffLimitUsage(tx, { ...staff, used: 2 })
    expect(statements).toHaveLength(0)
  })

  test("below 80% skips the handler", async () => {
    process.env.GROWTH_LIFECYCLE_ENABLED = "true"
    const calls: LimitPressureUsage[] = []
    setLimitPressureHandler(async (_tx, usage) => {
      calls.push(usage)
    })
    const { tx } = fakeTx()
    await reportStaffLimitUsage(tx, { ...staff, cap: 10, used: 7 })
    expect(calls).toHaveLength(0)
    await reportStaffLimitUsage(tx, { ...staff, cap: 10, used: 8 })
    expect(calls).toHaveLength(1)
  })

  test("runs inside a savepoint and releases it", async () => {
    process.env.GROWTH_LIFECYCLE_ENABLED = "true"
    const calls: LimitPressureUsage[] = []
    setLimitPressureHandler(async (_tx, usage) => {
      calls.push(usage)
    })
    const { tx, statements } = fakeTx()
    await reportStaffLimitUsage(tx, { ...staff, used: 2 })
    expect(calls[0]).toMatchObject({ limit: "staff", used: 2, cap: 2 })
    expect(statements).toEqual([
      "SAVEPOINT lifecycle_limit_pressure",
      "RELEASE SAVEPOINT lifecycle_limit_pressure",
    ])
  })

  test("a failing handler rolls back to the savepoint and never throws", async () => {
    process.env.GROWTH_LIFECYCLE_ENABLED = "true"
    setLimitPressureHandler(async () => {
      throw new Error("ledger unavailable")
    })
    const { tx, statements } = fakeTx()
    const originalError = console.error
    console.error = () => {}
    try {
      await reportStaffLimitUsage(tx, { ...staff, used: 2 })
    } finally {
      console.error = originalError
    }
    expect(statements).toEqual([
      "SAVEPOINT lifecycle_limit_pressure",
      "ROLLBACK TO SAVEPOINT lifecycle_limit_pressure",
    ])
  })
})
