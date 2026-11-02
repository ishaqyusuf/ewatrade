import { beforeEach, expect, mock, test } from "bun:test"
import { fileURLToPath } from "node:url"
import type { RetailOpsStaffInvitedPayload } from "@ewatrade/notifications"

const handler = async () => {}
const trigger = mock(
  async (_id: string, _handler: unknown, _payload: unknown) => {},
)
mock.module("./handlers/notification-dispatch", () => ({
  notificationDispatchHandler: handler,
}))
const triggerOnce = mock(
  async (_id: string, _payload: unknown, _options: unknown) => true,
)
mock.module("./trigger", () => ({
  triggerJob: trigger,
  triggerTaskOnce: triggerOnce,
}))
const {
  enqueueRetailOpsStaffInviteNotification,
  enqueueStaffInvitationNotificationDispatch,
  staffInvitationDispatchKey,
} = await import("@ewatrade/jobs/staff-invitations")
const input: RetailOpsStaffInvitedPayload = {
  appUrl: "https://example.invalid",
  businessName: "Inert business",
  inviteUrl: "https://example.invalid/staff-onboarding?token=inert",
  invitedByName: "Inert inviter",
  inviteeEmail: "staff@example.invalid",
  inviteeName: "Inert staff",
  membershipId: "membership",
  role: "CASHIER",
}
beforeEach(() => {
  trigger.mockClear()
  triggerOnce.mockClear()
})

test("a saved invitation starts one ID-only dispatch run keyed per notification attempt", async () => {
  expect(
    await enqueueStaffInvitationNotificationDispatch({
      tenantId: "tenant",
      notificationId: "notification",
    }),
  ).toBe(true)
  expect(triggerOnce.mock.calls).toEqual([
    [
      "staff.invitation.notification-dispatch",
      { tenantId: "tenant", notificationId: "notification" },
      {
        delay: undefined,
        idempotencyKey: "staff-invitation:notification:attempt:1",
        idempotencyKeyTTL: "10m",
      },
    ],
  ])
  const runAt = new Date("2026-11-02T10:01:05Z")
  await enqueueStaffInvitationNotificationDispatch({
    tenantId: "tenant",
    notificationId: "notification",
    attempt: 2,
    runAt,
  })
  expect(triggerOnce.mock.calls[1]?.[2]).toEqual({
    delay: runAt,
    idempotencyKey: "staff-invitation:notification:attempt:2",
    idempotencyKeyTTL: "10m",
  })
  expect(
    staffInvitationDispatchKey({ notificationId: "n", attempt: 3 }),
  ).not.toBe(staffInvitationDispatchKey({ notificationId: "n", attempt: 2 }))
})

test("without Trigger the dispatch reports not queued and the outbox stays pending", async () => {
  triggerOnce.mockImplementationOnce(async () => false)
  expect(
    await enqueueStaffInvitationNotificationDispatch({
      tenantId: "tenant",
      notificationId: "notification",
    }),
  ).toBe(false)
})

test("public invitation producer preserves the canonical job, handler and unchanged payload", async () => {
  await enqueueRetailOpsStaffInviteNotification(input)
  expect(trigger).toHaveBeenCalledTimes(1)
  expect(trigger.mock.calls[0]).toEqual([
    "notifications.dispatch",
    handler,
    { type: "retail_ops_staff_invited", payload: input },
  ])
  expect((trigger.mock.calls[0]?.[2] as { payload: unknown }).payload).toBe(
    input,
  )
})

test("enqueue rejection propagates instead of reporting a successful invitation notification", async () => {
  const source = new Error("inert enqueue failure")
  trigger.mockImplementationOnce(async () => {
    throw source
  })
  await expect(enqueueRetailOpsStaffInviteNotification(input)).rejects.toBe(
    source,
  )
  expect(trigger).toHaveBeenCalledTimes(1)
})

test("public producer build graph excludes the worker registry and unrelated media/domain handlers", async () => {
  const result = await Bun.build({
    entrypoints: [
      fileURLToPath(import.meta.resolve("@ewatrade/jobs/staff-invitations")),
    ],
    target: "bun",
    metafile: true,
    external: [
      "sharp",
      "libheif-js",
      "@napi-rs/canvas",
      "pdfjs-dist",
      "pdfjs-dist/*",
      "@trigger.dev/*",
      "@sentry/*",
    ],
  })
  expect(result.success).toBe(true)
  if (!result.metafile) throw new Error("Missing import graph")
  const meta =
    typeof result.metafile === "string"
      ? JSON.parse(result.metafile)
      : result.metafile
  const paths = Object.keys(meta.inputs)
  expect(paths.some((path) => /jobs\/src\/index\.ts$/.test(path))).toBe(false)
  expect(
    paths.some((path) =>
      /jobs\/src\/handlers\/(manual-payment-receipt|prescription-|service-commerce-|store-conversation-|domain-)/.test(
        path,
      ),
    ),
  ).toBe(false)
  expect(
    paths.some((path) =>
      /private-media\/src\/local-test-object-port/.test(path),
    ),
  ).toBe(false)
  expect(
    paths.some((path) =>
      /jobs\/src\/handlers\/notification-dispatch\.ts$/.test(path),
    ),
  ).toBe(true)
})
