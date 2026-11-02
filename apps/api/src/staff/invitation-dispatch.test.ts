import { describe, expect, mock, test } from "bun:test"
import {
  dispatchStaffInvitationNotification,
  dispatchStaffInvitationProposalEmail,
} from "./invitation-dispatch"

const identity = { tenantId: "tenant", notificationId: "notification" }
function db(row: { tenantId: string; id: string } | null) {
  const findFirst = mock(async (_args: unknown) => row)
  return { findFirst, db: { staffInvitationNotification: { findFirst } } }
}
const completed = {
  status: "COMPLETED",
  receipt: { kind: "staff_invitation", recordId: "command" },
}

describe("post-commit staff invitation dispatch", () => {
  test("a committed command starts its first dispatch with the saved identity", async () => {
    const enqueue = mock(async (_input: unknown) => true)
    await dispatchStaffInvitationNotification(identity, enqueue)
    expect(enqueue.mock.calls).toEqual([[identity]])
  })
  test("an enqueue failure never fails the saved command; the outbox stays for the sweeper", async () => {
    const enqueue = mock(async () => {
      throw Error("trigger unavailable")
    })
    await expect(
      dispatchStaffInvitationNotification(identity, enqueue),
    ).resolves.toBeUndefined()
  })
  test("assistant confirmation dispatches only a never-attempted invitation email", async () => {
    const enqueue = mock(async (_input: unknown) => true)
    const pending = db({ tenantId: "tenant", id: "notification" })
    await dispatchStaffInvitationProposalEmail(
      pending.db as never,
      { tenantId: "tenant", proposal: completed },
      enqueue,
    )
    expect(pending.findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { tenantId: "tenant", commandId: "command", attemptCount: 0 },
    })
    expect(enqueue.mock.calls).toEqual([[identity]])
  })
  test("replays, revocations, other actions and cancelled drafts start no run", async () => {
    const enqueue = mock(async (_input: unknown) => true)
    const replay = db(null)
    await dispatchStaffInvitationProposalEmail(
      replay.db as never,
      { tenantId: "tenant", proposal: completed },
      enqueue,
    )
    const other = db({ tenantId: "tenant", id: "notification" })
    for (const proposal of [
      { status: "CANCELLED", receipt: null },
      {
        status: "COMPLETED",
        receipt: { kind: "expense_record", recordId: "x" },
      },
    ])
      await dispatchStaffInvitationProposalEmail(
        other.db as never,
        { tenantId: "tenant", proposal },
        enqueue,
      )
    expect(other.findFirst).not.toHaveBeenCalled()
    expect(enqueue).not.toHaveBeenCalled()
  })
  test("a lookup failure after commit is deferred to recovery, not thrown", async () => {
    const enqueue = mock(async (_input: unknown) => true)
    const failing = {
      staffInvitationNotification: {
        findFirst: async () => {
          throw Error("db unavailable")
        },
      },
    }
    await expect(
      dispatchStaffInvitationProposalEmail(
        failing as never,
        { tenantId: "tenant", proposal: completed },
        enqueue,
      ),
    ).resolves.toBeUndefined()
    expect(enqueue).not.toHaveBeenCalled()
  })
})
