import type { MiddlewareHandler } from "hono"
import { routePath } from "hono/route"
import { isStreamingPerformanceResponse } from "../utils/performance-trace-response"
import { getRequestTrace } from "../utils/request-trace"

const trpcPrefix = "/api/trpc"
const maxProcedureLabels = 16
const maxProcedurePathLength = 4096
const httpMethods = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
])

export function apiRequestLabels(procedures: Record<string, unknown>) {
  const knownProcedures = new Set(Object.keys(procedures))
  const procedure = (name: string | undefined) =>
    name && knownProcedures.has(name) ? name : "unknown"

  function batch(path: string) {
    const suffix = path.slice(trpcPrefix.length + 1)
    if (!suffix) return { procedures: [], truncated: false }
    if (suffix.length > maxProcedurePathLength)
      return { procedures: [], truncated: true }
    try {
      // The fetch adapter decodes the path before splitting a tRPC batch.
      const names = decodeURIComponent(suffix.replace(/\/$/, "")).split(",")
      return {
        procedures: names.slice(0, maxProcedureLabels).map(procedure),
        truncated: names.length > maxProcedureLabels,
      }
    } catch {
      return { procedures: ["unknown"], truncated: false }
    }
  }

  return { procedure, batch }
}

function deploymentEnvironment(env: NodeJS.ProcessEnv) {
  const value = env.VERCEL_ENV ?? env.APP_ENV ?? env.NODE_ENV
  switch (value) {
    case "production":
    case "preview":
    case "local":
    case "development":
    case "test":
      return value
    case "dev":
      return "development"
    default:
      return "unknown"
  }
}

export type ApiRequestMetric = {
  environment: ReturnType<typeof deploymentEnvironment>
  route: string
  method: string
  procedures?: string[]
  truncated?: boolean
  status: number
  responseSetupMs: number
  streaming: boolean
  requestId: string
  firstInProcess: boolean
  processAgeMs: number
  sampleRate: number
}

export function apiRequestMetrics(
  labels: ReturnType<typeof apiRequestLabels>,
  {
    env = process.env,
    random = Math.random,
    emit = (metric: ApiRequestMetric) =>
      console.info("[api:request]", JSON.stringify(metric)),
  } = {},
): MiddlewareHandler {
  const environment = deploymentEnvironment(env)
  const sampleRate =
    env.DEBUG_PERF === "true" ? 1 : env.VERCEL === "1" ? 0.01 : 0
  let firstRequest = true

  return async (c, next) => {
    if (!sampleRate) return next()
    const firstInProcess = firstRequest
    firstRequest = false
    if (!firstInProcess && random() >= sampleRate) return next()

    const processAgeMs = Math.round(process.uptime() * 1000)
    const started = performance.now()
    await next()
    const registered = routePath(c)
    const route =
      !registered || registered === "*" || registered === "/*"
        ? c.req.method === "OPTIONS" && c.res.status === 204
          ? "cors.preflight"
          : "unmatched"
        : registered
    emit({
      environment,
      route,
      method: httpMethods.has(c.req.method) ? c.req.method : "other",
      ...(route === "/api/trpc/*" ? labels.batch(c.req.path) : {}),
      status: c.res.status,
      responseSetupMs: Math.round((performance.now() - started) * 100) / 100,
      streaming: isStreamingPerformanceResponse(c.res),
      requestId: getRequestTrace(c.req).requestId,
      firstInProcess,
      processAgeMs,
      sampleRate: firstInProcess ? 1 : sampleRate,
    })
  }
}
