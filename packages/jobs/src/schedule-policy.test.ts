import { describe, expect, test } from "bun:test"
import { automaticJobCron } from "./schedule-policy"

describe("automatic job schedules", () => {
  test("only Production registers automatic cron unless a local session opts in", () => {
    for (const pattern of [
      "*/5 * * * *",
      "*/15 * * * *",
      "0 * * * *",
      "15 2 * * *",
    ]) {
      expect(automaticJobCron(pattern, "production")).toBe(pattern)
      expect(automaticJobCron(pattern, "preview")).toBeUndefined()
      expect(automaticJobCron(pattern, "preview", "true")).toBeUndefined()
      expect(automaticJobCron(pattern, "local")).toBeUndefined()
      expect(automaticJobCron(pattern, "dev")).toBeUndefined()
      expect(automaticJobCron(pattern, "dev", "true")).toBe(pattern)
    }
  })

  test("prelaunch opt-in slows recovery while preserving hourly and daily retention", () => {
    expect(
      automaticJobCron("*/5 * * * *", "production", undefined, "prelaunch"),
    ).toBe("*/30 * * * *")
    expect(
      automaticJobCron("*/15 * * * *", "production", undefined, "prelaunch"),
    ).toBeUndefined()
    for (const pattern of ["0 * * * *", "15 2 * * *"])
      expect(
        automaticJobCron(pattern, "production", undefined, "prelaunch"),
      ).toBe(pattern)
    expect(
      automaticJobCron("*/5 * * * *", "production", undefined, "standard"),
    ).toBe("*/5 * * * *")
    expect(
      automaticJobCron("*/5 * * * *", "preview", "true", "prelaunch"),
    ).toBeUndefined()
    expect(
      automaticJobCron("*/5 * * * *", "local", undefined, "prelaunch"),
    ).toBeUndefined()
  })

  test("a mistyped active schedule mode refuses rather than silently changing timers", () => {
    expect(() =>
      automaticJobCron("*/5 * * * *", "production", undefined, "pre-launch"),
    ).toThrow("JOB_SCHEDULE_MODE")
  })
})
