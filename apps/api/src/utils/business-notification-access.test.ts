import { expect, test } from "bun:test"
import { staffProcedureAction } from "./staff-procedure-policy"
import {
  type StaffRequestContext,
  scopeStaffRequest,
} from "./staff-request-access"

test("personal alert operations are exactly bounded; business configuration is never staff access", async () => {
  const ctx: StaffRequestContext = {
    // This test exercises the early middleware boundary; protected DB queries repeat identity/domain authority.
    db: {} as StaffRequestContext["db"],
    tenantContext: {
      tenant: { id: "business" },
      activeStore: null,
      staffAccess: {
        mode: "SCOPED",
        businessRole: "CASHIER",
        status: "ACTIVE",
        assignments: [],
      },
    } as unknown as StaffRequestContext["tenantContext"],
  }
  for (const path of [
    "businessNotifications.listMine",
    "businessNotifications.unreadCount",
    "businessNotifications.myPreferences",
  ]) {
    expect(staffProcedureAction(path, "query")).toBe("read")
    expect(staffProcedureAction(path, "mutation")).toBeNull()
    expect(
      await scopeStaffRequest(ctx, path, "query", undefined),
    ).toBeUndefined()
  }
  for (const path of [
    "businessNotifications.markRead",
    "businessNotifications.archive",
    "businessNotifications.markAllRead",
    "businessNotifications.updateMyPreferences",
  ]) {
    expect(staffProcedureAction(path, "mutation")).toBe("read")
    expect(staffProcedureAction(path, "query")).toBeNull()
    expect(
      await scopeStaffRequest(ctx, path, "mutation", { receiptIds: ["own"] }),
    ).toEqual({ receiptIds: ["own"] })
  }
  for (const path of [
    "businessNotifications.policy",
    "businessNotifications.subscriptions",
    "businessNotifications.updatePolicy",
    "businessNotifications.updateSubscription",
    "businessNotifications.record",
    "activity.listPage",
  ]) {
    await expect(
      scopeStaffRequest(
        ctx,
        path,
        path.includes("update") ? "mutation" : "query",
        {},
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  }
})
