import { expect, test } from "bun:test"
import { PrismaClient } from "../../packages/db/generated/prisma/client"
import { PrismaPg } from "../../packages/db/node_modules/@prisma/adapter-pg"
import pg from "../../packages/db/node_modules/pg"
import {
  type PerformanceTrace,
  instrumentDatabasePool,
  withPerformanceTrace,
} from "../../packages/db/src/performance-tracing"
import { loadPerformanceDatabaseUrl } from "./target.mjs"

const live = process.env.PERFORMANCE_LIVE_TESTS === "1" ? test : test.skip
live(
  "actual pg pool and Prisma adapter preserve results and attribute queued acquisition",
  async () => {
    const pool = instrumentDatabasePool(
      new pg.Pool({ connectionString: loadPerformanceDatabaseUrl(), max: 1 }),
    )
    const db = new PrismaClient({
      adapter: new PrismaPg(pool, { disposeExternalPool: true }),
    })
    const traces: PerformanceTrace[] = []
    try {
      await db.$connect()
      const blocker = await pool.connect()
      const request = withPerformanceTrace(
        "request",
        async () => {
          const rows = await db.$queryRaw<
            Array<{ answer: number }>
          >`SELECT 42::int AS answer`
          expect(rows).toEqual([{ answer: 42 }])
          await db.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(9062026)`
            expect(
              await tx.$queryRaw<
                Array<{ answer: number }>
              >`SELECT 7::int AS answer`,
            ).toEqual([{ answer: 7 }])
          })
        },
        (trace) => traces.push(trace),
      )
      const queueDeadline = performance.now() + 5000
      while (pool.waitingCount === 0 && performance.now() < queueDeadline)
        await Bun.sleep(1)
      expect(pool.waitingCount).toBe(1)
      await Bun.sleep(80)
      blocker.release()
      await request
      expect(traces).toHaveLength(1)
      expect(traces[0].phases.pool?.milliseconds).toBeGreaterThanOrEqual(50)
      expect(traces[0].phases.sql?.count).toBeGreaterThanOrEqual(5)
      expect(traces[0].phases.lockingSql?.count).toBe(1)
      expect(traces[0].failed).toBe(false)
      expect(JSON.stringify(traces)).not.toContain("pg_advisory")
      expect(JSON.stringify(traces)).not.toContain("SELECT")
    } finally {
      await db.$disconnect()
    }
  },
  30000,
)
