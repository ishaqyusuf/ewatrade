import { type AppError, classifyError } from "@ewatrade/errors"

export const EWATRADE_EXTERNAL_DIAGNOSTICS_AUTHORIZED = true as const

export type ObservabilityRuntime =
  | "api"
  | "dashboard"
  | "jobs"
  | "marketing"
  | "mobile"
  | "pos"
  | "storefront"

export type ObservabilityEnvironment = {
  deploymentEnvironment?: string
  dsn?: string
  nodeEnvironment?: string
  release?: string
}

export type DiagnosticContext = {
  operation?: string
  requestId?: string
  runtime: ObservabilityRuntime
}

type DiagnosticMarker = {
  code: AppError["code"]
  operation?: string
  referenceId: string
  requestId?: string
  runtime: ObservabilityRuntime
}

type SafeFrame = {
  abs_path?: string
  filename?: string
  function?: string
  in_app?: boolean
  lineno?: number
  colno?: number
}

type SentryLikeEvent = {
  breadcrumbs?: unknown[]
  contexts?: Record<string, unknown>
  debug_meta?: unknown
  dist?: string
  environment?: string
  event_id?: string
  exception?: {
    values?: Array<{
      mechanism?: { handled?: boolean; type?: string }
      stacktrace?: { frames?: SafeFrame[] }
      type?: string
      value?: string
    }>
  }
  extra?: Record<string, unknown>
  fingerprint?: string[]
  level?: string
  logentry?: unknown
  message?: string
  modules?: Record<string, string>
  platform?: string
  release?: string
  request?: unknown
  server_name?: string
  tags?: Record<string, string>
  timestamp?: number
  transaction?: string
  user?: unknown
  sdk?: unknown
}

type SentryHint = { originalException?: unknown }

const markerByError = new WeakMap<Error, DiagnosticMarker>()
const safeId =
  /^req_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const safeOperation = /^[a-z0-9][a-z0-9._:-]{0,127}$/

function boundedOpaque(value: string | undefined, pattern: RegExp) {
  const normalized = value?.trim()
  return normalized && pattern.test(normalized) ? normalized : undefined
}

function scrubPath(value: string | undefined) {
  if (!value) return value
  const withoutSecretParts = value.split(/[?#]/, 1)[0]
  return withoutSecretParts?.replace(
    /\/(address|addresses|cart|carts|closeout|closeouts|conversation|conversations|customer|customers|device|devices|domain|domains|evidence|evidences|inventory|inventories|location|locations|message|messages|offline-command|offline-commands|order|orders|payment|payments|phone|phones|prescription|quote|r|registrant|registrants|request|staff|stock|stocks|store|stores|tenant|tenants|track|transfer|user|users|variance|variances)\/[A-Za-z0-9_.+%=-]{8,}/gi,
    "/$1/[filtered]",
  )
}

function safeFrames(frames: SafeFrame[] | undefined) {
  return frames?.slice(-80).map((frame) => ({
    abs_path: scrubPath(frame.abs_path),
    colno: frame.colno,
    filename: scrubPath(frame.filename),
    function: frame.function?.slice(0, 160),
    in_app: frame.in_app,
    lineno: frame.lineno,
  }))
}

export function isExternalDiagnosticsEnabled(input: ObservabilityEnvironment) {
  return Boolean(
    EWATRADE_EXTERNAL_DIAGNOSTICS_AUTHORIZED &&
      input.deploymentEnvironment === "production" &&
      input.nodeEnvironment === "production" &&
      input.dsn?.trim() &&
      input.release?.trim(),
  )
}

export function createSafeDiagnosticError(
  error: unknown,
  context: DiagnosticContext,
) {
  const classified = classifyError(error, { operation: context.operation })
  if (!classified.reportable) return null
  const operation = boundedOpaque(
    classified.operation ?? context.operation,
    safeOperation,
  )
  const requestId = boundedOpaque(context.requestId, safeId)
  const safeError = new Error(`Operational failure (${classified.code})`)
  safeError.name = "EwaTradeDiagnosticError"
  if (error instanceof Error && error.stack) {
    const frames = error.stack.split("\n").slice(1, 81)
    safeError.stack = [
      `${safeError.name}: ${safeError.message}`,
      ...frames.map((line) => scrubPath(line) ?? line),
    ].join("\n")
  }
  markerByError.set(safeError, {
    code: classified.code,
    operation,
    referenceId: classified.referenceId,
    requestId,
    runtime: context.runtime,
  })
  return safeError
}

export function rebuildDiagnosticEvent(
  event: SentryLikeEvent,
  hint: SentryHint,
  runtime: ObservabilityRuntime,
) {
  const original = hint.originalException
  const marker =
    original instanceof Error ? markerByError.get(original) : undefined
  const classified = marker ? undefined : classifyError(original)
  if (classified && !classified.reportable) return null
  const code = marker?.code ?? classified?.code ?? "UNEXPECTED"
  const operation = boundedOpaque(
    marker?.operation ?? classified?.operation,
    safeOperation,
  )
  const referenceId = marker?.referenceId ?? classified?.referenceId
  const requestId = boundedOpaque(marker?.requestId, safeId)
  const firstException = event.exception?.values?.[0]
  const tags: Record<string, string> = {
    error_code: code,
    runtime,
    ...(operation ? { operation } : {}),
    ...(requestId ? { request_id: requestId } : {}),
  }

  return {
    breadcrumbs: [],
    contexts: {},
    debug_meta: event.debug_meta,
    dist: event.dist,
    environment: event.environment,
    event_id: event.event_id,
    exception: {
      values: [
        {
          mechanism: {
            handled: firstException?.mechanism?.handled,
            type: "ewatrade_safe_boundary",
          },
          stacktrace: {
            frames: safeFrames(firstException?.stacktrace?.frames),
          },
          type: "EwaTradeDiagnosticError",
          value: `Operational failure (${code})`,
        },
      ],
    },
    extra: {},
    fingerprint: [runtime, code, operation ?? "unknown"],
    level: "error",
    message: `Operational failure (${code})`,
    modules: {},
    platform: event.platform,
    release: event.release,
    request: undefined,
    server_name: undefined,
    tags,
    timestamp: event.timestamp,
    transaction: undefined,
    user: undefined,
    sdk: event.sdk,
    ...(referenceId ? { extra: { error_reference: referenceId } } : {}),
  }
}

export function createBeforeSend(runtime: ObservabilityRuntime) {
  return (event: SentryLikeEvent, hint: SentryHint) =>
    rebuildDiagnosticEvent(event, hint, runtime)
}

export function sentryRuntimeOptions(
  runtime: ObservabilityRuntime,
  input: ObservabilityEnvironment,
) {
  return {
    beforeBreadcrumb: () => null,
    beforeSend: createBeforeSend(runtime),
    dsn: input.dsn,
    enabled: isExternalDiagnosticsEnabled(input),
    enableLogs: false,
    environment: input.deploymentEnvironment,
    release: input.release,
    replaysOnErrorSampleRate: 0,
    replaysSessionSampleRate: 0,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  }
}

export function shouldUploadSourceMaps(
  input: ObservabilityEnvironment & {
    authToken?: string
    organization?: string
    project?: string
  },
) {
  return Boolean(
    isExternalDiagnosticsEnabled(input) &&
      input.authToken?.trim() &&
      input.organization?.trim() &&
      input.project?.trim(),
  )
}
