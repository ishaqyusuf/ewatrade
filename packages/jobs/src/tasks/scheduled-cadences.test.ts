import { describe, expect, test } from "bun:test"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { SCHEDULED_CADENCES } from "./scheduled-cadences"

const TASKS_DIR = import.meta.dir
// The Trigger.dev plan allows 10 declared schedules; keep headroom.
const MAX_DECLARED_SCHEDULES = 6

describe("scheduled cadences", () => {
  test("only the cadence file declares schedules, within the plan limit", () => {
    const declaring = readdirSync(TASKS_DIR)
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .filter((file) =>
        readFileSync(join(TASKS_DIR, file), "utf8").includes("schedules.task("),
      )
    expect(declaring).toEqual(["scheduled-cadences.ts"])
    expect(Object.keys(SCHEDULED_CADENCES).length).toBeLessThanOrEqual(
      MAX_DECLARED_SCHEDULES,
    )
  })

  test("every periodic task keeps its timing and runs on exactly one cadence", () => {
    const byTask = new Map<string, string>()
    for (const cadence of Object.values(SCHEDULED_CADENCES))
      for (const task of cadence.tasks) {
        expect(byTask.has(task.id)).toBe(false)
        byTask.set(task.id, cadence.cron)
      }
    expect(Object.fromEntries([...byTask].sort())).toEqual({
      "account-privacy.notice-alert": "*/15 * * * *",
      "account-privacy.verification-expiry": "0 * * * *",
      "assistant.attachment.process-recovery": "* * * * *",
      "catalog.photo.cleanup": "*/5 * * * *",
      "catalog.photo.review-recovery": "* * * * *",
      "domains.reconcile": "*/15 * * * *",
      "orders.fulfillment-reminders": "0 * * * *",
      "prescriptions.retention": "15 2 * * *",
      "service-commerce.booking-reminder-schedule": "*/5 * * * *",
      "service-commerce.customer-notification-schedule": "*/5 * * * *",
      "services.notification.schedule": "*/5 * * * *",
      "store-billing.play-refund-review-alert": "*/15 * * * *",
      "store-conversation.credential-expiry": "0 * * * *",
      "store-conversation.notification-schedule": "* * * * *",
      "store-conversation.whatsapp-bridge-schedule": "* * * * *",
      "store-conversation.whatsapp-recovery-schedule": "* * * * *",
      "store-conversations.escalations": "* * * * *",
      "store-conversations.media-safety-recovery": "*/5 * * * *",
    })
  })
})
