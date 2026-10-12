import { describe, expect, test } from "bun:test"
import type { Prisma, PrismaClient, MembershipRole, MembershipStatus } from "../../generated/prisma/client"
import { reviewStaffInvitation, reviewStaffInvitationInTransaction, staffInvitationReviewInput } from "./staff-invitation-review"

const input = {
  tenantId: "tenant", actorUserId: "owner", email: " Amina@Example.com ", name: " Amina ",
  assignments: [{ storeId: "store", role: "CASHIER" as const }], defaultStoreId: "store", catalogEditor: false,
}
function fixture(options: {
  actor?: string | null; existing?: { role: MembershipRole; status: MembershipStatus };
  used?: number; stores?: number; classification?: "QA" | "LIVE";
} = {}) {
  const reads: unknown[] = []
  const tenant = { id: "tenant", name: "Business", slug: "business", createdAt: new Date(), updatedAt: new Date(), metadata: {} }
  const tx = {
    membership: {
      findFirst: async (args: { where: { userId?: string } }) => {
        reads.push(args)
        return args.where.userId ? options.actor === null ? null : { role: options.actor ?? "OWNER" }
          : options.existing ? { id: "existing", staffAccessRevision: 7, ...options.existing } : null
      },
      count: async () => options.used ?? 0,
    },
    tenant: {
      findUnique: async () => ({ dataClassification: options.classification ?? "LIVE", qaSourceDomain: "ishaq.qa.test" }),
      findFirstOrThrow: async () => tenant,
    },
    store: {
      count: async () => options.stores ?? 1,
      findMany: async (args: unknown) => { reads.push(args); return [{ id: "store", name: "Main Store" }] },
    },
    catalogItem: { count: async () => 0 }, commercialOrder: { count: async () => 0 },
    offlineDevice: { findMany: async () => [] }, offlineDeviceRevocation: { findMany: async () => [] },
    subscriptionPlan: { findMany: async () => [] }, tenantSubscription: { findUnique: async () => null },
  } as unknown as Prisma.TransactionClient
  return { tx, reads }
}

describe("canonical invitation review", () => {
  test("normalizes intent, returns named Store/seat impact and never requests email or activation", async () => {
    const f = fixture(), review = await reviewStaffInvitationInTransaction(f.tx, input)
    expect(review.recipient).toEqual({ email: "amina@example.com", name: "Amina" })
    expect(review.proposed).toMatchObject({ role: "CASHIER", status: "INVITED", assignments: [{ storeId: "store", storeName: "Main Store", role: "CASHIER" }] })
    expect(review.seats.additional).toBe(1)
    expect(review.notification.status).toBe("not_requested")
    expect(review.warnings.join(" ")).toContain("does not activate")
    expect(review.warnings.join(" ")).toContain("durable invitation")
    expect(JSON.stringify(review)).not.toMatch(/acceptanceToken|tokenHash|password|session/)
    expect(f.reads).toContainEqual({ where: { tenantId: "tenant", user: { email: "amina@example.com" } }, select: { id: true, role: true, status: true, staffAccessRevision: true } })
  })
  test("fresh Owner/Admin authority required before recipient or Store reads", async () => {
    for (const actor of [null, "MANAGER", "OPERATOR", "CASHIER", "SUPPORT"]) {
      const f = fixture({ actor })
      await expect(reviewStaffInvitationInTransaction(f.tx, input)).rejects.toMatchObject({ code: "FORBIDDEN" })
      expect(f.reads).toHaveLength(1)
    }
  })
  test("current counted invite reuses its seat; a new recipient is blocked at the exact native limit", async () => {
    const fresh = await reviewStaffInvitationInTransaction(fixture({ used: 100 }).tx, input)
    expect(fresh.blockers.some(b => b.code === "STAFF_SEAT_LIMIT")).toBe(true)
    const existing = await reviewStaffInvitationInTransaction(fixture({ used: 100, existing: { role: "CASHIER", status: "INVITED" } }).tx, input)
    expect(existing.seats.additional).toBe(0)
    expect(existing.blockers.some(b => b.code === "STAFF_SEAT_LIMIT")).toBe(false)
    expect(existing.currentMembership?.staffAccessRevision).toBe(7)
    expect(existing.warnings.join(" ")).toContain("invalidates previous pending links")
  })
  test("active staff and nonactive protected roles remain blocked", async () => {
    for (const role of ["OWNER", "ADMIN", "SUPPORT", "MEMBER"] as const) {
      const review = await reviewStaffInvitationInTransaction(fixture({ existing: { role, status: "SUSPENDED" } }).tx, input)
      expect(review.blockers.some(b => b.code === "STAFF_PROTECTED_ROLE")).toBe(true)
    }
    const active = await reviewStaffInvitationInTransaction(fixture({ existing: { role: "CASHIER", status: "ACTIVE" } }).tx, input)
    expect(active.blockers.some(b => b.code === "STAFF_ALREADY_ACTIVE")).toBe(true)
  })
  test("same native assignment and QA identity rules reject invalid proposals", async () => {
    for (const patch of [
      { assignments: [...input.assignments, ...input.assignments] },
      { defaultStoreId: "foreign" }, { catalogEditor: true },
    ]) await expect(reviewStaffInvitationInTransaction(fixture().tx, { ...input, ...patch })).rejects.toMatchObject({ code: "INVALID_INPUT" })
    await expect(reviewStaffInvitationInTransaction(fixture({ stores: 0 }).tx, input)).rejects.toMatchObject({ code: "INVALID_INPUT" })
    await expect(reviewStaffInvitationInTransaction(fixture({ classification: "QA" }).tx, input)).rejects.toThrow("Normal identities cannot join a QA tenant")
    await expect(reviewStaffInvitationInTransaction(fixture().tx, { ...input, email: "qa@ishaq.qa.test" })).rejects.toThrow("QA identities cannot join a live tenant")
  })
  test("strict public input rejects forged authority, links, tokens, empty/oversized grants and unsupported roles", () => {
    const { tenantId, actorUserId, ...publicInput } = input
    expect(staffInvitationReviewInput.parse(publicInput).email).toBe("amina@example.com")
    for (const patch of [{ tenantId }, { actorUserId }, { acceptanceToken: "secret" }, { externalId: "key" }, { url: "https://example.com" }, { email: "invalid" }, { assignments: [] }, { assignments: Array(101).fill(input.assignments[0]) }, { assignments: [{ storeId: "store", role: "OWNER" }] }])
      expect(staffInvitationReviewInput.safeParse({ ...publicInput, ...patch }).success).toBe(false)
  })
  test("root wrapper uses one bounded repeatable read; transaction seam never nests", async () => {
    const f = fixture(); let options: unknown
    const db = { $transaction: async (run: (tx: Prisma.TransactionClient) => Promise<unknown>, value: unknown) => { options = value; return run(f.tx) } } as unknown as PrismaClient
    const review = await reviewStaffInvitation(db, input)
    expect(review.notification.status).toBe("not_requested")
    expect(options).toEqual({ isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 })
  })
})
