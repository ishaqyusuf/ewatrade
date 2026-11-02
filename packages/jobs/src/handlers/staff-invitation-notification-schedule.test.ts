import { describe, expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import {
  type StaffInvitationScheduleDependencies,
  runStaffInvitationNotificationSchedule,
} from "./staff-invitation-notification-schedule"

const config = {
  EMAIL_DELIVERY_MODE: "live",
  EMAIL_FROM: "invite@example.com",
  RESEND_API_KEY: "provider-free-test-value",
  STAFF_INVITATION_ENCRYPTION_KEY_ID: "ephemeral-test",
  STAFF_INVITATION_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
}

describe("staff invitation outbox discovery", () => {
  test("bounded overdue-only discovery projects identities with their next attempt and awaits every enqueue", async () => {
    const now = new Date("2026-10-12T12:00:00Z")
    const calls: unknown[] = []
    const deps: StaffInvitationScheduleDependencies = {
      listDue: async (input) => {
        calls.push(input)
        return [
          { tenantId: "tenant-a", id: "one", attemptCount: 0 },
          { tenantId: "tenant-b", id: "two", attemptCount: 2 },
        ]
      },
      enqueue: async (input) => {
        calls.push(input)
      },
    }
    expect(
      await runStaffInvitationNotificationSchedule(config, deps, now),
    ).toEqual({ notificationsQueued: 2 })
    expect(calls).toEqual([
      { limit: 100, now, overdueMs: 15 * 60_000 },
      { tenantId: "tenant-a", notificationId: "one", attempt: 1 },
      { tenantId: "tenant-b", notificationId: "two", attempt: 3 },
    ])
  })
  test("partial enqueue failure is reported without private errors and remaining submissions finish", async () => {
    const queued: string[] = []
    await expect(
      runStaffInvitationNotificationSchedule(config, {
        listDue: async () => [
          { tenantId: "tenant", id: "one", attemptCount: 0 },
          { tenantId: "tenant", id: "two", attemptCount: 0 },
        ],
        enqueue: async ({ notificationId }) => {
          queued.push(notificationId)
          if (notificationId === "one") throw Error("private queue context")
        },
      }),
    ).rejects.toThrow("Could not queue 1 staff invitation notification(s).")
    expect(queued).toEqual(["one", "two"])
  })
  test("incomplete live configuration leaves pending outbox unclaimed and undiscovered", async () => {
    let calls = 0
    const deps: StaffInvitationScheduleDependencies = {
      listDue: async () => {
        calls++
        return []
      },
      enqueue: async () => {
        calls++
      },
    }
    for (const patch of [
      { EMAIL_DELIVERY_MODE: "console" },
      { RESEND_API_KEY: "" },
      { STAFF_INVITATION_ENCRYPTION_KEY: "" },
      { STAFF_INVITATION_DECRYPTION_KEYS: "not-json" },
    ])
      expect(
        await runStaffInvitationNotificationSchedule(
          { ...config, ...patch },
          deps,
        ),
      ).toEqual({
        deliveryConfigured: false,
        notificationsQueued: 0,
      })
    expect(calls).toBe(0)
  })
})
