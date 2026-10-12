import { expect, test } from "bun:test"
import { staffInvitationReviewLines } from "./general-staff-invitation"
import type { reviewStaffInvitationCommandInTransaction } from "@ewatrade/db/queries"

test("invitation review shows every original grant and distinguishes saved email from delivery or activation", () => {
  const review = {
    kind: "INVITE",
    recipient: { email: "person@example.test", name: "Person" },
    currentMembership: null,
    proposed: {
      role: "CASHIER",
      status: "INVITED",
      catalogEditor: true,
      defaultStoreId: "store-0",
      assignments: Array.from({ length: 100 }, (_, i) => ({
        storeId: `store-${i}`,
        storeName: `Original Store ${i}`,
        role: i === 99 ? "MANAGER" : "CASHIER",
      })),
    },
    seats: { used: 2, limit: 3, additional: 1, planName: "Starter" },
    blockers: [],
    reviewHash: "a".repeat(64),
    asOf: "2026-10-12T00:00:00Z",
  } satisfies Awaited<
    ReturnType<typeof reviewStaffInvitationCommandInTransaction>
  >
  const lines = staffInvitationReviewLines(review)
  expect(lines).toHaveLength(105)
  expect(lines.join("\n")).toContain("person@example.test")
  expect(lines.join("\n")).toContain(
    "Original Store 0 (store-0) · CASHIER · starting Store",
  )
  expect(lines.join("\n")).toContain("Original Store 99 (store-99) · MANAGER")
  expect(lines.join("\n")).toContain("Catalog editing: allowed")
  expect(lines.join("\n")).toContain("2 used of 3")
  expect(lines.join("\n")).toContain(
    "does not activate staff or create credentials",
  )
  expect(lines.join("\n")).toContain(
    "Saved or queued does not mean sent, delivered or accepted",
  )
})
