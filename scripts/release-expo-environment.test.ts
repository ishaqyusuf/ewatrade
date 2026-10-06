import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import {
  MOBILE_PROJECT,
  MOBILE_TARGET,
} from "../.release/ewatrade-provider-bundle"
import {
  EXPO_NATIVE_ENVIRONMENT_QUERY,
  EXPO_NATIVE_ENVIRONMENT_QUERY_SHA256,
  EXPO_NATIVE_QUERY_KEYS,
  assertExpoNativeEnvironmentReceipt,
  collectExpoNativeEnvironment,
  compareExpoNativeEnvironment,
} from "./release-expo-environment"
import {
  NATIVE_ENVIRONMENT_KEYS,
  type NativeEnvironmentContext,
  type NativeEnvironmentValues,
  emptyNativeEnvironmentValues,
  nativeEnvironmentFingerprint,
  resolveNativeEnvironment,
} from "./release-mobile-environment"

const now = Date.now()
const context: NativeEnvironmentContext = {
  revision: "a".repeat(40),
  environment: "preview",
  sourceFingerprint: "b".repeat(64),
}
const values: NativeEnvironmentValues = {
  EXPO_PUBLIC_AUTO_UPDATE_ON_FOREGROUND: "true",
  EXPO_PUBLIC_AUTO_UPDATE_FOREGROUND_COOLDOWN_MS: "60000",
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: "1234567890-abc.apps.googleusercontent.com",
  GOOGLE_IOS_CLIENT_ID: "1234567890-abc.apps.googleusercontent.com",
  EXPO_PUBLIC_CUSTOMER_CHAT_HOST: "chat.example.com",
  EXPO_PUBLIC_DASHBOARD_URL: "https://dashboard-preview.example.com",
}

function configurationFor(boundValues: NativeEnvironmentValues = values) {
  const binding = {
    version: 1,
    projectId: MOBILE_TARGET.projectId,
    revision: context.revision,
    environment: context.environment,
    sourceFingerprint: context.sourceFingerprint,
    reviewedBy: "reviewed-owner",
    reviewedAt: new Date(now - 60_000).toISOString(),
    expiresAt: new Date(now + 6 * 24 * 60 * 60 * 1000).toISOString(),
    values: boundValues,
  }
  const json = JSON.stringify(binding)
  return {
    EWATRADE_RELEASE_NATIVE_ENVIRONMENT_JSON: json,
    EWATRADE_RELEASE_NATIVE_ENVIRONMENT_SHA256: createHash("sha256")
      .update(json)
      .digest("hex"),
  }
}

function easConfig(
  environment = context.environment,
  env: Record<string, string> = {},
) {
  return {
    build: {
      [environment]: {
        environment,
        channel: environment,
        env,
      },
    },
  }
}

function row(
  name: string,
  value: string | null,
  scope: "PROJECT" | "SHARED",
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `${scope.toLowerCase()}-${name}`,
    name,
    value,
    scope,
    visibility: "PUBLIC",
    type: "STRING",
    environments: [context.environment],
    ...overrides,
  }
}

function response(
  projectVariables: unknown[] = [],
  accountVariables: unknown[] = [],
  appOverrides: Record<string, unknown> = {},
  accountOverrides: Record<string, unknown> = {},
) {
  return {
    data: {
      app: {
        byId: {
          id: MOBILE_TARGET.projectId,
          slug: MOBILE_PROJECT.slug,
          projectVariables,
          ownerAccount: {
            id: "account_123",
            name: MOBILE_PROJECT.owner,
            accountVariables,
            ...accountOverrides,
          },
          ...appOverrides,
        },
      },
    },
  }
}

function providerRows(
  nativeValues: NativeEnvironmentValues = values,
  projectScope: "PROJECT" | "SHARED" = "PROJECT",
  accountScope: "PROJECT" | "SHARED" = "SHARED",
) {
  const projectRows = NATIVE_ENVIRONMENT_KEYS.flatMap((name) =>
    nativeValues[name] === null
      ? []
      : [row(name, nativeValues[name], projectScope)],
  )
  const selectors = [
    "APP_ENV",
    "APP_VARIANT",
    "EXPO_PUBLIC_APP_VARIANT",
    "EAS_BUILD_PROFILE",
  ]
  for (const name of selectors)
    projectRows.push(row(name, context.environment, projectScope))
  return {
    projectRows,
    accountRows: NATIVE_ENVIRONMENT_KEYS.flatMap((name) =>
      nativeValues[name] === null
        ? []
        : [row(name, nativeValues[name], accountScope)],
    ),
  }
}

function matchReceipt(
  nativeValues: NativeEnvironmentValues = values,
  responseValue: unknown = response(
    ...(Object.values(providerRows(nativeValues)) as [unknown[], unknown[]]),
  ),
  eas: unknown = easConfig(),
) {
  const config = configurationFor(nativeValues)
  const { state } = resolveNativeEnvironment(context, config)
  return compareExpoNativeEnvironment(
    context,
    state,
    eas,
    responseValue,
    config,
  )
}

describe("authenticated fixed Expo native environment read", () => {
  test("POSTs one fixed origin/query with only the six native and four selector names", async () => {
    const config = configurationFor()
    const { state } = resolveNativeEnvironment(context, config)
    const data = response(
      ...(Object.values(providerRows()) as [unknown[], unknown[]]),
    )
    let seenUrl = ""
    let seenInit: RequestInit | undefined
    const receipt = await collectExpoNativeEnvironment(
      context,
      state,
      easConfig(),
      {
        configuration: config,
        token: "inert-test-token",
        request: async (url, init) => {
          seenUrl = url
          seenInit = init
          return new Response(JSON.stringify(data), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        },
      },
    )
    expect(seenUrl).toBe("https://api.expo.dev/graphql")
    expect(seenInit?.method).toBe("POST")
    expect(seenInit?.redirect).toBe("error")
    expect(seenInit?.cache).toBe("no-store")
    const body = JSON.parse(String(seenInit?.body)) as {
      query: string
      variables: { appId: string; filterNames: string[]; environment: string }
    }
    expect(body.query).toBe(EXPO_NATIVE_ENVIRONMENT_QUERY)
    expect(body.variables.appId).toBe(MOBILE_TARGET.projectId)
    expect(body.variables.filterNames).toEqual([...EXPO_NATIVE_QUERY_KEYS])
    expect(body.variables.filterNames).toHaveLength(10)
    expect(body.variables.environment).toBe(context.environment)
    expect(body.query).toContain(
      "projectVariables: environmentVariablesIncludingSensitive",
    )
    expect(body.query).toContain(
      "accountVariables: environmentVariablesIncludingSensitive",
    )
    expect(body.query).toContain("filterNames: $filterNames")
    expect(body.query.match(/environment: \$environment/g)).toHaveLength(2)
    expect(
      body.query.match(/value\(includeFileContent: false\)/g),
    ).toHaveLength(2)
    expect(body.query).not.toMatch(/includeFileContent:\s*true/)
    expect(receipt.queryFingerprint).toBe(EXPO_NATIVE_ENVIRONMENT_QUERY_SHA256)
    expect(receipt.matched).toBe(true)
  })

  test("treats empty authenticated scope arrays as explicit absence", () => {
    const absent = emptyNativeEnvironmentValues()
    const config = configurationFor(absent)
    const { state } = resolveNativeEnvironment(context, config)
    const result = compareExpoNativeEnvironment(
      context,
      state,
      easConfig(),
      response(),
      config,
    )
    expect(result.matched).toBe(true)
    expect(result.nativeEnvironmentFingerprint).toBe(
      nativeEnvironmentFingerprint(context, absent),
    )
  })

  test("accepts plaintext/sensitive matching exact values and emits only their digest", () => {
    const rows = providerRows()
    rows.projectRows[0] = row(
      NATIVE_ENVIRONMENT_KEYS[0],
      values[NATIVE_ENVIRONMENT_KEYS[0]],
      "PROJECT",
      { visibility: "SENSITIVE" },
    )
    const result = matchReceipt(
      values,
      response(rows.projectRows, rows.accountRows),
    )
    expect(result.matched).toBe(true)
    expect(result.nativeEnvironmentFingerprint).toBe(
      nativeEnvironmentFingerprint(context, values),
    )
    expect(JSON.stringify(result)).not.toContain(
      values.EXPO_PUBLIC_CUSTOMER_CHAT_HOST,
    )
    expect(JSON.stringify(result)).not.toContain("apps.googleusercontent.com")
  })

  test("accepts equal duplicate values across account and project scope", () => {
    const rows = providerRows()
    expect(() =>
      matchReceipt(values, response(rows.projectRows, rows.accountRows)),
    ).not.toThrow()
  })

  test("refuses conflicting scope values unless a matching committed profile override wins", () => {
    const { projectRows, accountRows } = providerRows()
    projectRows[0] = row(NATIVE_ENVIRONMENT_KEYS[0], "false", "PROJECT")
    accountRows[0] = row(NATIVE_ENVIRONMENT_KEYS[0], "true", "SHARED")
    const result = matchReceipt(
      values,
      response(projectRows, accountRows),
      easConfig(context.environment, {
        [NATIVE_ENVIRONMENT_KEYS[0]]: values[NATIVE_ENVIRONMENT_KEYS[0]] ?? "",
      }),
    )
    expect(result.matched).toBe(true)
    expect(() =>
      matchReceipt(values, response(projectRows, accountRows)),
    ).toThrow(/unresolved account\/project precedence/)
  })

  test("uses a valid profile override without reading shadowed masked, secret, or file values", () => {
    const { projectRows, accountRows } = providerRows()
    projectRows[0] = row(NATIVE_ENVIRONMENT_KEYS[0], "*****", "PROJECT", {
      visibility: "SENSITIVE",
    })
    accountRows[0] = row(NATIVE_ENVIRONMENT_KEYS[0], null, "SHARED", {
      visibility: "SECRET",
      type: "FILE_BASE64",
    })
    const profile = easConfig(context.environment, {
      [NATIVE_ENVIRONMENT_KEYS[0]]: values[NATIVE_ENVIRONMENT_KEYS[0]] ?? "",
    })
    expect(() =>
      matchReceipt(values, response(projectRows, accountRows), profile),
    ).not.toThrow()
  })

  test("refuses masked, secret, file, and unavailable required values", () => {
    const invalidRows = [
      row(NATIVE_ENVIRONMENT_KEYS[0], "*****", "PROJECT"),
      row(NATIVE_ENVIRONMENT_KEYS[0], "false", "PROJECT", {
        visibility: "SECRET",
      }),
      row(NATIVE_ENVIRONMENT_KEYS[0], "encoded-file", "PROJECT", {
        type: "FILE_BASE64",
      }),
      row(NATIVE_ENVIRONMENT_KEYS[0], null, "PROJECT"),
    ]
    for (const invalid of invalidRows) {
      expect(() => matchReceipt(values, response([invalid]))).toThrow()
    }
  })

  test("rejects wrong owner/project, cross-environment rows, duplicate/unknown names, and malformed rows", () => {
    const validRow = row(
      NATIVE_ENVIRONMENT_KEYS[0],
      values[NATIVE_ENVIRONMENT_KEYS[0]],
      "PROJECT",
    )
    const invalidCases = [
      response([validRow], [], { id: "other-project" }),
      response([validRow], [], { slug: "other-slug" }),
      response([validRow], [], {}, { name: "other-owner" }),
      response([
        row(
          NATIVE_ENVIRONMENT_KEYS[0],
          values[NATIVE_ENVIRONMENT_KEYS[0]],
          "PROJECT",
          { environments: ["production"] },
        ),
      ]),
      response([validRow, { ...validRow, id: "project-duplicate" }]),
      response([row("UNRELATED_SECRET", "secret", "PROJECT")]),
      response([{ ...validRow, scope: "SHARED" }]),
      response([{ ...validRow, environments: [] }]),
      { data: { app: { byId: { id: MOBILE_TARGET.projectId } } } },
    ]
    for (const invalid of invalidCases) {
      expect(() => matchReceipt(values, invalid)).toThrow()
    }
  })

  test("rejects partial GraphQL responses", () => {
    const emptyResponse = response()
    expect(() =>
      matchReceipt(values, {
        ...emptyResponse,
        errors: [{ message: "private" }],
      }),
    ).toThrow()
    expect(() =>
      matchReceipt(values, { ...emptyResponse, hasNext: true }),
    ).toThrow()
    expect(() =>
      matchReceipt(values, { ...emptyResponse, incremental: [] }),
    ).toThrow()
  })

  test("request, HTTP, and oversized failures return generic errors without response or token text", async () => {
    const config = configurationFor()
    const { state } = resolveNativeEnvironment(context, config)
    const token = "private-test-token"
    const request = (
      implementation: (url: string, init: RequestInit) => Promise<Response>,
    ) =>
      collectExpoNativeEnvironment(context, state, easConfig(), {
        configuration: config,
        token,
        request: implementation,
      })
    const failures: Array<Promise<unknown>> = [
      request(async () => {
        throw new Error(`leaked ${token} server body`)
      }),
      request(
        async () => new Response(`private body ${token}`, { status: 503 }),
      ),
      request(
        async () => new Response("x".repeat(129 * 1024), { status: 200 }),
      ),
    ]
    for (const failure of failures) {
      let message = ""
      try {
        await failure
      } catch (error) {
        message = error instanceof Error ? error.message : String(error)
      }
      expect(message).not.toBe("")
      expect(message).not.toContain(token)
      expect(message).not.toContain("private body")
      expect(message).not.toContain("server body")
    }
  })

  test("refuses source/profile mismatches before issuing a request", async () => {
    const config = configurationFor()
    const { state } = resolveNativeEnvironment(context, config)
    let calls = 0
    const request = async () => {
      calls += 1
      return new Response("{}", { status: 200 })
    }
    await expect(
      collectExpoNativeEnvironment(
        { ...context, environment: "production" },
        state,
        easConfig("production"),
        { configuration: config, token: "inert", request },
      ),
    ).rejects.toThrow()
    await expect(
      collectExpoNativeEnvironment(
        context,
        state,
        easConfig(context.environment, {
          [NATIVE_ENVIRONMENT_KEYS[0]]: "false",
        }),
        { configuration: config, token: "inert", request },
      ),
    ).rejects.toThrow()
    expect(calls).toBe(0)
  })
})

describe("signed Expo native environment receipt", () => {
  test("accepts a fresh exact receipt and rejects tamper, stale, and extra fields", () => {
    const config = configurationFor()
    const { state } = resolveNativeEnvironment(context, config)
    const receipt = matchReceipt(values)
    expect(() =>
      assertExpoNativeEnvironmentReceipt(
        context,
        state,
        easConfig(),
        receipt,
        config,
      ),
    ).not.toThrow()
    const stale = {
      ...receipt,
      observedAt: new Date(now - 6 * 60 * 1000).toISOString(),
    }
    const extra = { ...receipt, extra: "unexpected" }
    const tampered = {
      ...receipt,
      nativeEnvironmentFingerprint: "0".repeat(64),
    }
    for (const invalid of [stale, extra, tampered]) {
      expect(() =>
        assertExpoNativeEnvironmentReceipt(
          context,
          state,
          easConfig(),
          invalid,
          config,
        ),
      ).toThrow()
    }
  })

  test("rejects a receipt whose protected binding or selected profile changed", () => {
    const config = configurationFor()
    const { state } = resolveNativeEnvironment(context, config)
    const receipt = matchReceipt(values)
    const changedProfile = easConfig(context.environment, {
      APP_VARIANT: context.environment,
    })
    expect(() =>
      assertExpoNativeEnvironmentReceipt(
        context,
        state,
        changedProfile,
        receipt,
        config,
      ),
    ).toThrow()
    const changedContext = { ...context, revision: "c".repeat(40) }
    expect(() =>
      assertExpoNativeEnvironmentReceipt(
        changedContext,
        state,
        easConfig(),
        receipt,
        config,
      ),
    ).toThrow()
  })
})
