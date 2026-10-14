import { afterEach, expect, test } from "bun:test"
import { BusinessActivityError } from "@ewatrade/db/queries"
import { withBusinessActivityAvailability } from "./business-activity-availability"

const originalAppEnv = process.env.APP_ENV
const originalNodeEnv = process.env.NODE_ENV

afterEach(() => {
  if (originalAppEnv === undefined)
    Reflect.deleteProperty(process.env, "APP_ENV")
  else process.env.APP_ENV = originalAppEnv
  if (originalNodeEnv === undefined)
    Reflect.deleteProperty(process.env, "NODE_ENV")
  else process.env.NODE_ENV = originalNodeEnv
})

test("unreleased environments refuse Activity before database or delivery work", async () => {
  let effects = 0
  for (const appEnv of [
    undefined,
    "preview",
    "production",
    "test",
    "local",
    "dev",
  ]) {
    for (const nodeEnv of [undefined, "production", "test", "development"]) {
      if (
        ["local", "dev"].includes(appEnv ?? "") &&
        (nodeEnv === undefined || nodeEnv === "development")
      )
        continue
      if (appEnv === undefined) Reflect.deleteProperty(process.env, "APP_ENV")
      else process.env.APP_ENV = appEnv
      if (nodeEnv === undefined) Reflect.deleteProperty(process.env, "NODE_ENV")
      else process.env.NODE_ENV = nodeEnv
      await expect(
        withBusinessActivityAvailability(async () => {
          effects += 1
        }),
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
    }
  }
  expect(effects).toBe(0)
})

test("explicit local and dev profiles support Bun's unset NODE_ENV and preserve each result", async () => {
  const result = { count: 3 }
  let effects = 0
  for (const appEnv of ["local", "dev"]) {
    process.env.APP_ENV = appEnv
    for (const nodeEnv of [undefined, "development"]) {
      if (nodeEnv === undefined) Reflect.deleteProperty(process.env, "NODE_ENV")
      else process.env.NODE_ENV = nodeEnv
      expect(
        await withBusinessActivityAvailability(async () => {
          effects += 1
          return result
        }),
      ).toBe(result)
    }
  }
  expect(effects).toBe(4)
})

test("domain refusals preserve their public code and diagnostic cause", async () => {
  process.env.APP_ENV = "local"
  process.env.NODE_ENV = "development"
  for (const code of [
    "FORBIDDEN",
    "NOT_FOUND",
    "BAD_REQUEST",
    "CONFLICT",
  ] as const) {
    const refusal = new BusinessActivityError(code, "Activity unavailable")
    await expect(
      withBusinessActivityAvailability(async () => {
        throw refusal
      }),
    ).rejects.toMatchObject({ code, message: refusal.message, cause: refusal })
  }
})

test("unexpected failures propagate without being mislabeled as access refusal", async () => {
  process.env.APP_ENV = "local"
  process.env.NODE_ENV = "development"
  const failure = new Error("Connection unavailable")
  await expect(
    withBusinessActivityAvailability(async () => {
      throw failure
    }),
  ).rejects.toBe(failure)
})
