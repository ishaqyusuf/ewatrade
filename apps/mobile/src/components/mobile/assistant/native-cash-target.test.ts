import { expect, test } from "bun:test"
import { generalAnswerRoute, generalReceiptRoute } from "./general-model"
import {
  nativeCashReadRoute,
  readNativeCashOriginalParams,
  readNativeDayReviewTarget,
} from "./native-cash-target"

test("cash receipt and answer preserve both original Book and count", () => {
  const target = {
    kind: "finance_cash_count" as const,
    bookId: "original-book",
    countId: "saved-count",
  }
  const expected = {
    pathname: "/finance-count/[countId]" as const,
    params: { bookId: "original-book", countId: "saved-count" },
  }
  expect(generalAnswerRoute(target)).toEqual(expected)
  expect(
    generalReceiptRoute({
      kind: "finance_cash_count",
      recordId: "saved-count",
      bookId: "original-book",
      title: "Saved",
      detail: "Saved",
    }),
  ).toEqual(expected)
  expect(
    readNativeCashOriginalParams(
      expected.params.bookId,
      expected.params.countId,
    ),
  ).toEqual(target)
  expect(
    generalReceiptRoute({
      kind: "finance_cash_count",
      recordId: "saved-count",
      title: "Saved",
      detail: "Saved",
    }),
  ).toBeNull()
})
test("day review retains the exact completed UTC cutoff", () => {
  const target = {
    kind: "finance_day_close" as const,
    bookId: "book",
    through: "2026-10-14T23:59:59.999Z",
  }
  const route = nativeCashReadRoute(target)
  expect(generalAnswerRoute(target)).toEqual(route)
  expect(route?.pathname).toBe("/finance-periods-modal")
  expect(
    route && "target" in route.params
      ? readNativeDayReviewTarget(route.params.target)
      : null,
  ).toEqual(target)
})
test("malformed, expanded authority, mixed objects and incomplete cutoff refuse exact readers", () => {
  for (const raw of [
    null,
    [],
    "",
    {},
    { kind: "finance_cash_count", bookId: "book" },
    {
      kind: "finance_cash_count",
      bookId: "book",
      countId: "count",
      actorUserId: "other",
    },
    {
      kind: "finance_day_close",
      bookId: "book",
      through: "2026-10-14T12:00:00.000Z",
    },
    {
      kind: "finance_day_close",
      bookId: "book",
      through: "2026-02-30T23:59:59.999Z",
    },
    {
      kind: "finance_day_close",
      bookId: "book",
      through: "2026-10-14T23:59:59.999Z",
      close: true,
    },
  ]) {
    expect(nativeCashReadRoute(raw)).toBeNull()
    expect(readNativeDayReviewTarget(JSON.stringify(raw))).toBeNull()
  }
  for (const raw of [[], {}, undefined, " ", "x".repeat(129)]) {
    expect(readNativeCashOriginalParams(raw, "count")).toBeNull()
    expect(readNativeCashOriginalParams("book", raw)).toBeNull()
  }
  expect(readNativeDayReviewTarget("{")).toBeNull()
  expect(readNativeDayReviewTarget("x".repeat(1025))).toBeNull()
})

test("all planned cash tool helpers support mobile without inventing an original object", async () => {
  const { capabilityManifest } = await import(
    "@ewatrade/assistant/capabilities/manifest"
  )
  const { generalAnswerSchema } = await import(
    "@ewatrade/assistant/general/contracts"
  )
  for (const id of [
    "finance.cash_count.record",
    "finance.cash_accounts.read",
    "finance.cash_counts.read",
    "finance.cash_count.read",
    "finance.day_close.read",
  ]) {
    const c = capabilityManifest.find((c) => c.id === id)
    expect(c?.clients.some((client) => client === "mobile")).toBe(true)
    expect(c?.rollout).toBe("planned")
  }
  for (const title of ["Cash accounts", "Original cash counts"]) {
    const answer = generalAnswerSchema.parse({
      id: "read",
      title,
      value: "10 on this page",
      scope: "Tenant Finance Book · NGN",
      asOf: "2026-10-15T10:00:00.000Z",
      detail:
        "More available; continue with the same Book and account. Identities are not a physical observation.",
    })
    expect(generalAnswerRoute(answer.target)).toBeNull()
    expect(answer.detail).toContain("same Book")
  }
})
