import { expect, test } from "bun:test"
import type { OfflineReplayBatch } from "@/store/offlineCommandStore"
import {
  type ReplayObservation,
  type ReplayPorts,
  createReplayCoordinator,
} from "./offline-replay-coordinator"

type Result = { clientCommandId: string; status: string }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

const batchFor = (owner: string, ids = ["command-0001"]): OfflineReplayBatch =>
  ({
    scope: { actorUserId: owner, businessId: "business", storeId: "store" },
    deviceId: `device-${owner}`,
    commands: ids.map((clientCommandId) => ({
      clientCommandId,
      createdAtClient: new Date(0),
      dependencyClientIds: [],
      eventVersion: 1,
      payload: {},
    })),
  }) as unknown as OfflineReplayBatch

/** Controllable ports recording every outward effect. */
function harness() {
  let lifetime: string | null = "A"
  const log: string[] = []
  const observations: ReplayObservation<Result>[] = []
  const observer = { throws: false, mutates: false }
  const register = { next: deferred<unknown>() }
  const replay = { next: deferred<Result[]>() }
  const refreshControl: {
    fail: boolean
    onRefresh?: (live: () => boolean) => void
  } = { fail: false }
  const ports: ReplayPorts<Result> = {
    lifetime: () => lifetime,
    prepare: () => (lifetime ? batchFor(lifetime) : null),
    register: (batch) => {
      log.push(`register:${batch.deviceId}`)
      return register.next.promise
    },
    replay: (batch) => {
      log.push(`replay:${batch.deviceId}`)
      return replay.next.promise
    },
    apply: (_results, batch) => {
      log.push(`apply:${batch.deviceId}`)
    },
    refresh: async (live) => {
      log.push("refresh")
      refreshControl.onRefresh?.(live)
      if (refreshControl.fail) throw Error("refresh failed")
    },
    observe: (observation) => {
      observations.push(observation)
      if (observer.mutates) Reflect.set(observation.outcome, "status", "failed")
      if (observer.throws) throw Error("Observer unavailable")
    },
  }
  return {
    log,
    observations,
    observer,
    coordinator: createReplayCoordinator(ports),
    setLifetime: (next: string | null) => {
      lifetime = next
    },
    register,
    replay,
    refreshControl,
  }
}

const flush = () => new Promise((done) => setTimeout(done, 0))
const ok: Result[] = [{ clientCommandId: "command-0001", status: "APPLIED" }]

test("registers, replays, applies and refreshes one captured batch", async () => {
  const h = harness()
  const run = h.coordinator.request({ registerFirst: true })
  await flush()
  h.register.next.resolve(undefined)
  await flush()
  h.replay.next.resolve(ok)
  expect(await run).toEqual({ status: "applied", refreshFailed: false })
  expect(h.log).toEqual([
    "register:device-A",
    "replay:device-A",
    "apply:device-A",
    "refresh",
  ])
})

test("a scope switch during registration never sends the old replay", async () => {
  const h = harness()
  const run = h.coordinator.request({ registerFirst: true })
  await flush()
  h.setLifetime("B")
  h.register.next.resolve(undefined)
  expect(await run).toEqual({ status: "retired" })
  expect(h.log).toEqual(["register:device-A"])
})

test("A → B → A during registration still retires the original run", async () => {
  // The lifetime key carries the data-cache generation, so returning to A is
  // a new lifetime ("A#2"), not the one that started the run.
  const h = harness()
  const run = h.coordinator.request({ registerFirst: true })
  await flush()
  h.setLifetime("B")
  h.setLifetime("A#2")
  h.register.next.resolve(undefined)
  expect(await run).toEqual({ status: "retired" })
  expect(h.log).toEqual(["register:device-A"])
})

test("a switch during replay applies and refreshes nothing", async () => {
  const h = harness()
  const run = h.coordinator.request({ registerFirst: false })
  await flush()
  h.setLifetime(null)
  h.replay.next.resolve(ok)
  expect(await run).toEqual({ status: "retired" })
  expect(h.log).toEqual(["replay:device-A"])
})

test("a request made while one runs waits and settles with its own outcome", async () => {
  const h = harness()
  const first = h.coordinator.request({ registerFirst: false })
  await flush()
  // B's request arrives while A's replay is in flight (same command id).
  h.setLifetime("B")
  const second = h.coordinator.request({ registerFirst: true })
  const firstReplay = h.replay
  h.replay = { next: deferred<Result[]>() }
  firstReplay.next.resolve(ok)
  // A's lifetime ended mid-replay, so A applies nothing.
  expect(await first).toEqual({ status: "retired" })
  await flush()
  h.register.next.resolve(undefined)
  await flush()
  h.replay.next.resolve(ok)
  expect(await second).toEqual({ status: "applied", refreshFailed: false })
  expect(h.log).toEqual([
    "replay:device-A",
    "register:device-B",
    "replay:device-B",
    "apply:device-B",
    "refresh",
  ])
  expect(h.coordinator.running).toBe(false)
})

test("a queued request whose owner changed before its turn is retired", async () => {
  const h = harness()
  const first = h.coordinator.request({ registerFirst: false })
  await flush()
  h.setLifetime("B")
  const queuedB = h.coordinator.request({ registerFirst: true })
  // C signs in before A settles; C never asked to sync.
  h.setLifetime("C")
  h.replay.next.resolve(ok)
  expect(await first).toEqual({ status: "retired" })
  expect(await queuedB).toEqual({ status: "retired" })
  expect(h.log).toEqual(["replay:device-A"])
})

test("a newer queued request supersedes an older one", async () => {
  const h = harness()
  const first = h.coordinator.request({ registerFirst: false })
  await flush()
  const older = h.coordinator.request({ registerFirst: false })
  const newer = h.coordinator.request({ registerFirst: false })
  expect(await older).toEqual({ status: "superseded" })
  const firstReplay = h.replay
  h.replay = { next: deferred<Result[]>() }
  firstReplay.next.resolve(ok)
  expect(await first).toEqual({ status: "applied", refreshFailed: false })
  await flush()
  h.replay.next.resolve(ok)
  expect(await newer).toEqual({ status: "applied", refreshFailed: false })
})

test("a refresh failure after applying is a warning, not a failure", async () => {
  const h = harness()
  h.refreshControl.fail = true
  const run = h.coordinator.request({ registerFirst: false })
  await flush()
  h.replay.next.resolve(ok)
  expect(await run).toEqual({ status: "applied", refreshFailed: true })
  expect(h.log).toEqual(["replay:device-A", "apply:device-A", "refresh"])
})

test("refresh sees the initiating lifetime end", async () => {
  const h = harness()
  const seen: boolean[] = []
  h.refreshControl.onRefresh = (live) => {
    seen.push(live())
    h.setLifetime("B")
    seen.push(live())
  }
  const run = h.coordinator.request({ registerFirst: false })
  await flush()
  h.replay.next.resolve(ok)
  await run
  expect(seen).toEqual([true, false])
})

test("a refused replay keeps the queue untouched and reports failure", async () => {
  const h = harness()
  const run = h.coordinator.request({ registerFirst: false })
  await flush()
  const denied = Object.assign(Error("Forbidden"), {
    data: { code: "FORBIDDEN" },
  })
  h.replay.next.reject(denied)
  expect(await run).toEqual({ status: "failed", error: denied })
  expect(h.log).toEqual(["replay:device-A"])
})

test("only the selected commands are sent; empty selections send nothing", async () => {
  const h = harness()
  expect(
    await h.coordinator.request({ registerFirst: false, include: () => false }),
  ).toEqual({ status: "empty" })
  h.setLifetime(null)
  expect(await h.coordinator.request({ registerFirst: false })).toEqual({
    status: "ineligible",
  })
  expect(h.log).toEqual([])
})

test("exclusive tasks wait for a running replay and keep their own outcome", async () => {
  const h = harness()
  const running = h.coordinator.request({ registerFirst: false })
  await flush()
  const order: string[] = []
  const task = h.coordinator.exclusive(
    "A",
    async () => {
      order.push("task")
      return "done"
    },
    { retired: "retired", superseded: "superseded" },
  )
  expect(order).toEqual([])
  h.replay.next.resolve(ok)
  await running
  expect(await task).toBe("done")
  expect(order).toEqual(["task"])
})

test("an exclusive task from an ended lifetime never runs", async () => {
  const h = harness()
  const running = h.coordinator.request({ registerFirst: false })
  await flush()
  let ran = false
  const task = h.coordinator.exclusive(
    "A",
    async () => {
      ran = true
      return "done"
    },
    { retired: "retired", superseded: "superseded" },
  )
  h.setLifetime("B")
  h.replay.next.resolve(ok)
  await running
  expect(await task).toBe("retired")
  expect(ran).toBe(false)
})

test("a newer waiting task supersedes an older one; replays keep their slot", async () => {
  const h = harness()
  const running = h.coordinator.request({ registerFirst: false })
  await flush()
  const opts = { retired: "retired", superseded: "superseded" }
  const older = h.coordinator.exclusive("A", async () => "older", opts)
  const newer = h.coordinator.exclusive("A", async () => "newer", opts)
  expect(await older).toBe("superseded")
  h.replay.next.resolve(ok)
  await running
  expect(await newer).toBe("newer")
})

test("observes the actual captured replay once with its result and elapsed duration", async () => {
  const h = harness()
  const run = h.coordinator.request({ registerFirst: false })
  await flush()
  h.replay.next.resolve(ok)
  await run
  expect(h.observations).toHaveLength(1)
  expect(h.observations[0]?.batch.commands).toHaveLength(1)
  expect(h.observations[0]?.results).toBe(ok)
  expect(h.observations[0]?.outcome).toEqual({
    status: "applied",
    refreshFailed: false,
  })
  expect(Number.isFinite(h.observations[0]?.durationMs)).toBe(true)
  expect(h.observations[0]?.durationMs).toBeGreaterThanOrEqual(0)
})

test("observer failure cannot change a committed outcome or enqueue another replay", async () => {
  const h = harness()
  h.observer.throws = true
  const run = h.coordinator.request({ registerFirst: false })
  await flush()
  h.replay.next.resolve(ok)
  expect(await run).toEqual({ status: "applied", refreshFailed: false })
  expect(h.observations).toHaveLength(1)
  expect(h.log).toEqual(["replay:device-A", "apply:device-A", "refresh"])
  expect(h.coordinator.running).toBe(false)
})

test("reports a refresh warning as an applied observation", async () => {
  const h = harness()
  h.refreshControl.fail = true
  const run = h.coordinator.request({ registerFirst: false })
  await flush()
  h.replay.next.resolve(ok)
  await run
  expect(h.observations[0]?.outcome).toEqual({
    status: "applied",
    refreshFailed: true,
  })
})

test("an observer cannot rewrite the operation outcome", async () => {
  const h = harness()
  h.observer.mutates = true
  const run = h.coordinator.request({ registerFirst: false })
  await flush()
  h.replay.next.resolve(ok)
  expect(await run).toEqual({ status: "applied", refreshFailed: false })
  expect(Object.isFrozen(h.observations[0]?.outcome)).toBe(true)
})

test("no observation escapes after retirement during replay or refresh", async () => {
  for (const during of ["replay", "refresh"]) {
    const h = harness()
    const run = h.coordinator.request({ registerFirst: false })
    await flush()
    if (during === "replay") h.setLifetime("B")
    else h.refreshControl.onRefresh = () => h.setLifetime("B")
    h.replay.next.resolve(ok)
    await run
    expect(h.observations).toHaveLength(0)
  }
})

test("empty and ineligible requests do not produce observations", async () => {
  const h = harness()
  await h.coordinator.request({ registerFirst: false, include: () => false })
  h.setLifetime(null)
  await h.coordinator.request({ registerFirst: false })
  expect(h.observations).toHaveLength(0)
})

test("a refused transport is observed once without changing its failure", async () => {
  const h = harness()
  const run = h.coordinator.request({ registerFirst: false })
  await flush()
  const failure = Error("Transport unavailable")
  h.replay.next.reject(failure)
  expect(await run).toEqual({ status: "failed", error: failure })
  expect(h.observations).toHaveLength(1)
  expect(h.observations[0]?.results).toBeUndefined()
})

test("only executed jobs are observed when a queued request is superseded", async () => {
  const h = harness()
  const first = h.coordinator.request({ registerFirst: false })
  await flush()
  const superseded = h.coordinator.request({ registerFirst: false })
  const latest = h.coordinator.request({ registerFirst: false })
  expect(await superseded).toEqual({ status: "superseded" })
  const initial = h.replay.next
  h.replay.next = deferred<Result[]>()
  initial.resolve(ok)
  await first
  await flush()
  h.replay.next.resolve(ok)
  await latest
  expect(h.observations).toHaveLength(2)
})
