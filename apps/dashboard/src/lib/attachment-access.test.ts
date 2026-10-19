import { describe, expect, test } from "bun:test"
import {
  type AttachmentContext,
  attachmentScope,
  checkAttachmentAccess,
} from "./attachment-access"

const context: AttachmentContext = {
  actorUserId: "owner",
  tenant: { id: "business", retailOpsPlanId: "starter" },
  membership: { id: "membership", role: "OWNER" },
  activeStore: { id: "store" },
}
const scope = attachmentScope(context)
const check = (value: AttachmentContext) =>
  checkAttachmentAccess({ read: async () => value, scope, active: () => true })

describe("dashboard attachment access boundaries", () => {
  test("Free locks before media access and distinguishes manager plan review from staff", async () => {
    const free = {
      ...context,
      tenant: { ...context.tenant, retailOpsPlanId: "free" },
    }
    expect(await check(free)).toEqual({ status: "free", canReviewPlan: true })
    expect(
      await check({
        ...free,
        membership: { ...free.membership, role: "CASHIER" },
      }),
    ).toEqual({ status: "free", canReviewPlan: false })
  })

  test("canonical paid plans allow attachments", async () => {
    for (const retailOpsPlanId of ["starter", "growth", "pro"])
      expect(
        (
          await check({
            ...context,
            tenant: { ...context.tenant, retailOpsPlanId },
          })
        ).status,
      ).toBe("allowed")
  })

  test("missing, unfamiliar and unavailable plans fail closed", async () => {
    for (const retailOpsPlanId of [null, undefined, "future-plan"])
      expect(
        await check({
          ...context,
          tenant: { ...context.tenant, retailOpsPlanId },
        }),
      ).toEqual({ status: "unknown", canReviewPlan: false })
    expect(
      (
        await checkAttachmentAccess({
          read: async () => {
            throw Error("offline")
          },
          scope,
          active: () => true,
        })
      ).status,
    ).toBe("unknown")
    expect(
      (
        await checkAttachmentAccess({
          read: async () => context,
          scope: null,
          active: () => true,
        })
      ).status,
    ).toBe("unknown")
  })

  test("a paid picker cannot admit selected files or post after downgrade", async () => {
    let latest = context
    const options = { read: async () => latest, scope, active: () => true }
    expect((await checkAttachmentAccess(options)).status).toBe("allowed")
    latest = {
      ...context,
      tenant: { ...context.tenant, retailOpsPlanId: "free" },
    }
    expect((await checkAttachmentAccess(options)).status).toBe("free")
    expect((await checkAttachmentAccess(options)).status).toBe("free")
  })

  test("changed identity, membership, business or Store retires the original action", async () => {
    for (const changed of [
      { ...context, actorUserId: "other" },
      { ...context, membership: { ...context.membership, id: "other" } },
      { ...context, tenant: { ...context.tenant, id: "other" } },
      { ...context, activeStore: { id: "other" } },
      { ...context, activeStore: null },
    ])
      expect((await check(changed)).status).toBe("stale")
  })

  test("an in-flight read is retired by resource/unmount/session generation changes, including A to B to A", async () => {
    let generation = 0
    let finish: ((value: AttachmentContext) => void) | undefined
    const pending = checkAttachmentAccess({
      read: () =>
        new Promise((resolve) => {
          finish = resolve
        }),
      scope,
      active: () => generation === 0,
    })
    generation += 2
    finish?.(context)
    expect(await pending).toEqual({ status: "stale", canReviewPlan: false })
    let reads = 0
    expect(
      (
        await checkAttachmentAccess({
          read: async () => {
            reads++
            return context
          },
          scope,
          active: () => false,
        })
      ).status,
    ).toBe("stale")
    expect(reads).toBe(0)
  })
})
