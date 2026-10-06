import { createHash } from "node:crypto"
import {
  NATIVE_ENVIRONMENT_KEYS,
  type NativeEnvironmentContext,
  type NativeEnvironmentState,
  assertNativeEasEnvironment,
  assertNativeEnvironmentState,
  assertNativeEnvironmentValues,
  emptyNativeEnvironmentValues,
  nativeEnvironmentFingerprint,
  resolveNativeEnvironment,
} from "./release-mobile-environment"
import { MOBILE_PROJECT, MOBILE_TARGET } from "./release-mobile-target"

export const NATIVE_SELECTOR_KEYS = [
  "APP_ENV",
  "APP_VARIANT",
  "EXPO_PUBLIC_APP_VARIANT",
  "EAS_BUILD_PROFILE",
] as const
export const EXPO_NATIVE_QUERY_KEYS = [
  ...NATIVE_ENVIRONMENT_KEYS,
  ...NATIVE_SELECTOR_KEYS,
] as const
const KEY_SET = new Set<string>(EXPO_NATIVE_QUERY_KEYS)
const MAX_BYTES = 128 * 1024
const MAX_AGE_MS = 5 * 60 * 1000
const ORIGIN = "https://api.expo.dev/graphql"

/** Fixed read query: never arbitrary GraphQL, unrelated names, or file contents. */
export const EXPO_NATIVE_ENVIRONMENT_QUERY = `query EwaTradeNativeEnvironment($appId: String!, $filterNames: [String!]!, $environment: EnvironmentVariableEnvironment!) {
  app { byId(appId: $appId) {
    id slug
    projectVariables: environmentVariablesIncludingSensitive(filterNames: $filterNames, environment: $environment) { id name value(includeFileContent: false) scope visibility type environments }
    ownerAccount { id name
      accountVariables: environmentVariablesIncludingSensitive(filterNames: $filterNames, environment: $environment) { id name value(includeFileContent: false) scope visibility type environments }
    }
  } }
}`
export const EXPO_NATIVE_ENVIRONMENT_QUERY_SHA256 = hash(
  EXPO_NATIVE_ENVIRONMENT_QUERY,
)

export type ExpoNativeEnvironmentReceipt = {
  version: 1
  projectId: string
  ownerAccountId: string
  revision: string
  environment: NativeEnvironmentContext["environment"]
  sourceFingerprint: string
  nativeEnvironmentFingerprint: string
  profileFingerprint: string
  queryFingerprint: string
  observedAt: string
  matched: true
}
type Variable = {
  id: string
  name: string
  value: string | null
  scope: "PROJECT" | "SHARED"
  visibility: "PUBLIC" | "SENSITIVE" | "SECRET"
  type: "STRING" | "FILE_BASE64"
}
export type ExpoEnvironmentRequest = (
  url: string,
  init: RequestInit,
) => Promise<Response>

/** Values stay in memory. Scope conflicts require equal readable values or a profile override. */
export function compareExpoNativeEnvironment(
  context: NativeEnvironmentContext,
  state: NativeEnvironmentState,
  eas: unknown,
  response: unknown,
  configuration: NodeJS.ProcessEnv = process.env,
): ExpoNativeEnvironmentReceipt {
  assertNativeEnvironmentState(context, state, configuration)
  const { values } = resolveNativeEnvironment(context, configuration)
  const profile = selectedProfile(context, eas, values)
  const envelope = record(response)
  if (
    (envelope.errors !== undefined &&
      (!Array.isArray(envelope.errors) || envelope.errors.length !== 0)) ||
    envelope.hasNext !== undefined ||
    envelope.incremental !== undefined
  )
    throw new Error("Expo native environment query is partial or failed.")
  const app = record(record(record(envelope.data).app).byId)
  const account = record(app.ownerAccount)
  if (
    app.id !== MOBILE_TARGET.projectId ||
    app.slug !== MOBILE_PROJECT.slug ||
    account.name !== MOBILE_PROJECT.owner ||
    typeof account.id !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(account.id)
  )
    throw new Error(
      "Expo native environment query ownership is unavailable or mismatched.",
    )
  const project = variables(
    app.projectVariables,
    "PROJECT",
    context.environment,
  )
  const shared = variables(
    account.accountVariables,
    "SHARED",
    context.environment,
  )
  const effective = emptyNativeEnvironmentValues()
  for (const key of EXPO_NATIVE_QUERY_KEYS) {
    const override = profile[key]
    let value: string | null
    if (override !== undefined) value = override
    else {
      const projectValue = readable(project.get(key))
      const accountValue = readable(shared.get(key))
      if (project.has(key) && shared.has(key) && projectValue !== accountValue)
        throw new Error(
          "Expo native environment has unresolved account/project precedence.",
        )
      value = project.has(key) ? projectValue : accountValue
    }
    if (NATIVE_SELECTOR_KEYS.some((selector) => selector === key)) {
      if (value !== null && value !== context.environment)
        throw new Error(
          "Expo environment conflicts with the fixed release selectors.",
        )
    } else {
      const nativeKey = NATIVE_ENVIRONMENT_KEYS.find((name) => name === key)
      if (nativeKey) effective[nativeKey] = value
    }
  }
  assertNativeEnvironmentValues(effective)
  const fingerprint = nativeEnvironmentFingerprint(context, effective)
  if (fingerprint !== state.fingerprint)
    throw new Error(
      "Effective Expo native values differ from the protected reviewed source inputs.",
    )
  return {
    version: 1,
    projectId: MOBILE_TARGET.projectId,
    ownerAccountId: account.id,
    revision: context.revision,
    environment: context.environment,
    sourceFingerprint: context.sourceFingerprint,
    nativeEnvironmentFingerprint: fingerprint,
    profileFingerprint: profileFingerprint(context, profile),
    queryFingerprint: EXPO_NATIVE_ENVIRONMENT_QUERY_SHA256,
    observedAt: new Date().toISOString(),
    matched: true,
  }
}

export async function collectExpoNativeEnvironment(
  context: NativeEnvironmentContext,
  state: NativeEnvironmentState,
  eas: unknown,
  options: {
    token?: string
    request?: ExpoEnvironmentRequest
    configuration?: NodeJS.ProcessEnv
  } = {},
) {
  // Refuse source/config mismatch before touching provider credentials or issuing a request.
  assertNativeEnvironmentState(context, state, options.configuration)
  selectedProfile(
    context,
    eas,
    resolveNativeEnvironment(context, options.configuration).values,
  )
  const token = options.token ?? process.env.EXPO_TOKEN
  if (!token || token.length > 4096 || /[\r\n]/.test(token))
    throw new Error(
      "Protected Expo native environment read credential is unavailable.",
    )
  let result: Response
  try {
    result = await (options.request ?? fetch)(ORIGIN, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        query: EXPO_NATIVE_ENVIRONMENT_QUERY,
        variables: {
          appId: MOBILE_TARGET.projectId,
          filterNames: EXPO_NATIVE_QUERY_KEYS,
          environment: context.environment,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new Error("Expo native environment authenticated read failed.")
  }
  if (!result.ok) {
    await result.body?.cancel().catch(() => {})
    throw new Error(
      "Expo native environment authenticated read returned unsuccessful HTTP status.",
    )
  }
  const reader = result.body?.getReader()
  if (!reader)
    throw new Error("Expo native environment response is unavailable.")
  const chunks: Uint8Array[] = []
  let size = 0
  let response: unknown
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > MAX_BYTES) {
        await reader.cancel()
        throw new Error("oversized")
      }
      chunks.push(chunk.value)
    }
    response = JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    throw new Error("Expo native environment response is invalid or oversized.")
  } finally {
    reader.releaseLock()
  }
  return compareExpoNativeEnvironment(
    context,
    state,
    eas,
    response,
    options.configuration,
  )
}

/** Signed proof is fresh and bound to the same protected source and committed profile. */
export function assertExpoNativeEnvironmentReceipt(
  context: NativeEnvironmentContext,
  state: NativeEnvironmentState | undefined,
  eas: unknown,
  receipt: ExpoNativeEnvironmentReceipt | undefined,
  configuration: NodeJS.ProcessEnv = process.env,
) {
  assertNativeEnvironmentState(context, state, configuration)
  const profile = selectedProfile(
    context,
    eas,
    resolveNativeEnvironment(context, configuration).values,
  )
  const observed =
    receipt && typeof receipt.observedAt === "string"
      ? Date.parse(receipt.observedAt)
      : Number.NaN
  const now = Date.now()
  if (
    !receipt ||
    Object.keys(receipt).length !== 11 ||
    receipt.version !== 1 ||
    receipt.matched !== true ||
    receipt.projectId !== MOBILE_TARGET.projectId ||
    typeof receipt.ownerAccountId !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(receipt.ownerAccountId) ||
    receipt.revision !== context.revision ||
    receipt.environment !== context.environment ||
    receipt.sourceFingerprint !== context.sourceFingerprint ||
    receipt.nativeEnvironmentFingerprint !== state.fingerprint ||
    receipt.profileFingerprint !== profileFingerprint(context, profile) ||
    receipt.queryFingerprint !== EXPO_NATIVE_ENVIRONMENT_QUERY_SHA256 ||
    !Number.isFinite(observed) ||
    new Date(observed).toISOString() !== receipt.observedAt ||
    observed > now ||
    now - observed > MAX_AGE_MS
  )
    throw new Error(
      "Signed Expo native environment parity receipt is missing, stale or mismatched.",
    )
}

function selectedProfile(
  context: NativeEnvironmentContext,
  eas: unknown,
  values: ReturnType<typeof emptyNativeEnvironmentValues>,
): Record<string, string> {
  assertNativeEasEnvironment(eas, context.environment, values)
  const profile = record(record(record(eas).build)[context.environment])
  return (profile.env ?? {}) as Record<string, string>
}
function profileFingerprint(
  context: NativeEnvironmentContext,
  profile: Record<string, string>,
) {
  return hash(
    JSON.stringify([
      "ewatrade:native-profile:v1",
      MOBILE_TARGET.projectId,
      context.revision,
      context.environment,
      context.sourceFingerprint,
      EXPO_NATIVE_QUERY_KEYS.map((key) => [key, profile[key] ?? null]),
    ]),
  )
}
function variables(
  input: unknown,
  scope: Variable["scope"],
  environment: NativeEnvironmentContext["environment"],
) {
  if (!Array.isArray(input) || input.length > EXPO_NATIVE_QUERY_KEYS.length)
    throw new Error(
      "Expo native environment scope is unavailable or oversized.",
    )
  const result = new Map<string, Variable>()
  const ids = new Set<string>()
  for (const item of input) {
    const row = record(item)
    if (
      typeof row.id !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(row.id) ||
      ids.has(row.id) ||
      typeof row.name !== "string" ||
      !KEY_SET.has(row.name) ||
      result.has(row.name) ||
      row.scope !== scope ||
      !["PUBLIC", "SENSITIVE", "SECRET"].includes(String(row.visibility)) ||
      !["STRING", "FILE_BASE64"].includes(String(row.type)) ||
      (row.value !== null &&
        (typeof row.value !== "string" || row.value.length > 256)) ||
      !Array.isArray(row.environments) ||
      !row.environments.length ||
      row.environments.length > 16 ||
      row.environments.some(
        (value) =>
          typeof value !== "string" ||
          !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value),
      ) ||
      !row.environments.some((value) => value.toLowerCase() === environment)
    )
      throw new Error(
        "Expo native environment row has invalid scope, identity or environment metadata.",
      )
    ids.add(row.id)
    result.set(row.name, {
      id: row.id,
      name: row.name,
      scope,
      value: row.value as string | null,
      visibility: row.visibility as Variable["visibility"],
      type: row.type as Variable["type"],
    })
  }
  return result
}
function readable(row: Variable | undefined): string | null {
  if (!row) return null
  if (
    row.type !== "STRING" ||
    row.visibility === "SECRET" ||
    typeof row.value !== "string" ||
    row.value.startsWith("*****")
  )
    throw new Error(
      "Required Expo native environment value is masked, secret, file or unavailable.",
    )
  return row.value
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(
      "Expo native environment response record is unavailable or malformed.",
    )
  return value as Record<string, unknown>
}
function hash(value: string) {
  return createHash("sha256").update(value).digest("hex")
}
