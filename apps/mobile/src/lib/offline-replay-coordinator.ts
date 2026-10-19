import type { OfflineCommandScope } from "@/lib/offline-command-scope"
import type { OfflineReplayBatch } from "@/store/offlineCommandStore"
import { replayableBatch } from "./offline-replay-client"

/**
 * Ports to the current session, store and API. `lifetime` returns a key for
 * the exact actor/business/Store/role/access/data-cache generation that may
 * replay right now (null when none may); any change retires earlier runs.
 * `refresh` receives `live` and must check it before each dispatch group and
 * after each await.
 */
export type ReplayPorts<Result> = {
  lifetime: () => string | null
  /** Capture once for this request (a recovery job names its partition). */
  prepare: (request: ReplayRequest) => OfflineReplayBatch | null
  register: (batch: OfflineReplayBatch) => Promise<unknown>
  replay: (batch: OfflineReplayBatch) => Promise<Result[]>
  apply: (results: Result[], batch: OfflineReplayBatch) => void
  refresh: (live: () => boolean) => Promise<void>
  /** Local observation only; exceptions never change queue or write outcomes. */
  observe?: (observation: ReplayObservation<Result>) => void
}

export type ReplayObservation<Result> = {
  batch: OfflineReplayBatch
  outcome: Readonly<ReplayOutcome>
  results: readonly Result[] | undefined
  durationMs: number
}

export type ReplayRequest = {
  /** Register the partition device before replaying (offline policy on). */
  registerFirst: boolean
  /** Which captured commands this sync sends; others stay untouched. */
  include?: (clientCommandId: string) => boolean
  /** Recovery only: the explicitly chosen original partition. */
  scope?: OfflineCommandScope
}

export type ReplayOutcome =
  /** Results applied to the local queue; refreshing views may have failed. */
  | { status: "applied"; refreshFailed: boolean }
  | { status: "empty" }
  | { status: "ineligible" }
  /** Scope or lifetime changed: nothing further was sent or applied. */
  | { status: "retired" }
  /** A newer request from the same lifetime replaced this queued one. */
  | { status: "superseded" }
  /** Refused or failed before applying: the queue is kept exactly as it was. */
  | { status: "failed"; error: unknown }

type Job = ReplayRequest & {
  lifetime: string | null
  settle: (outcome: ReplayOutcome) => void
}

/** Another single-flight operation (e.g. a management decision). */
type TaskJob = {
  lifetime: string | null
  run: (live: () => boolean) => Promise<void>
  retire: () => void
  supersede: () => void
}

/**
 * One replay at a time per coordinator. Every request is bound to the
 * lifetime that made it and resolves with its own outcome. A request made
 * while a run is in flight waits (a newer one replaces it); when its turn
 * comes it is retired if that lifetime is no longer current. Each run
 * captures its batch once and rechecks its lifetime after every await.
 */
export function createReplayCoordinator<Result>(ports: ReplayPorts<Result>) {
  let running = false
  let waiting: Job | null = null
  let waitingTask: TaskJob | null = null

  async function run(job: Job): Promise<ReplayOutcome> {
    const lifetime = job.lifetime
    if (!lifetime) return { status: "ineligible" }
    const live = () => ports.lifetime() === lifetime
    if (!live()) return { status: "retired" }
    const batch = replayableBatch(ports.prepare(job), job.include)
    if (!batch) return { status: "empty" }
    const started = performance.now()
    let results: Result[] | undefined
    const settle = (outcome: ReplayOutcome): ReplayOutcome => {
      if (live())
        try {
          ports.observe?.({
            batch,
            outcome: Object.freeze({ ...outcome }),
            results,
            durationMs: performance.now() - started,
          })
        } catch {
          // An observer cannot fail, retry or change this operation.
        }
      return outcome
    }
    try {
      if (job.registerFirst) {
        await ports.register(batch)
        if (!live()) return { status: "retired" }
      }
      results = await ports.replay(batch)
      if (!live()) return { status: "retired" }
      ports.apply(results, batch)
    } catch (error) {
      return settle(
        live() ? { status: "failed", error } : { status: "retired" },
      )
    }
    // Committed locally from here: a refresh problem is only a warning.
    try {
      await ports.refresh(live)
      return settle({ status: "applied", refreshFailed: false })
    } catch {
      return settle({ status: "applied", refreshFailed: true })
    }
  }

  async function runTask(task: TaskJob) {
    const lifetime = task.lifetime
    const live = () => lifetime !== null && ports.lifetime() === lifetime
    if (!live()) return task.retire()
    await task.run(live)
  }

  // Replays and tasks share one flight; each kind keeps its own latest waiter.
  async function drain(first: Job | TaskJob) {
    running = true
    try {
      let job: Job | TaskJob | null = first
      while (job) {
        if ("run" in job) await runTask(job)
        else job.settle(await run(job))
        job = waiting ?? waitingTask
        if (job === waiting) waiting = null
        else waitingTask = null
      }
    } finally {
      running = false
    }
  }

  return {
    get running() {
      return running
    },
    /** Resolves with this request's own outcome once it has run (or not). */
    request(request: ReplayRequest): Promise<ReplayOutcome> {
      return new Promise<ReplayOutcome>((settle) => {
        const job: Job = { ...request, lifetime: ports.lifetime(), settle }
        if (running) {
          waiting?.settle({ status: "superseded" })
          waiting = job
          return
        }
        void drain(job)
      })
    },
    /**
     * Run `operation` in the shared single flight, bound to `lifetime` (the
     * caller's originating lifetime). It never starts if that lifetime is not
     * current when its turn comes; a newer waiting task supersedes an older.
     */
    exclusive<T>(
      lifetime: string | null,
      operation: (live: () => boolean) => Promise<T>,
      outcomes: { retired: T; superseded: T },
    ): Promise<T> {
      return new Promise<T>((settle) => {
        const task: TaskJob = {
          lifetime,
          run: async (live) => settle(await operation(live)),
          retire: () => settle(outcomes.retired),
          supersede: () => settle(outcomes.superseded),
        }
        if (running) {
          waitingTask?.supersede()
          waitingTask = task
          return
        }
        void drain(task)
      })
    },
  }
}
