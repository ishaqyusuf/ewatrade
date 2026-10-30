// Local QA diagnostics only. Never retain URLs, headers, bodies or identifiers.
/** @typedef {{milliseconds: number, count: number}} Phase */
/** @typedef {{kind: string, labels: string[], started: number, phases: Record<string, Phase>, responseHeadersAt?: number, status?: number, finished?: number, failed?: boolean, cancelled?: boolean, responseBodyBytes?: number}} Entry */
/** @typedef {{completed: number, failed: number, cancelled: number, httpErrors: number, responseBodyBytes: number, byteMeasurements: number, requestWorkMilliseconds: number, serverPhases: Record<string, Phase>}} Group */
/** @typedef {{started: number, responseHeaders: number, finished: number, firstStartMs: number, lastStartMs: number, firstResponseHeadersMs: number | null, lastFinishMs: number | null}} Timeline */
const phases = new Set([
  "request",
  "responseSetup",
  "auth",
  "legal",
  "sessionProof",
  "qaProofFacts",
  "qaDomain",
  "scope",
  "legalReuse",
  "scopeReuse",
  "context",
  "pool",
  "connection",
  "poolBusy",
  "sql",
  "lockingSql",
  "transactionSql",
  "activityAdmission",
  "activityStores",
  "activityPageSql",
  "activityFilterSql",
  "activityList",
  "activityFilters",
  "serialization",
  "proposalReview",
  "proposalExecution",
  "fulfillmentLock",
  "fulfillmentReview",
  "fulfillmentEffects",
])

export function readPerformancePhases(header = "") {
  /** @type {Record<string, Phase>} */
  const result = {}
  for (const part of header.split(",")) {
    const match =
      /^\s*ew_(\w+);dur=(\d+(?:\.\d+)?)(?:;desc="(\d+) calls")?\s*$/.exec(part)
    if (!match || !phases.has(match[1])) continue
    const milliseconds = Number(match[2])
    const count = match[3] === undefined ? 1 : Number(match[3])
    if (
      !Number.isFinite(milliseconds) ||
      !Number.isSafeInteger(count) ||
      count < 1
    )
      continue
    result[match[1]] = { milliseconds, count }
  }
  return result
}

/**
 * Observes existing journeys; it never sends requests or waits for idle polling.
 * @param {import("playwright").Page} page
 * @param {string} origin
 */
export function observeWebPerformance(page, origin) {
  if (origin !== "https://ewatrade-dashboard.localhost")
    throw new Error("Request performance measurement is local-only.")
  /** @type {{started: number, entries: Entry[]} | undefined} */
  let window
  /** @type {WeakMap<import("playwright").Request, Entry>} */
  const requests = new WeakMap()
  /** @type {Set<Promise<void>>} */
  const pendingSizes = new Set()
  /** @param {import("playwright").Request} request */
  const onRequest = (request) => {
    if (!window) return
    const url = new URL(request.url())
    const type = request.resourceType()
    const headers = request.headers()
    const kind =
      url.origin === origin && url.pathname.startsWith("/api/")
        ? "api"
        : url.origin === origin && headers.rsc === "1"
          ? "route"
          : ["document", "script", "stylesheet"].includes(type)
            ? type
            : "other"
    // Classification is fixed; URLs, query input and headers are never retained.
    const labels = [kind]
    if (kind === "api") {
      if (
        request.method() === "GET" &&
        headers["trpc-accept"] === "application/jsonl"
      )
        labels.push("streamingApi")
      if (url.pathname.startsWith("/api/trpc/")) {
        const procedures = url.pathname.slice("/api/trpc/".length).split(",")
        if (procedures.includes("activity.listPage"))
          labels.push("activityList")
        if (procedures.includes("activity.filters"))
          labels.push("activityFilters")
        const reconciliation = procedures.includes(
          "inventory.reconciliationReport",
        )
        const balances = procedures.includes("inventory.balanceReport")
        if (reconciliation) labels.push("stockReconciliation")
        if (balances) labels.push("stockBalances")
        if (reconciliation && balances) labels.push("stockReportBatch")
      }
    }
    /** @type {Entry} */
    const entry = { kind, labels, started: performance.now(), phases: {} }
    requests.set(request, entry)
    window.entries.push(entry)
  }
  /** @param {import("playwright").Response} response */
  const onResponse = (response) => {
    const entry = requests.get(response.request())
    if (!entry) return
    entry.responseHeadersAt = performance.now()
    entry.status = response.status()
    if (entry.kind === "api")
      entry.phases = readPerformancePhases(response.headers()["server-timing"])
  }
  /** @param {import("playwright").Request} request @param {boolean} failed */
  const finish = (request, failed) => {
    const entry = requests.get(request)
    if (!entry) return
    entry.finished = performance.now()
    entry.failed = failed
    entry.cancelled =
      failed &&
      ["net::ERR_ABORTED", "NS_BINDING_ABORTED"].includes(
        request.failure()?.errorText ?? "",
      )
    // Browser-provided response-body byte counts; no response content is read.
    if (!failed) {
      const sizes = request
        .sizes()
        .then((value) => {
          if (
            Number.isSafeInteger(value.responseBodySize) &&
            value.responseBodySize >= 0
          )
            entry.responseBodyBytes = value.responseBodySize
        })
        .catch(() => {})
        .finally(() => pendingSizes.delete(sizes))
      pendingSizes.add(sizes)
    }
  }
  /** @param {import("playwright").Request} request */
  const onFinished = (request) => finish(request, false)
  /** @param {import("playwright").Request} request */
  const onFailed = (request) => finish(request, true)
  page.on("request", onRequest)
  page.on("response", onResponse)
  page.on("requestfinished", onFinished)
  page.on("requestfailed", onFailed)
  return {
    begin() {
      if (window) throw new Error("Performance observation is already active.")
      window = { started: performance.now(), entries: [] }
    },
    async end() {
      if (!window) throw new Error("Performance observation is not active.")
      const current = window
      window = undefined
      const ended = performance.now()
      await Promise.all([...pendingSizes])
      const completed = current.entries.filter(
        (entry) => entry.finished !== undefined && entry.finished <= ended,
      )
      /** @type {Record<string, Timeline>} */
      const timeline = {}
      /** @param {number} instant */
      const relative = (instant) =>
        Math.max(0, Math.round((instant - current.started) * 10) / 10)
      for (const entry of current.entries) {
        const start = relative(entry.started)
        const responded =
          entry.responseHeadersAt !== undefined &&
          entry.responseHeadersAt <= ended
            ? relative(entry.responseHeadersAt)
            : null
        const finished =
          entry.finished !== undefined && entry.finished <= ended
            ? relative(entry.finished)
            : null
        for (const label of entry.labels) {
          timeline[label] ??= {
            started: 0,
            responseHeaders: 0,
            finished: 0,
            firstStartMs: start,
            lastStartMs: start,
            firstResponseHeadersMs: null,
            lastFinishMs: null,
          }
          const value = timeline[label]
          value.started++
          value.firstStartMs = Math.min(value.firstStartMs, start)
          value.lastStartMs = Math.max(value.lastStartMs, start)
          if (responded !== null) {
            value.responseHeaders++
            value.firstResponseHeadersMs = Math.min(
              value.firstResponseHeadersMs ?? responded,
              responded,
            )
          }
          if (finished !== null) {
            value.finished++
            value.lastFinishMs = Math.max(
              value.lastFinishMs ?? finished,
              finished,
            )
          }
        }
      }
      /** @type {Record<string, Group>} */
      const byKind = {}
      for (const entry of completed) {
        byKind[entry.kind] ??= {
          completed: 0,
          failed: 0,
          cancelled: 0,
          httpErrors: 0,
          responseBodyBytes: 0,
          byteMeasurements: 0,
          requestWorkMilliseconds: 0,
          serverPhases: {},
        }
        const group = byKind[entry.kind]
        group.completed++
        group.failed += Number(entry.failed)
        group.cancelled += Number(entry.cancelled)
        group.httpErrors += Number((entry.status ?? 0) >= 400)
        group.requestWorkMilliseconds += Math.round(
          (entry.finished ?? entry.started) - entry.started,
        )
        if (entry.responseBodyBytes !== undefined) {
          group.responseBodyBytes += entry.responseBodyBytes
          group.byteMeasurements++
        }
        for (const [phase, value] of Object.entries(entry.phases)) {
          group.serverPhases[phase] ??= {
            milliseconds: 0,
            count: 0,
          }
          const aggregate = group.serverPhases[phase]
          aggregate.milliseconds =
            Math.round((aggregate.milliseconds + value.milliseconds) * 10) / 10
          aggregate.count += value.count
        }
      }
      return {
        started: current.entries.length,
        inFlightAtReadiness: current.entries.length - completed.length,
        observationMilliseconds: relative(ended),
        timeline,
        byKind,
        scope:
          "Requests started during the action; completed bytes/phases stop at readiness. Includes background work. Server-to-server reads are not visible. Work durations overlap and are not additive wall time.",
      }
    },
    dispose() {
      page.off("request", onRequest)
      page.off("response", onResponse)
      page.off("requestfinished", onFinished)
      page.off("requestfailed", onFailed)
    },
  }
}
