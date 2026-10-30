// Local QA diagnostics only. Never retain URLs, headers, bodies or identifiers.
/** @typedef {{milliseconds: number, count: number}} Phase */
/** @typedef {{kind: string, labels: string[], rpcOperations: Record<string, number>, started: number, phases: Record<string, Phase>, responseHeadersAt?: number, status?: number, finished?: number, failed?: boolean, cancelled?: boolean, responseBodyBytes?: number}} Entry */
/** @typedef {{completed: number, failed: number, cancelled: number, httpErrors: number, responseBodyBytes: number, byteMeasurements: number, requestWorkMilliseconds: number, serverPhases: Record<string, Phase>}} Group */
/** @typedef {{started: number, responseHeaders: number, finished: number, firstStartMs: number, lastStartMs: number, firstResponseHeadersMs: number | null, lastFinishMs: number | null}} Timeline */
/** @typedef {{kind: string, labels: string[], decodedBytes: number, dataEvents: number, finished: boolean, failed: boolean}} ReceivedBody */
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

const readGroups = new Map(
  Object.entries({
    "businessNotifications.unreadCount": "notificationCounts",
    "businessBanking.pendingReportCount": "notificationCounts",
    "businessBanking.notificationChangeCount": "notificationCounts",
    "storefrontRequests.notificationCount": "notificationCounts",
    "businessBanking.pendingReports": "notificationPreviews",
    "businessBanking.notificationChanges": "notificationPreviews",
    "storefrontRequests.notifications": "notificationPreviews",
    "assistant.availability": "assistantCapability",
    "assistant.allowance": "assistantCapability",
    "productAssistant.capabilities": "assistantCapability",
    "setupAssistant.attachments.voiceCapabilities": "assistantCapability",
    "assistantChannels.availability": "whatsAppPrivate",
    "assistantChannels.whatsAppConnections": "whatsAppPrivate",
    "assistantChannels.whatsAppLink": "whatsAppPrivate",
    "setupAssistant.attachments.list": "attachmentStatus",
    "domains.order": "domainStatus",
    "productAssistant.state": "productState",
    "tenant.current": "workspaceScope",
    "storefrontRequests.counts": "visibleQueue",
    "storefrontRequests.orders": "visibleQueue",
    "storefrontRequests.services": "visibleQueue",
    "serviceCommerce.storeConversationQueue": "visibleQueue",
    "assistant.pendingProposals": "pendingApprovals",
    "orders.pendingChangeApprovals": "pendingApprovals",
    "stores.orderVisibility": "accessStatus",
  }),
)

/** Fixed numeric groups only; no names/inputs retained. @param {string} pathname */
export function dashboardReadOperationCounts(pathname) {
  if (!pathname.startsWith("/api/trpc/")) return {}
  /** @type {Record<string, number>} */
  const result = {}
  let names
  try {
    names = decodeURIComponent(pathname.slice("/api/trpc/".length)).split(",")
  } catch {
    return { otherRpc: 1 }
  }
  for (const name of names) {
    const group = readGroups.get(name) ?? "otherRpc"
    result[group] = (result[group] ?? 0) + 1
  }
  return result
}

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

/** @param {{url: string, type: string, headers: Record<string, string>, method: string}} request @param {string} origin */
export function classifyDashboardRequest(request, origin) {
  const url = new URL(request.url)
  const type = request.type.toLowerCase()
  const headers = request.headers
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
  if (kind === "route")
    labels.push(
      headers["next-router-prefetch"] === "1" ||
        Boolean(headers["next-router-segment-prefetch"])
        ? "routePrefetch"
        : "routeNavigation",
    )
  if (kind === "api") {
    if (
      request.method === "GET" &&
      headers["trpc-accept"] === "application/jsonl"
    )
      labels.push("streamingApi")
    if (url.pathname.startsWith("/api/trpc/")) {
      const procedures = url.pathname.slice("/api/trpc/".length).split(",")
      if (procedures.includes("activity.listPage")) labels.push("activityList")
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
  return { kind, labels }
}

/**
 * Observes existing journeys; it never sends requests or waits for idle polling.
 * @param {import("playwright").Page} page
 * @param {string} origin
 */
export function observeWebPerformance(page, origin) {
  if (origin !== "https://ewatrade-dashboard.localhost")
    throw new Error("Request performance measurement is local-only.")
  /** @type {{started: number, entries: Entry[], received: ReceivedBody[]} | undefined} */
  let window
  /** @type {Map<string, ReceivedBody>} */
  const receiving = new Map()
  /** @type {import("playwright").CDPSession | undefined} */
  let protocol
  let initialized = false
  let disposed = false
  /** @type {(() => void)[]} */
  const protocolCleanups = []
  const removeProtocolListeners = () => {
    for (const cleanup of protocolCleanups.splice(0)) cleanup()
  }
  const ready = page
    .context()
    .newCDPSession(page)
    .then(async (session) => {
      if (disposed) {
        await session.detach()
        return
      }
      protocol = session
      /** @param {{requestId: string, request: {url: string, method: string, headers: Record<string, string>}, type?: string, redirectResponse?: unknown}} event */
      const onrequestWillBeSent = (event) => {
        if (event.redirectResponse) {
          const previous = receiving.get(event.requestId)
          if (previous) previous.finished = true
          receiving.delete(event.requestId)
        }
        if (!window) return
        // Copy only the four classification headers; no credentials or payload fields.
        const headers = Object.fromEntries(
          Object.entries(event.request.headers)
            .filter(([name]) =>
              [
                "rsc",
                "next-router-prefetch",
                "next-router-segment-prefetch",
                "trpc-accept",
              ].includes(name.toLowerCase()),
            )
            .map(([name, value]) => [name.toLowerCase(), String(value)]),
        )
        const { kind, labels } = classifyDashboardRequest(
          {
            url: event.request.url,
            type: event.type ?? "other",
            method: event.request.method,
            headers,
          },
          origin,
        )
        const entry = {
          kind,
          labels,
          decodedBytes: 0,
          dataEvents: 0,
          finished: false,
          failed: false,
        }
        receiving.set(event.requestId, entry)
        window.received.push(entry)
      }
      session.on("Network.requestWillBeSent", onrequestWillBeSent)
      protocolCleanups.push(() =>
        session.off("Network.requestWillBeSent", onrequestWillBeSent),
      )
      /** @param {{requestId: string, dataLength: number}} event */
      const ondataReceived = (event) => {
        const entry = receiving.get(event.requestId)
        if (
          !entry ||
          !Number.isSafeInteger(event.dataLength) ||
          event.dataLength < 0
        )
          return
        entry.decodedBytes += event.dataLength
        entry.dataEvents++
      }
      session.on("Network.dataReceived", ondataReceived)
      protocolCleanups.push(() =>
        session.off("Network.dataReceived", ondataReceived),
      )
      /** @param {{requestId: string}} event */
      const onloadingFinished = (event) => {
        const entry = receiving.get(event.requestId)
        if (entry) entry.finished = true
        receiving.delete(event.requestId)
      }
      session.on("Network.loadingFinished", onloadingFinished)
      protocolCleanups.push(() =>
        session.off("Network.loadingFinished", onloadingFinished),
      )
      /** @param {{requestId: string}} event */
      const onloadingFailed = (event) => {
        const entry = receiving.get(event.requestId)
        if (entry) entry.failed = true
        receiving.delete(event.requestId)
      }
      session.on("Network.loadingFailed", onloadingFailed)
      protocolCleanups.push(() =>
        session.off("Network.loadingFailed", onloadingFailed),
      )
      await session.send("Network.enable")
      initialized = true
      if (disposed) {
        removeProtocolListeners()
        await session.detach()
      }
    })
  /** @type {WeakMap<import("playwright").Request, Entry>} */
  const requests = new WeakMap()
  /** @type {Set<Promise<void>>} */
  const pendingSizes = new Set()
  /** @param {import("playwright").Request} request */
  const onRequest = (request) => {
    if (!window) return
    const url = new URL(request.url())
    const { kind, labels } = classifyDashboardRequest(
      {
        url: request.url(),
        type: request.resourceType(),
        headers: request.headers(),
        method: request.method(),
      },
      origin,
    )
    /** @type {Entry} */
    const entry = {
      kind,
      labels,
      rpcOperations:
        kind === "api" && request.method() === "GET"
          ? dashboardReadOperationCounts(url.pathname)
          : {},
      started: performance.now(),
      phases: {},
    }
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
    async ready() {
      await ready
    },
    begin() {
      if (window) throw new Error("Performance observation is already active.")
      if (!initialized) throw new Error("Performance observation is not ready.")
      window = { started: performance.now(), entries: [], received: [] }
    },
    async end() {
      if (!window) throw new Error("Performance observation is not active.")
      const current = window
      window = undefined
      const ended = performance.now()
      // Snapshot immediately: later chunks must not enter an earlier window.
      const received = current.received.map((entry) => ({ ...entry }))
      await Promise.all([...pendingSizes])
      const completed = current.entries.filter(
        (entry) => entry.finished !== undefined && entry.finished <= ended,
      )
      /** @type {Record<string, number>} */
      const rpcOperations = {}
      for (const entry of current.entries)
        for (const [group, count] of Object.entries(entry.rpcOperations))
          rpcOperations[group] = (rpcOperations[group] ?? 0) + count
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
        rpcOperations,
        timeline,
        byKind,
        receivedBodies: summarizeReceivedBodies(received),
        scope:
          "Requests started during the action; completed bytes/phases stop at readiness. Includes background work. Server-to-server reads are not visible. Work durations overlap and are not additive wall time.",
      }
    },
    dispose() {
      disposed = true
      page.off("request", onRequest)
      page.off("response", onResponse)
      page.off("requestfinished", onFinished)
      page.off("requestfailed", onFailed)
      receiving.clear()
      removeProtocolListeners()
      if (protocol) void protocol.detach().catch(() => {})
    },
  }
}

/** @param {ReceivedBody[]} entries */
function summarizeReceivedBodies(entries) {
  /** @type {Record<string, {requests: number, measurements: number, decodedBytes: number, completed: number, failed: number, inFlight: number}>} */
  const byKind = {}
  /** @type {Record<string, number>} */
  const decodedByLabel = {}
  for (const entry of entries) {
    byKind[entry.kind] ??= {
      requests: 0,
      measurements: 0,
      decodedBytes: 0,
      completed: 0,
      failed: 0,
      inFlight: 0,
    }
    const group = byKind[entry.kind]
    group.requests++
    group.measurements += Number(entry.dataEvents > 0)
    group.decodedBytes += entry.decodedBytes
    group.completed += Number(entry.finished)
    group.failed += Number(entry.failed)
    group.inFlight += Number(!entry.finished && !entry.failed)
    for (const label of entry.labels)
      decodedByLabel[label] = (decodedByLabel[label] ?? 0) + entry.decodedBytes
  }
  return {
    byKind,
    decodedByLabel,
    scope:
      "Independent Chromium dataReceived counters for requests begun in this window; decoded bytes received by window end, including failed/partial streams. Not encoded transfer, headers, complete payload or SQL work. Zero measurements means unavailable; overlapping labels are not additive.",
  }
}
