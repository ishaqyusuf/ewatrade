import { describe, expect, test } from "bun:test"
import { automaticJobCron } from "./schedule-policy"

describe("automatic job schedules", () => {
  test("Preview registers no automatic cron while Production retains its schedule", () => {
    for (const pattern of [
      "* * * * *",
      "*/5 * * * *",
      "*/15 * * * *",
      "0 * * * *",
      "15 2 * * *",
    ]) {
      expect(automaticJobCron(pattern, "preview")).toBeUndefined()
      expect(automaticJobCron(pattern, "production")).toBe(pattern)
      expect(automaticJobCron(pattern, "local")).toBe(pattern)
    }
  })
})
