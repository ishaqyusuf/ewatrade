import { expect, test } from "bun:test"
import {
  createPlayAgeReader,
  localPlayAgeHint,
  normalizePlayAgeObservation,
  requestPlayAgeObservation,
} from "./play-age-observation"
const shared = {
  kind: "shared",
  lower: 18,
  upper: null,
  source: "self-declared",
  change: "not-provided",
}

test("keeps optional/unsupported/unknown/transport/mandatory states distinct without granting adulthood", () => {
  for (const kind of [
    "disabled",
    "unsupported",
    "unknown",
    "not-shared",
    "unavailable",
    "verification-required",
  ]) {
    const value = normalizePlayAgeObservation({
      kind,
      ageBand: "ADULT",
      verified: true,
      installId: "private",
    })
    expect(value).toEqual({ kind })
    expect(localPlayAgeHint(value)).toBe(
      kind === "verification-required" ? "resolve-in-play" : "existing-policy",
    )
  }
})
test("validates bounds and source, preserves open adult/null/custom ranges and strips identifiers", () => {
  for (const source of [
    "self-declared",
    "parent-managed",
    "assessed",
    "checked",
    "unknown",
  ]) {
    expect(
      normalizePlayAgeObservation({
        ...shared,
        source,
        installId: "private",
        birthDate: "private",
        verified: true,
      }),
    ).toEqual({ ...shared, source })
  }
  for (const [lower, upper] of [
    [null, null],
    [13, 15],
    [16, 17],
    [18, null],
    [13, null],
    [12, 14],
  ]) {
    expect(normalizePlayAgeObservation({ ...shared, lower, upper })).toEqual({
      ...shared,
      lower,
      upper,
    })
  }
  for (const bad of [
    null,
    {},
    { ...shared, lower: null, upper: 17 },
    { ...shared, lower: 18, upper: 15 },
    { ...shared, lower: -1 },
    { ...shared, lower: 1.5 },
    { ...shared, lower: Number.NaN },
    { ...shared, upper: 19 },
    { ...shared, source: "verified" },
  ])
    expect(normalizePlayAgeObservation(bad)).toEqual({ kind: "unavailable" })
})
test("only gives restrictive local hints, keeping declaration/server and approval lifecycle separate", () => {
  for (const [lower, upper, hint] of [
    [0, 12, "under-13"],
    [13, 15, "restrict-free-form"],
    [16, 17, "restrict-free-form"],
    [18, null, "existing-policy"],
    [null, null, "existing-policy"],
    [12, 18, "existing-policy"],
  ] as const)
    expect(
      localPlayAgeHint(
        normalizePlayAgeObservation({ ...shared, lower, upper }),
      ),
    ).toBe(hint)
  expect(
    localPlayAgeHint(
      normalizePlayAgeObservation({
        ...shared,
        lower: 0,
        upper: 12,
        change: "pending",
      }),
    ),
  ).toBe("under-13")
  for (const change of ["pending", "declined"])
    expect(
      localPlayAgeHint(normalizePlayAgeObservation({ ...shared, change })),
    ).toBe("approval-review")
})
test("the real access-first protocol never queries after refusal, mandatory resolution, malformed or unavailable access", async () => {
  for (const access of [
    { kind: "disabled" },
    { kind: "unsupported" },
    { kind: "unknown" },
    { kind: "not-shared" },
    { kind: "verification-required" },
    { kind: "unavailable" },
    { kind: "bogus" },
    shared,
  ]) {
    let queries = 0
    const result = await requestPlayAgeObservation(
      {
        requestAccess: async () => access,
        readShared: async () => {
          queries++
          return shared
        },
      },
      () => true,
    )
    expect(queries).toBe(0)
    expect(result.kind).not.toBe("shared")
  }
  const events: string[] = []
  const value = await requestPlayAgeObservation(
    {
      requestAccess: async () => {
        events.push("access")
        return { kind: "access-shared" }
      },
      readShared: async () => {
        events.push("query")
        return shared
      },
    },
    () => true,
  )
  expect(events).toEqual(["access", "query"])
  expect(value).toEqual(shared)
})
test("stale context before access never prompts", async () => {
  let calls = 0
  const value = await requestPlayAgeObservation(
    {
      requestAccess: async () => {
        calls++
        return { kind: "access-shared" }
      },
      readShared: async () => {
        calls++
        return shared
      },
    },
    () => false,
  )
  expect(value).toEqual({ kind: "unavailable" })
  expect(calls).toBe(0)
})
test("context change after the access prompt prevents the data query", async () => {
  let current = true
  let queries = 0
  const value = await requestPlayAgeObservation(
    {
      requestAccess: async () => {
        current = false
        return { kind: "access-shared" }
      },
      readShared: async () => {
        queries++
        return shared
      },
    },
    () => current,
  )
  expect(value).toEqual({ kind: "unavailable" })
  expect(queries).toBe(0)
})
test("deduplicates in-flight prompts, discards switched-session responses and retains no completed result", async () => {
  let revision = 1
  let calls = 0
  let release: (value: unknown) => void = () => {}
  const reader = createPlayAgeReader({
    contextRevision: () => revision,
    now: () => 123,
    observe: () => {
      calls++
      return new Promise((resolve) => {
        release = resolve
      })
    },
  })
  const first = reader.read()
  expect(reader.read()).toBe(first)
  await Promise.resolve()
  expect(calls).toBe(1)
  revision = 2
  expect((await reader.read()).stale).toBe(true)
  expect(calls).toBe(1)
  release(shared)
  expect(await first).toEqual({
    observation: { kind: "unavailable" },
    provenance: "unattested-client",
    observedAt: 123,
    contextRevision: 1,
    stale: true,
  })
  const next = reader.read()
  await Promise.resolve()
  expect(calls).toBe(2)
  release(shared)
  expect((await next).observation).toEqual(shared)
})
test("explicit invalidation and native exceptions cannot retain age evidence or leak details", async () => {
  let release: (value: unknown) => void = () => {}
  const reader = createPlayAgeReader({
    contextRevision: () => 1,
    observe: () =>
      new Promise((resolve) => {
        release = resolve
      }),
  })
  const first = reader.read()
  await Promise.resolve()
  reader.invalidate()
  release(shared)
  expect((await first).stale).toBe(true)
  const failed = createPlayAgeReader({
    contextRevision: () => 1,
    observe: async () => {
      throw Error("private provider detail")
    },
  })
  expect((await failed.read()).observation).toEqual({ kind: "unavailable" })
})
