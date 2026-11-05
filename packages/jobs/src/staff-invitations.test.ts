import { beforeEach, expect, mock, test } from "bun:test"
import { fileURLToPath } from "node:url"
import type { RetailOpsStaffInvitedPayload } from "@ewatrade/notifications"

const handler = mock(async (_payload: unknown, _attempt: number) => {})
mock.module("./handlers/notification-dispatch", () => ({
  notificationDispatchHandler: handler,
}))
const { enqueueRetailOpsStaffInviteNotification } = await import(
  "@ewatrade/jobs/staff-invitations"
)
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
  handler.mockClear()
})

test("an invite email is sent in the request with no Trigger run", async () => {
  await enqueueRetailOpsStaffInviteNotification(input)
  expect(handler).toHaveBeenCalledTimes(1)
  expect(handler.mock.calls[0]).toEqual([
    { type: "retail_ops_staff_invited", payload: input },
    1,
  ])
})

test("a failed invite email never fails the saved invite", async () => {
  handler.mockImplementationOnce(async () => {
    throw new Error("inert send failure")
  })
  await expect(
    enqueueRetailOpsStaffInviteNotification(input),
  ).resolves.toBeUndefined()
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
      // Bun 1.3.9's bundler cannot resolve email's `../defaults` under
      // `bun test` in this repo (it can from a script). Email templates never
      // import jobs, so leaving them out does not hide a registry import.
      "@ewatrade/email",
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
