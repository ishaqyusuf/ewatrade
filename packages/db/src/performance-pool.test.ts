import { expect, test } from "bun:test"
import pg from "pg"
import {
  type PerformanceTrace,
  createInstrumentedDatabasePool,
  formatPerformanceServerTiming,
  traceSynchronousPhase,
  withPerformanceTrace,
} from "./performance-tracing"

function fixture() {
  const connections: Array<(error?: Error) => void> = []
  // Actual installed Pool owns acquisition, waiting, release and disposal. Only
  // physical socket I/O is inert; no database or timers are needed for the test.
  class InertClient extends pg.Client {
    constructor(options?: pg.ClientConfig) {
      super(options)
      this.connect = ((callback: (error?: Error) => void) => {
        connections.push(callback)
      }) as typeof this.connect
      this.end = ((callback?: () => void) => {
        callback?.()
        return Promise.resolve()
      }) as typeof this.end
    }
  }
  const pool = createInstrumentedDatabasePool({
    Client: InertClient,
    max: 1,
    idleTimeoutMillis: 0,
    password: "private-inert-password",
    database: "private-inert-database",
  })
  return { pool, connections }
}

test("actual pool distinguishes physical connection from warm checkout without altering release", async () => {
  const { pool, connections } = fixture()
  const traces: PerformanceTrace[] = []
  try {
    await withPerformanceTrace(
      "request",
      async () => {
        const pending = pool.connect()
        expect(connections).toHaveLength(1)
        expect(pool.totalCount).toBe(1)
        connections[0]?.()
        const client = await pending
        expect(client).toBeInstanceOf(pg.Client)
        client.release()
        expect(pool.idleCount).toBe(1)
      },
      (trace) => traces.push(trace),
    )
    await withPerformanceTrace(
      "request",
      async () => {
        const client = await pool.connect()
        expect(connections).toHaveLength(1)
        client.release()
        expect(() => client.release()).toThrow("already been released")
      },
      (trace) => traces.push(trace),
    )
    expect(traces[0]?.phases).toMatchObject({
      pool: { count: 1, failures: 0 },
      connection: { count: 1, failures: 0 },
    })
    expect(traces[1]?.phases).toMatchObject({ pool: { count: 1 } })
    expect(traces[1]?.phases).not.toHaveProperty("connection")
    expect(traces[1]?.phases).not.toHaveProperty("poolBusy")
    const cold = traces[0]
    if (!cold) throw new Error("Missing cold checkout trace")
    expect(formatPerformanceServerTiming(cold)).toContain("ew_connection;")
    expect(JSON.stringify(traces)).not.toContain("private-inert")
  } finally {
    await pool.end()
  }
  expect(pool.ended).toBe(true)
})

test("actual saturated pool preserves queued callback scope and release identity", async () => {
  const { pool, connections } = fixture()
  const traces: PerformanceTrace[] = []
  try {
    const opening = pool.connect()
    connections[0]?.()
    const held = await opening
    const waiting = withPerformanceTrace(
      "request",
      () =>
        new Promise<void>((resolve, reject) => {
          pool.connect((error, client, release) => {
            if (error || !client) return reject(error)
            expect(release).toBe(client.release)
            traceSynchronousPhase("sql", () => 1)
            release()
            resolve()
          })
        }),
      (trace) => traces.push(trace),
    )
    expect(pool.waitingCount).toBe(1)
    await withPerformanceTrace(
      "job",
      async () => held.release(),
      (trace) => traces.push(trace),
    )
    await waiting
    expect(connections).toHaveLength(1)
    const request = traces.find((trace) => trace.kind === "request")
    const releasing = traces.find((trace) => trace.kind === "job")
    expect(request?.phases).toMatchObject({
      pool: { count: 1 },
      poolBusy: { count: 1, failures: 0 },
      sql: { count: 1 },
    })
    expect(request?.phases).not.toHaveProperty("connection")
    expect(releasing?.phases).toEqual({})
    if (!request) throw new Error("Missing queued request trace")
    expect(formatPerformanceServerTiming(request)).toContain("ew_poolBusy;")
  } finally {
    await pool.end()
  }
})

test("connection failures and ended-pool rejection retain identity without exporting errors", async () => {
  const { pool, connections } = fixture()
  const error = new Error("private-inert-network-failure")
  let evidence: PerformanceTrace | undefined
  await expect(
    withPerformanceTrace(
      "request",
      async () => {
        const pending = pool.connect()
        connections[0]?.(error)
        await pending
      },
      (trace) => {
        evidence = trace
      },
    ),
  ).rejects.toBe(error)
  expect(evidence?.phases).toMatchObject({
    connection: { count: 1, failures: 1 },
    pool: { count: 1, failures: 1 },
  })
  expect(JSON.stringify(evidence)).not.toContain("private-inert")
  await pool.end()
  await expect(pool.connect()).rejects.toThrow("after calling end")
  expect(connections).toHaveLength(1)
})
