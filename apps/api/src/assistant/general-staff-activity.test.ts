import { expect, test } from "bun:test"
import { capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import { generalAnswerSchema } from "@ewatrade/assistant/general/contracts"
import {
  generalStaffActivityAnswer,
  generalStaffActivityInput,
  readFittedStaffActivityPage,
  staffActivityFitCount,
} from "./general-staff-activity"

const day = {
  from: "2026-10-12T00:00:00+01:00",
  to: "2026-10-13T00:00:00+01:00",
}
const actor = {
  coverage: "available" as const,
  membershipId: "amina-m",
  userId: "amina-u",
  name: "Amina",
}
const payment = {
  id: "p-1",
  at: "2026-10-12T13:05:00.000Z",
  stream: "PAYMENT" as const,
  relation: "PERFORMED" as const,
  store: { id: "store-a", name: "Wuse" },
  actor,
  record: {
    kind: "payment" as const,
    id: "p-1",
    orderId: "o-1",
    label: "ORD-1042",
  },
  outcome: "Payment recorded · cash",
  amount: { minor: 520_000, currencyCode: "NGN" },
}
type Page = Parameters<typeof generalStaffActivityAnswer>[0]
const page: Page = {
  data: [
    {
      id: "p-1",
      at: "2026-10-12T13:05:00.000Z",
      stream: "PAYMENT" as const,
      relation: "PERFORMED" as const,
      store: { id: "store-a", name: "Wuse" },
      actor,
      record: {
        kind: "payment" as const,
        id: "p-1",
        orderId: "o-1",
        label: "ORD-1042",
      },
      outcome: "Payment recorded · cash",
      amount: { minor: 520_000, currencyCode: "NGN" },
    },
    {
      id: "auth-1",
      at: "2026-10-12T09:00:00.000Z",
      stream: "SERVICE_AUTHORIZATION" as const,
      relation: "APPROVED" as const,
      store: { id: "store-a", name: "Wuse" },
      actor,
      record: { kind: "order" as const, id: "o-2", label: "ORD-1043" },
      outcome: "Service approved · quantity 1",
      amount: null,
    },
    {
      id: "pc-1",
      at: "2026-10-12T07:00:00.000Z",
      stream: "PRICE_CHANGE" as const,
      relation: "PERFORMED" as const,
      store: null,
      actor: {
        coverage: "unknown" as const,
        membershipId: null,
        userId: null,
        name: null,
      },
      record: {
        kind: "product" as const,
        id: "item-rice",
        offeringId: "off-rice",
        label: "Rice 50kg",
      },
      outcome: "Price set",
      amount: null,
    },
  ],
  total: 14,
  byStream: { PAYMENT: 9, SERVICE_AUTHORIZATION: 4, PRICE_CHANGE: 1 },
  nextCursor: "next",
  asOf: "2026-10-12T15:00:00.000Z",
  period: day,
  scope: "business" as const,
  coverage: {
    streams: ["PAYMENT" as const],
    excluded: [],
    unknownActors: true,
    notIncluded: [
      "finance_actions",
      "sign_in_and_device_activity",
      "attendance_and_payroll",
    ],
    detail: "Only canonical records with a recorded actor are shown.",
  },
}

test("staff activity input is bounded and never accepts scope from the model", () => {
  for (const input of [
    { ...day, tenantId: "foreign" },
    { ...day, viewerUserId: "owner" },
    { ...day, storeIds: null },
    { from: "2026-10-12", to: "2026-10-13" },
    { from: "2026-01-01T00:00:00Z", to: "2026-10-12T00:00:00Z" },
    { ...day, catalogItemId: "item-rice" },
  ])
    expect(generalStaffActivityInput.safeParse(input).success).toBe(false)
  expect(generalStaffActivityInput.safeParse(day).success).toBe(true)
  const capability = capabilityManifest.find(
    (entry) => entry.id === "staff.activity.read",
  )
  expect(capability).toMatchObject({
    rollout: "planned",
    tool: "readStaffActivity",
    procedures: ["retailOps.staffActivityPage", "retailOps.staffActivityShown"],
    policy: { roles: ["OWNER", "ADMIN", "MANAGER"] },
  })
})

test("the answer counts every record, separates relations and keeps unknown actors unattributed", () => {
  const answer = generalStaffActivityAnswer(page, day)
  expect(generalAnswerSchema.safeParse(answer).success).toBe(true)
  expect(answer.value).toBe("14 recorded actions")
  expect(answer.scope).toContain("Business · every Store")
  const lines = answer.detail.split("\n")
  // Local time in the request's own offset (+01:00).
  expect(lines[0]).toBe(
    "14:05 · Amina did: Payment recorded · cash · ORD-1042 · Wuse",
  )
  expect(lines[1]).toBe(
    "10:00 · Amina approved: Service approved · quantity 1 · ORD-1043 · Wuse",
  )
  expect(lines[2]).toBe(
    "08:00 · Unknown (not recorded) did: Price set · Rice 50kg",
  )
  expect(answer.detail).toContain("not this page")
  expect(answer.detail).toContain("not counted for anyone")
  expect(answer.detail).not.toContain("Only actions recorded with a person")
})

test("every record on the page is shown whole, with honest counts and notes", () => {
  const ten = {
    ...page,
    data: Array.from({ length: 10 }, (_, index) => ({
      ...payment,
      id: `p-${index}`,
      record: { ...payment.record, label: `ORD-${index}` },
    })),
  }
  const answer = generalStaffActivityAnswer(ten, day)
  const lines = answer.detail.split("\n")
  expect(lines.filter((value) => /^\d{2}:\d{2} ·/.test(value))).toHaveLength(10)
  for (let index = 0; index < 10; index++)
    expect(answer.detail).toContain(`ORD-${index}`)
  expect(answer.detail).toContain(
    "10 of 14 shown; ask to continue for the rest. The total counts every matching record",
  )
  // Long canonical text shrinks per line; records and notes are never cut off.
  const long = generalStaffActivityAnswer(
    {
      ...ten,
      data: ten.data.map((row) => ({ ...row, outcome: "x".repeat(400) })),
    },
    day,
  )
  expect(long.detail.length).toBeLessThanOrEqual(1000)
  expect(generalAnswerSchema.safeParse(long).success).toBe(true)
  for (let index = 0; index < 10; index++)
    expect(long.detail).toContain(`ORD-${index}`)
  expect(long.detail).toContain("The total counts every matching record")
  // Finance stays disclosed until Book-scoped finance history exists.
  expect(long.detail).toContain(
    "Finance actions, sign-ins, attendance and payroll are not included.",
  )
  expect(long.detail).toContain("not counted for anyone")
})

test("long Product labels are never cut; the tool reads fewer rows so none are skipped", async () => {
  type Row = Parameters<typeof generalStaffActivityAnswer>[0]["data"][number]
  const priceChange = (index: number): Row => ({
    id: `pc-${index}`,
    at: "2026-10-12T07:00:00.000Z",
    stream: "PRICE_CHANGE",
    relation: "PERFORMED",
    store: null,
    actor,
    record: {
      kind: "product",
      id: `item-${index}`,
      offeringId: `off-${index}`,
      // Canonical names allow 120 characters; only the suffix differs.
      label: `${"Premium long-grain parboiled rice 50kg bag ".repeat(3).slice(0, 112)} No. ${String(index).padStart(3, "0")}`,
    },
    outcome: "Price changed from 5000000 to 5200000 (minor units)",
    amount: { minor: 5_200_000, currencyCode: "NGN" },
  })
  const rows = Array.from({ length: 10 }, (_, index) => priceChange(index))
  const ten = { ...page, data: rows }
  const fit = staffActivityFitCount(ten, day)
  expect(fit).toBeGreaterThan(0)
  expect(fit).toBeLessThan(10)
  // Given too many, the card shows only whole records and says so.
  const direct = generalStaffActivityAnswer(ten, day)
  expect(direct.detail.length).toBeLessThanOrEqual(1000)
  for (const row of rows.slice(0, fit))
    expect(direct.detail).toContain(row.record.label)
  expect(direct.detail).toContain("Some records did not fit this card")
  // The tool asks again for exactly what fits, so its cursor follows the last
  // record shown and the next page starts at the first one not shown.
  const limits: number[] = []
  const fitted = await readFittedStaffActivityPage(async (limit) => {
    limits.push(limit)
    return {
      ...ten,
      data: rows.slice(0, limit),
      nextCursor: `after-${limit - 1}`,
    }
  }, day)
  expect(limits).toEqual([10, fit])
  expect(fitted.data).toHaveLength(fit)
  expect(fitted.nextCursor).toBe(`after-${fit - 1}`)
  const answer = generalStaffActivityAnswer(fitted, day)
  for (const row of fitted.data)
    expect(answer.detail).toContain(row.record.label)
  expect(answer.detail).not.toContain("did not fit")
  expect(answer.detail).toContain(`${fit} of 14 shown; ask to continue`)
  expect(generalAnswerSchema.safeParse(answer).success).toBe(true)
})

test("finance access and Store views are disclosed, never implied", () => {
  const withFinance = generalStaffActivityAnswer(
    {
      ...page,
      scope: "stores",
      coverage: {
        ...page.coverage,
        excluded: [
          {
            stream: "FINANCE_POSTING",
            reason: "business_wide_postings_hidden",
          },
        ],
        notIncluded: ["sign_in_and_device_activity", "attendance_and_payroll"],
      },
    },
    day,
  )
  expect(withFinance.detail).toContain(
    "Business-wide finance postings have no Store, so a Store view leaves them out.",
  )
  expect(withFinance.detail).toContain(
    "Sign-ins, attendance and payroll are not included.",
  )
  expect(withFinance.detail).not.toContain("Finance actions")
})

test("Open reopens exactly the shown events with the request's filters and cursor", async () => {
  const { staffActivityStreams } = await import("@ewatrade/db/queries")
  const { staffActivityTargetStreams, staffActivityTargetStockOperationTypes } =
    await import("@ewatrade/assistant/general/staff-activity-target")
  // The navigation schema mirrors the canonical streams and operation types.
  expect([...staffActivityTargetStreams]).toEqual([...staffActivityStreams])
  expect(staffActivityTargetStockOperationTypes).toContain("ADJUSTMENT")
  const answer = generalStaffActivityAnswer(page, {
    ...day,
    membershipId: "amina-m",
    cursor: "page-2",
  })
  expect(answer.target).toMatchObject({
    kind: "staff_activity",
    filters: { membershipId: "amina-m", ...day },
    cursor: "page-2",
    limit: 3,
  })
  const target = answer.target as {
    shown: Array<{ id: string; record: unknown; summary: string }>
  }
  expect(target.shown.map((event) => event.id)).toEqual([
    "p-1",
    "auth-1",
    "pc-1",
  ])
  expect(target.shown[0]).toMatchObject({
    record: { kind: "payment", id: "p-1", orderId: "o-1", label: "ORD-1042" },
    summary: "Amina did: Payment recorded · cash",
  })
  expect(target.shown[2]?.summary).toBe("Unknown (not recorded) did: Price set")
  // An empty page has nothing to open.
  expect(
    generalStaffActivityAnswer({ ...page, data: [], total: 0 }, day).target,
  ).toBeUndefined()
})
