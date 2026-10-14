import { expect, test } from "bun:test"
import {
  type AuditClientLike,
  type ChildLike,
  NestedTransactionRefused,
  SectionUnrun,
  assertEffectiveTarget,
  assertSectionFits,
  auditVerdict,
  authorizedHost,
  childEnvironment,
  createRunControl,
  createSavepointDb,
  createSectionSequencer,
  injectReceiptFailure,
  installBackstop,
  orchestrateRun,
  parsePlan,
  parseRunnerArgs,
  planHeader,
  plannedIdsLine,
  runAudit,
  runSectionsInSequence,
  sectionOutcome,
  withDeadline,
  withRolloutOverride,
} from "./general-stock-custody-runner-tools"

// Offline only: an in-memory "transaction" that records the SQL it is sent
// and a toy table, so savepoint semantics are observable without a database.
function fakeTransaction() {
  const sql: string[] = []
  let rows: string[] = []
  const saved: string[][] = []
  const tx = {
    async $executeRawUnsafe(statement: string) {
      sql.push(statement)
      if (statement.startsWith("SAVEPOINT")) saved.push([...rows])
      if (statement.startsWith("ROLLBACK TO SAVEPOINT"))
        rows = saved.at(-1) ?? []
      if (statement.startsWith("RELEASE SAVEPOINT")) saved.pop()
      return 0
    },
    write(value: string) {
      rows.push(value)
    },
    assistantActionProposal: {
      async update(args: { data?: { status?: string } }) {
        rows.push(`proposal:${args.data?.status}`)
        return args
      },
    },
  }
  return { tx, sql, rows: () => rows }
}
type FakeDb = ReturnType<typeof fakeTransaction>["tx"] & {
  $transaction: (fn: (db: FakeDb) => Promise<unknown>) => Promise<unknown>
}

test("a successful callback keeps its writes and releases its savepoint", async () => {
  const { tx, sql, rows } = fakeTransaction()
  const db = createSavepointDb(tx) as unknown as FakeDb
  await db.$transaction(async (inner) => inner.write("moved"))
  expect(rows()).toEqual(["moved"])
  expect(sql).toEqual([
    "SAVEPOINT custody_sp_1",
    "RELEASE SAVEPOINT custody_sp_1",
  ])
})

test("a failing callback rolls back only its own writes", async () => {
  const { tx, sql, rows } = fakeTransaction()
  const db = createSavepointDb(tx) as unknown as FakeDb
  await db.$transaction(async (inner) => inner.write("kept"))
  await expect(
    db.$transaction(async (inner) => {
      inner.write("movement")
      throw Error("boom")
    }),
  ).rejects.toThrow("boom")
  expect(rows()).toEqual(["kept"])
  expect(sql.slice(2)).toEqual([
    "SAVEPOINT custody_sp_2",
    "ROLLBACK TO SAVEPOINT custody_sp_2",
    "RELEASE SAVEPOINT custody_sp_2",
  ])
})

test("an injected receipt failure rolls back the movement and the section continues", async () => {
  const { tx, rows } = fakeTransaction()
  const db = createSavepointDb(tx) as unknown as FakeDb
  const failing = injectReceiptFailure(db) as unknown as FakeDb
  await expect(
    failing.$transaction(async (inner) => {
      inner.write("movement")
      await inner.assistantActionProposal.update({
        data: { status: "COMPLETED" },
      })
    }),
  ).rejects.toThrow("Injected receipt failure")
  expect(rows()).toEqual([])
  // Other updates pass through, and the original state is usable again.
  await failing.$transaction(async (inner) => {
    await inner.assistantActionProposal.update({ data: { status: "PENDING" } })
  })
  await db.$transaction(async (inner) => {
    inner.write("movement")
    await inner.assistantActionProposal.update({
      data: { status: "COMPLETED" },
    })
  })
  expect(rows()).toEqual(["proposal:PENDING", "movement", "proposal:COMPLETED"])
})

test("concurrent callbacks are serialized on one savepoint stack", async () => {
  const { tx, sql } = fakeTransaction()
  const db = createSavepointDb(tx) as unknown as FakeDb
  const order: string[] = []
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const first = db.$transaction(async () => {
    order.push("first:start")
    await gate
    order.push("first:end")
  })
  const second = db.$transaction(async () => {
    order.push("second:start")
  })
  await new Promise((resolve) => setTimeout(resolve, 10))
  expect(order).toEqual(["first:start"])
  release()
  await Promise.all([first, second])
  expect(order).toEqual(["first:start", "first:end", "second:start"])
  expect(sql).toEqual([
    "SAVEPOINT custody_sp_1",
    "RELEASE SAVEPOINT custody_sp_1",
    "SAVEPOINT custody_sp_2",
    "RELEASE SAVEPOINT custody_sp_2",
  ])
})

test("a nested transaction is refused without deadlock, and the stack recovers", async () => {
  const { tx, rows } = fakeTransaction()
  const db = createSavepointDb(tx) as unknown as FakeDb
  await expect(
    db.$transaction(async (inner) => {
      inner.write("outer")
      await inner.$transaction(async () => {})
    }),
  ).rejects.toBeInstanceOf(NestedTransactionRefused)
  expect(rows()).toEqual([])
  await db.$transaction(async (inner) => inner.write("after"))
  expect(rows()).toEqual(["after"])
  await expect(
    (
      db as unknown as { $transaction: (x: unknown) => Promise<unknown> }
    ).$transaction([]),
  ).rejects.toThrow("Batch transactions are not supported")
})

test("the rollout override restores the exact prior value on every exit", async () => {
  const entry = { id: "inventory.custody.move", rollout: "planned" }
  expect(
    await withRolloutOverride(entry, "source", async () => entry.rollout),
  ).toBe("source")
  expect(entry.rollout).toBe("planned")
  await expect(
    withRolloutOverride(entry, "source", async () => {
      throw Error("section failed")
    }),
  ).rejects.toThrow("section failed")
  expect(entry.rollout).toBe("planned")
  const absent: { rollout?: string } = {}
  await withRolloutOverride(absent, "source", async () => {})
  expect(absent.rollout).toBeUndefined()
})

test("a deadline cancels the work and reports DEADLINE", async () => {
  let cancelled = false
  await expect(
    withDeadline(
      10,
      () => new Promise(() => {}),
      () => {
        cancelled = true
      },
    ),
  ).rejects.toMatchObject({ code: "DEADLINE" })
  expect(cancelled).toBe(true)
  expect(
    await withDeadline(
      1_000,
      async () => 7,
      () => {},
    ),
  ).toBe(7)
})

test("the budget gate refuses before any transaction; outcomes never overstate", () => {
  expect(
    assertSectionFits({ section: "E", statements: 60, medianMs: 207 }),
  ).toBe(12_420)
  expect(() =>
    assertSectionFits({ section: "C", statements: 140, medianMs: 207 }),
  ).toThrow(SectionUnrun)
  expect(() =>
    assertSectionFits({ section: "A", statements: undefined, medianMs: 1 }),
  ).toThrow("no reviewed statement budget")
  expect(() =>
    assertSectionFits({
      section: "A",
      statements: 10,
      medianMs: Number.POSITIVE_INFINITY,
    }),
  ).toThrow(SectionUnrun)
  // Completed only with verified rollback at the rollback stage.
  expect(
    sectionOutcome({
      section: "E",
      stage: "rollback",
      statements: 58,
      rolledBack: true,
    }),
  ).toMatchObject({ outcome: "completed", statementsComplete: true })
  expect(
    sectionOutcome({
      section: "E",
      stage: "setup",
      statements: 1,
      rolledBack: false,
    }),
  ).toMatchObject({
    outcome: "failed",
    statementsComplete: false,
    errorCode: "NOT_ROLLED_BACK",
  })
  expect(
    sectionOutcome({
      section: "C",
      stage: "assertions",
      statements: 91,
      rolledBack: false,
      error: Object.assign(Error("x"), { code: "P2028" }),
    }),
  ).toMatchObject({
    outcome: "failed",
    statementsComplete: false,
    errorCode: "P2028",
  })
  expect(
    sectionOutcome({
      section: "C",
      stage: "gate",
      statements: 0,
      rolledBack: false,
      error: new SectionUnrun("Unrun"),
    }),
  ).toMatchObject({ outcome: "unrun", errorCode: "UNRUN" })
  expect(
    sectionOutcome({
      section: "C",
      stage: "setup",
      statements: 3,
      rolledBack: false,
      error: Error("secret value in message"),
    }).errorCode,
  ).toBe("ERROR")
})

test("the first failure stops every later section", () => {
  const sequencer = createSectionSequencer()
  expect(sequencer.next("E")).toEqual({ run: true })
  sequencer.fail("E")
  expect(sequencer.next("A")).toMatchObject({ run: false })
  sequencer.fail("A")
  expect(sequencer.stoppedBy).toBe("E")
})

test("a deadline still rejects when cancellation itself throws", async () => {
  await expect(
    withDeadline(
      5,
      () => new Promise(() => {}),
      () => {
        throw Error("cleanup failed")
      },
    ),
  ).rejects.toMatchObject({ code: "DEADLINE" })
})

test("the audit fails on timeout, error or leftover rows and never overclaims", () => {
  expect(auditVerdict({ kind: "timeout" }).pass).toBe(false)
  expect(auditVerdict({ kind: "error", code: "ECONNRESET" }).pass).toBe(false)
  expect(
    auditVerdict({ kind: "counts", counts: { tenants: 0, custody: 1 } }),
  ).toEqual({ pass: false, detail: "Fixture rows remain: custody=1." })
  expect(
    auditVerdict({ kind: "counts", counts: { tenants: 0, custody: 0 } }),
  ).toEqual({
    pass: true,
    detail: "Planned fixture rows are absent. Unrelated rows are not checked.",
  })
  expect(auditVerdict({ kind: "nothing_planned" }).pass).toBe(true)
  expect(
    JSON.parse(
      plannedIdsLine({
        section: "E",
        tenantId: "t",
        userId: "u",
        storeId: "s",
      }),
    ),
  ).toEqual({
    planned: { section: "E", tenantId: "t", userId: "u", storeId: "s" },
  })
})

// --- Launcher logic: strict inputs, target, plan and lifecycle (offline) ---

test("budgets and sections are parsed strictly", () => {
  expect(
    parseRunnerArgs(["--run", "--sections", "E", "--budgets", "E=100"]),
  ).toEqual({
    mode: "run",
    sections: ["E"],
    budgets: { E: 100 },
    environmentRoot: undefined,
  })
  for (const args of [
    [],
    ["--run"],
    ["--run", "--sections", "E"],
    ["--run", "--sections", "E", "--budgets", "E=100,E=1"],
    ["--run", "--sections", "E", "--budgets", "E=100=1"],
    ["--run", "--sections", "E", "--budgets", "E=100,A=10"],
    ["--run", "--sections", "E", "--budgets", "Z=10"],
    ["--run", "--sections", "E", "--budgets", "E=010"],
    ["--run", "--sections", "E", "--budgets", "E=1.5"],
    ["--run", "--sections", "E", "--budgets", "E=501"],
    ["--run", "--sections", "E,E", "--budgets", "E=100"],
    ["--run", "--sections", "", "--budgets", "E=100"],
    ["--run", "--sections", "E", "--budgets", "E=100", "--sections", "A"],
    [
      "--run",
      "--sections",
      "E",
      "--budgets",
      "E=100",
      "--environment-root",
      "x",
    ],
  ])
    expect(() => parseRunnerArgs(args)).toThrow()
})

test("the child refuses any target the driver would route elsewhere", async () => {
  const { default: pg } = await import("pg")
  const good = `postgresql://synthetic:synthetic@${authorizedHost}:5432/ewatrade_qa_v1?sslmode=require`
  const effective = (url: string) => {
    const client = new pg.Client({ connectionString: url })
    return { host: client.host, port: client.port, database: client.database }
  }
  expect(() => assertEffectiveTarget(good, effective(good))).not.toThrow()
  for (const url of [
    `${good}&host=ep-synthetic-prod.us-east-1.aws.neon.tech`,
    `${good}&port=6543`,
    `${good}&dbname=other`,
    good.replace(":5432", ":6543"),
    good.replace("/ewatrade_qa_v1", "/other"),
    good.replace("postgresql:", "mysql:"),
  ])
    expect(() => assertEffectiveTarget(url, effective(url))).toThrow()
})

test("the child environment drops every ambient PG setting", () => {
  const env = childEnvironment(
    {
      PATH: "/bin",
      PGPORT: "6000",
      PGHOST: "elsewhere",
      PGSSLMODE: "disable",
      PGPASSFILE: "/tmp/p",
      PGCONNECT_TIMEOUT: "1",
      DATABASE_URL: "x",
    },
    {
      url: "pinned",
      sections: ["E"],
      budgets: { E: 100 },
      planFile: "/tmp/plan",
      marker: "m",
      signingKey: "k".repeat(64),
    },
  )
  expect(Object.keys(env).filter((key) => key.startsWith("PG"))).toEqual([])
  expect("DATABASE_URL" in env).toBe(false)
  expect(env).toMatchObject({
    PATH: "/bin",
    EWATRADE_DATABASE_URL: "pinned",
    QA_STOCK_CUSTODY_RUN: "m",
    QA_STOCK_CUSTODY_BUDGETS: '{"E":100}',
  })
})

const planned = {
  section: "E",
  tenantId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  storeId: "33333333-3333-4333-8333-333333333333",
}
test("the plan reader fails closed on missing, truncated or invalid evidence", () => {
  const header = planHeader("m")
  expect(parsePlan(header, "m")).toEqual([])
  expect(parsePlan(header + plannedIdsLine(planned), "m")).toEqual([planned])
  for (const [text, code] of [
    [null, "PLAN_MISSING"],
    ['{"planned":', "PLAN_TRUNCATED"],
    [`${header}{"planned":\n`, "PLAN_MALFORMED"],
    [planHeader("other"), "PLAN_HEADER"],
    [plannedIdsLine(planned), "PLAN_HEADER"],
    [
      header + plannedIdsLine({ ...planned, tenantId: "not-a-uuid" }),
      "PLAN_INVALID",
    ],
    [header + plannedIdsLine({ ...planned, section: "Z" }), "PLAN_INVALID"],
    [
      `${header}${JSON.stringify({ planned: { ...planned, extra: 1 } })}\n`,
      "PLAN_INVALID",
    ],
    [
      `${JSON.stringify({ plan: "g04-custody", marker: "m", extra: 1 })}\n`,
      "PLAN_HEADER",
    ],
    [`${header}${JSON.stringify({ planned, extra: 1 })}\n`, "PLAN_INVALID"],
  ] as const)
    expect(() => parsePlan(text, "m")).toThrow(code)
})

function fakeAudit(options: {
  counts?: number[]
  hangConnect?: boolean
  hangEnd?: boolean
  endRejects?: boolean
  destroyThrows?: boolean
}) {
  const calls = { created: 0, queries: 0, ends: 0, destroys: 0 }
  const make = (): AuditClientLike => {
    calls.created++
    const counts = [...(options.counts ?? [0, 0, 0, 0])]
    return {
      connect: () =>
        options.hangConnect ? new Promise(() => {}) : Promise.resolve(),
      query: async () => {
        calls.queries++
        return { rows: [{ n: counts.shift() }] }
      },
      end: () => {
        calls.ends++
        if (options.endRejects) return Promise.reject(Error("end failed"))
        return options.hangEnd ? new Promise(() => {}) : Promise.resolve()
      },
      destroy: () => {
        calls.destroys++
        if (options.destroyThrows) throw Error("destroy failed")
      },
    }
  }
  return { make, calls }
}

test("the audit is bounded, including a hanging end(), and never overclaims", async () => {
  const clean = fakeAudit({})
  expect(await runAudit(clean.make, [planned], 2_000)).toMatchObject({
    pass: true,
    statements: 4,
    cleanup: "closed",
  })
  const leftover = fakeAudit({ counts: [0, 0, 0, 2] })
  expect((await runAudit(leftover.make, [planned], 2_000)).pass).toBe(false)
  const hangingEnd = fakeAudit({ hangEnd: true })
  const started = Date.now()
  const ended = await runAudit(hangingEnd.make, [planned], 1_200)
  expect(Date.now() - started).toBeLessThan(1_500)
  expect(ended).toMatchObject({ pass: true, cleanup: "forced" })
  expect(hangingEnd.calls.destroys).toBeGreaterThan(0)
  const hangingConnect = fakeAudit({ hangConnect: true, hangEnd: true })
  const stuck = await runAudit(hangingConnect.make, [planned], 1_200)
  expect(stuck).toMatchObject({ pass: false })
  expect(stuck.detail).toContain("timed out")
  const none = fakeAudit({})
  expect((await runAudit(none.make, [], 1_000)).pass).toBe(true)
  expect(none.calls.created).toBe(0)
})

function fakeChild(behaviour: "exit0" | "exit1" | "stuck" | "exitOnKill") {
  const signals: string[] = []
  let listener:
    | ((result: { code: number | null; signal: string | null }) => void)
    | undefined
  const child: ChildLike = {
    kill(signal) {
      signals.push(signal)
      if (behaviour === "exitOnKill" && signal === "SIGKILL")
        listener?.({ code: null, signal })
    },
    onExit(callback) {
      listener = callback
      if (behaviour === "exit0" || behaviour === "exit1")
        setTimeout(
          () => callback({ code: behaviour === "exit0" ? 0 : 1, signal: null }),
          5,
        )
    },
  }
  return { child, signals }
}
const scaled = { totalMs: 3_000, childMs: 200, cancelMs: 3_200, auditMs: 1_500 }

test("lifecycle: a clean child and empty plan pass; a failed child fails", async () => {
  const ok = await orchestrateRun({
    startChild: () => fakeChild("exit0").child,
    readPlanFile: () => planHeader("m") + plannedIdsLine(planned),
    makeAuditClient: fakeAudit({}).make,
    marker: "m",
    deadlines: scaled,
  })
  expect(ok).toMatchObject({ passed: true, reason: "PASSED" })
  const failed = await orchestrateRun({
    startChild: () => fakeChild("exit1").child,
    readPlanFile: () => planHeader("m"),
    makeAuditClient: fakeAudit({}).make,
    marker: "m",
    deadlines: scaled,
  })
  expect(failed.passed).toBe(false)
})

test("lifecycle: a stuck child never gets an absence claim, and nothing is audited", async () => {
  const audit = fakeAudit({})
  const { child, signals } = fakeChild("stuck")
  const result = await orchestrateRun({
    startChild: () => child,
    readPlanFile: () => planHeader("m") + plannedIdsLine(planned),
    makeAuditClient: audit.make,
    marker: "m",
    deadlines: { ...scaled, totalMs: 5_000, cancelMs: 3_100 },
  })
  expect(result).toMatchObject({ passed: false, reason: "CHILD_UNCONFIRMED" })
  expect(signals).toEqual(["SIGTERM", "SIGKILL"])
  expect(audit.calls.created).toBe(0)
}, 10_000)

test("lifecycle: a child killed after its deadline is audited but the run fails", async () => {
  const { child, signals } = fakeChild("exitOnKill")
  const result = await orchestrateRun({
    startChild: () => child,
    readPlanFile: () => planHeader("m") + plannedIdsLine(planned),
    makeAuditClient: fakeAudit({}).make,
    marker: "m",
    deadlines: { ...scaled, totalMs: 5_000, cancelMs: 3_100 },
  })
  expect(signals).toEqual(["SIGTERM", "SIGKILL"])
  expect(result).toMatchObject({ passed: false, reason: "CHILD_TIMEOUT" })
  expect(result.audit.pass).toBe(true)
}, 10_000)

test("lifecycle: unusable plan evidence fails closed", async () => {
  const result = await orchestrateRun({
    startChild: () => fakeChild("exit0").child,
    readPlanFile: () => '{"planned":',
    makeAuditClient: fakeAudit({}).make,
    marker: "m",
    deadlines: scaled,
  })
  expect(result).toMatchObject({ passed: false, reason: "PLAN_UNUSABLE" })
})

test("lifecycle: the whole-run ceiling holds even while cancellation waits", async () => {
  const started = Date.now()
  const result = await orchestrateRun({
    startChild: () => fakeChild("stuck").child,
    readPlanFile: () => planHeader("m"),
    makeAuditClient: fakeAudit({}).make,
    marker: "m",
    deadlines: { totalMs: 400, childMs: 100, cancelMs: 5_000, auditMs: 100 },
  })
  expect(Date.now() - started).toBeLessThan(1_000)
  expect(result).toMatchObject({ passed: false, reason: "PROCESS_DEADLINE" })
})

// --- Cancellation, cleanup status, backstop and sequencing (offline) ---

test("cleanup status is separate from the counts, and failed cleanup fails the run", async () => {
  const rejected = fakeAudit({ endRejects: true })
  expect(await runAudit(rejected.make, [planned], 2_000)).toMatchObject({
    pass: true,
    cleanup: "forced",
  })
  const broken = fakeAudit({ hangEnd: true, destroyThrows: true })
  const audit = await runAudit(broken.make, [planned], 1_200)
  expect(audit).toMatchObject({ pass: true, cleanup: "failed" })
  const run = await orchestrateRun({
    startChild: () => fakeChild("exit0").child,
    readPlanFile: () => planHeader("m") + plannedIdsLine(planned),
    makeAuditClient: fakeAudit({ hangEnd: true, destroyThrows: true }).make,
    marker: "m",
    deadlines: scaled,
  })
  expect(run).toMatchObject({ passed: false, reason: "AUDIT_CLEANUP_FAILED" })
})

test("the ceiling actively cancels: SIGKILL, and no audit after a late exit", async () => {
  const audit = fakeAudit({})
  let deliverLateExit: (() => void) | undefined
  const signals: string[] = []
  const child: ChildLike = {
    kill: (signal) => {
      signals.push(signal)
    },
    onExit: (listener) => {
      deliverLateExit = () => listener({ code: 0, signal: null })
    },
  }
  const control = createRunControl()
  const result = await orchestrateRun({
    startChild: () => child,
    readPlanFile: () => planHeader("m") + plannedIdsLine(planned),
    makeAuditClient: audit.make,
    marker: "m",
    deadlines: { totalMs: 30, childMs: 20, cancelMs: 5_000, auditMs: 100 },
    control,
  })
  expect(result).toMatchObject({ passed: false, reason: "PROCESS_DEADLINE" })
  expect(control.cancelled).toBe(true)
  expect(signals).toContain("SIGKILL")
  deliverLateExit?.()
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(audit.calls.created).toBe(0)
})

test("after cancellation no audit query starts, and the client is destroyed", async () => {
  const control = createRunControl()
  let release: () => void = () => {}
  const calls = { queries: 0, destroys: 0 }
  const client: AuditClientLike = {
    connect: () =>
      new Promise<void>((resolve) => {
        release = resolve
      }),
    query: async () => {
      calls.queries++
      return { rows: [{ n: 0 }] }
    },
    end: async () => {},
    destroy: () => {
      calls.destroys++
    },
  }
  const pending = runAudit(() => client, [planned], 2_000, control)
  await new Promise((resolve) => setTimeout(resolve, 10))
  control.cancel()
  release()
  const result = await pending
  expect(calls.queries).toBe(0)
  expect(calls.destroys).toBeGreaterThan(0)
  expect(result.pass).toBe(false)
  // A cancelled control refuses to start an audit at all.
  await expect(
    runAudit(fakeAudit({}).make, [planned], 1_000, control),
  ).rejects.toMatchObject({ code: "CANCELLED" })
})

test("the backstop uses the same cancellation at exactly the ceiling", () => {
  const control = createRunControl()
  const killed: string[] = []
  control.onCancel(() => killed.push("SIGKILL child"))
  let scheduled: { callback: () => void; ms: number } | undefined
  const exits: number[] = []
  const lines: string[] = []
  installBackstop({
    totalMs: 120_000,
    control,
    exit: (code) => exits.push(code),
    report: (line) => lines.push(line),
    setTimer: (callback, ms) => {
      scheduled = { callback, ms }
      return 0
    },
  })
  expect(scheduled?.ms).toBe(120_000)
  scheduled?.callback()
  expect(control.cancelled).toBe(true)
  expect(killed).toEqual(["SIGKILL child"])
  expect(exits).toEqual([1])
  expect(lines[0]).toContain("BACKSTOP_EXIT")
})

test("run control clears its timers and runs late cleanups at once", async () => {
  const control = createRunControl()
  let woke = false
  void control.sleep(20).then(() => {
    woke = true
  })
  control.cancel()
  await new Promise((resolve) => setTimeout(resolve, 40))
  expect(woke).toBe(false)
  let late = false
  control.onCancel(() => {
    late = true
  })
  expect(late).toBe(true)
  expect(() => control.assertLive()).toThrow("Run cancelled")
})

test("sequencing reports every later section UNRUN after a gate, setup or assertion failure", async () => {
  const outcome = (
    section: string,
    stage: string,
    rolledBack: boolean,
    error?: unknown,
  ) => sectionOutcome({ section, stage, statements: 5, rolledBack, error })
  for (const failing of [
    async (section: string) =>
      outcome(section, "gate", false, new SectionUnrun("over budget")),
    async (section: string) =>
      outcome(
        section,
        "setup",
        false,
        Object.assign(Error("x"), { code: "P2028" }),
      ),
    async () => {
      throw Error("assertion failed")
    },
  ]) {
    const reports: Array<{ section: { section: string; outcome: string } }> = []
    const ran: string[] = []
    await expect(
      runSectionsInSequence(
        ["E", "A", "C"],
        async (section) => {
          ran.push(section)
          return failing(section)
        },
        (value) => reports.push(value as never),
      ),
    ).rejects.toThrow("Section E did not complete")
    expect(ran).toEqual(["E"])
    expect(
      reports.map((row) => [row.section.section, row.section.outcome]),
    ).toEqual([
      ["E", reports[0]?.section.outcome ?? ""],
      ["A", "unrun"],
      ["C", "unrun"],
    ])
    expect(reports[0]?.section.outcome).not.toBe("completed")
  }
  const all = await runSectionsInSequence(
    ["E", "A"],
    async (section) => outcome(section, "rollback", true),
    () => {},
  )
  expect(all.map((row) => row.outcome)).toEqual(["completed", "completed"])
})

test("the audit's own deadline stops its work: nothing runs after a late connect or query", async () => {
  // A client whose connect and/or first query stay blocked until released.
  function blockingClient(block: "connect" | "first-query") {
    const calls = { queries: 0, destroys: 0 }
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const client: AuditClientLike = {
      connect: () => (block === "connect" ? gate : Promise.resolve()),
      query: async () => {
        calls.queries++
        if (block === "first-query" && calls.queries === 1) await gate
        return { rows: [{ n: 0 }] }
      },
      end: async () => {},
      destroy: () => {
        calls.destroys++
      },
    }
    return { client, calls, release: () => release() }
  }
  for (const block of ["connect", "first-query"] as const) {
    const fake = blockingClient(block)
    // A fresh control that is never cancelled: only the audit's own deadline.
    const result = await runAudit(
      () => fake.client,
      [planned],
      1_100,
      createRunControl(),
    )
    expect(result).toMatchObject({ pass: false, cleanup: "forced" })
    expect(result.detail).toContain("timed out")
    const before = fake.calls.queries
    expect(before).toBe(block === "connect" ? 0 : 1)
    fake.release()
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(fake.calls.queries).toBe(before)
    expect(fake.calls.destroys).toBeGreaterThan(0)
  }
})
