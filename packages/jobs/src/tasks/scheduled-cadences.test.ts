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

  test("no cadence ticks more often than every five minutes", () => {
    for (const cadence of Object.values(SCHEDULED_CADENCES))
      expect(cadence.cron).not.toBe("* * * * *")
  })

  test("every periodic step keeps its timing, mode and runs on exactly one cadence", () => {
    const bySteps = new Map<string, string>()
    for (const cadence of Object.values(SCHEDULED_CADENCES))
      for (const step of cadence.steps) {
        expect(bySteps.has(step.id)).toBe(false)
        bySteps.set(step.id, `${cadence.cron} ${step.kind}`)
      }
    expect(Object.fromEntries([...bySteps].sort())).toEqual({
      "account-privacy.notice-alert": "0 * * * * task",
      "account-privacy.retention": "15 2 * * * task",
      "account-privacy.verification-expiry": "15 2 * * * sweep",
      "analytics.dashboard.recovery": "*/15 * * * * task",
      "assistant.attachment.process-recovery": "*/5 * * * * task",
      "assistant.maintenance": "0 * * * * task",
      "auth.phone-otp-expiry": "*/5 * * * * sweep",
      "catalog.photo.cleanup": "0 * * * * task",
      "catalog.photo.review-recovery": "*/15 * * * * task",
      "domains.reconcile": "0 * * * * task",
      "orders.fulfillment-reminders": "0 * * * * task",
      "prescriptions.retention": "15 2 * * * task",
      "service-commerce.booking-reminder-schedule": "*/5 * * * * sweep",
      "service-commerce.customer-notification-schedule": "*/5 * * * * sweep",
      "services.notification.schedule": "*/5 * * * * sweep",
      "staff.invitation.notification-schedule": "*/5 * * * * sweep",
      "store-billing.play-refund-review-alert": "0 * * * * task",
      "store-conversation.credential-expiry": "0 * * * * sweep",
      "store-conversation.notification-schedule": "*/5 * * * * sweep",
      "store-conversation.whatsapp-bridge-schedule": "*/5 * * * * sweep",
      "store-conversation.whatsapp-recovery-schedule": "*/5 * * * * sweep",
      "store-conversations.escalations": "*/15 * * * * sweep",
      "store-conversations.media-safety-recovery": "*/5 * * * * sweep",
    })
  })

  test("disabled features and idle queues start no task runs", async () => {
    const { runCadenceSteps } = await import("./scheduled-cadences")
    const triggered: string[] = []
    const fakeTask = (id: string) => ({
      id,
      trigger: async () => {
        triggered.push(id)
      },
    })
    // A failed work check fails open so the task can report its own error.
    const outcome = await runCadenceSteps([
      { hasWork: () => false, id: "off", kind: "task", task: fakeTask("off") },
      {
        hasWork: async () => {
          throw new Error("db down")
        },
        id: "probe-fails",
        kind: "task",
        task: fakeTask("probe-fails"),
      },
      { id: "sweep", kind: "sweep", run: async () => ({ queued: 0 }) },
    ])
    expect(triggered).toEqual(["probe-fails"])
    expect(outcome).toEqual({
      off: "idle",
      "probe-fails": "started",
      sweep: "swept",
    })
  })
})
