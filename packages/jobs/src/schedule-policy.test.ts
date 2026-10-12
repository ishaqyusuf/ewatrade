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
})
