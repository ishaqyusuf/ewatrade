import { expect, test } from "bun:test"
import { capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import type { Capability } from "@ewatrade/assistant/capabilities/types"
import { TRPCError } from "@trpc/server"
import { assertLinkedAssistantRead } from "./channel-read-policy"

// Fixed audited scope: source modules and native routes do not promote these capabilities.
const plannedReads = [
  {
    id: "staff.access.review",
    tool: "reviewStaffAccess",
    paths: ["retailOps.staffStoreAccessReview"],
  },
  {
    id: "staff.access.receipt.read",
    tool: "readStaffAccessReceipt",
    paths: ["retailOps.staffAccessReceipt"],
  },
  {
    id: "staff.status.review",
    tool: "reviewStaffStatus",
    paths: ["retailOps.staffStatusReview"],
  },
  {
    id: "staff.status.receipt.read",
    tool: "readStaffStatusReceipt",
    paths: ["retailOps.staffStatusReceipt"],
  },
  {
    id: "staff.invitations.read",
    tool: "readStaffInvitations",
    paths: ["retailOps.staffInvitations"],
  },
  {
    id: "staff.invitation.command.read",
    tool: "readStaffInvitationCommand",
    paths: ["retailOps.staffInvitationCommand"],
  },
  {
    id: "staff.invitation.review",
    tool: "reviewStaffInvitation",
    paths: ["retailOps.staffInvitationReview"],
  },
  {
    id: "staff.history.read",
    tool: "readStaffHistory",
    paths: ["retailOps.staffHistoryPage"],
  },
  {
    id: "staff.activity.read",
    tool: "readStaffActivity",
    paths: ["retailOps.staffActivityPage", "retailOps.staffActivityShown"],
  },
  {
    id: "staff.directory.read",
    tool: "readStaffDirectory",
    paths: ["retailOps.staffDirectoryPage"],
  },
  {
    id: "staff.member.read",
    tool: "readStaffMember",
    paths: ["retailOps.staffDirectoryMember"],
  },
  {
    id: "settings.store.read",
    tool: "readStoreSettings",
    paths: [
      "orders.receiptSettings",
      "orders.reminderSettings",
      "stores.orderVisibility",
    ],
  },
  {
    id: "sales.items.report",
    tool: "readItemSalesReport",
    paths: ["businessReporting.itemSales"],
  },
  {
    id: "sales.collections.report",
    tool: "readPaymentCollectionsReport",
    paths: ["businessReporting.paymentCollections"],
  },
  {
    id: "customers.debt.report",
    tool: "readCustomerDebtReport",
    paths: ["businessReporting.customerDebt"],
  },
  {
    id: "finance.supplier_aging.report",
    tool: "readSupplierAgingReport",
    paths: ["businessReporting.supplierAging"],
  },
  {
    id: "finance.posted_profit.report",
    tool: "readPostedProfitReport",
    paths: ["businessReporting.postedProfit"],
  },
  {
    id: "inventory.stock.report",
    tool: "readStockReport",
    paths: ["businessReporting.stock"],
  },
] satisfies readonly { id: string; tool: string; paths: readonly string[] }[]

test("W23 has no eligible staff/settings/activity or G01 report reads; exact planned gates remain", () => {
  const expectedIds = plannedReads.map((read) => read.id).sort()
  const actual: Capability[] = capabilityManifest.filter(
    (capability) =>
      capability.mode === "read" &&
      (capability.domain === "staff" ||
        capability.id === "settings.store.read" ||
        capability.id.endsWith(".report")),
  )
  expect<string[]>(actual.map((capability) => capability.id).sort()).toEqual(
    expectedIds,
  )
  expect(
    actual.filter((capability) => capability.rollout !== "planned"),
  ).toEqual([])
  for (const expected of plannedReads) {
    const capability = actual.find((entry) => entry.id === expected.id)
    if (!capability) throw Error(`Missing planned read ${expected.id}`)
    expect<string | undefined>(capability.tool).toBe(expected.tool)
    expect<readonly string[]>(capability.procedures).toEqual(expected.paths)
    expect(capability.rollout).toBe("planned")
    expect(capability.whatsapp?.rollout ?? "planned").toBe("planned")
  }
})

test("Owner and all local channel flags cannot authorize planned canonical read paths", () => {
  const environment = {
    APP_ENV: "local",
    NODE_ENV: "test",
    ASSISTANT_WHATSAPP_ENABLED: "true",
    ASSISTANT_WHATSAPP_READS_ENABLED: "true",
    ASSISTANT_WHATSAPP_WRITES_ENABLED: "true",
    ASSISTANT_WHATSAPP_MEDIA_ENABLED: "true",
  }
  for (const capability of plannedReads)
    for (const path of capability.paths) {
      let rejection: unknown
      try {
        assertLinkedAssistantRead(
          { capabilityId: capability.id, path, type: "query", role: "OWNER" },
          environment,
        )
      } catch (error) {
        rejection = error
      }
      expect(rejection).toBeInstanceOf(TRPCError)
      if (!(rejection instanceof TRPCError))
        throw Error(
          `Planned read unexpectedly authorized: ${capability.id}/${path}`,
        )
      expect(rejection.code).toBe("FORBIDDEN")
    }
})
