import { expect, test } from "bun:test"
import { prepareFinanceReportLink } from "./report-link"
const id = "cmgr1hqe00005pujsfi0tzva3"
const from = "2026-10-01T00:00:00.000Z"
const through = "2026-10-02T23:59:59.999Z"
const starts = new Date(from)
test("report links retain exact bounded snapshot and UTC semantics", () => {
  const link = prepareFinanceReportLink(
    id,
    from,
    through,
    "9223372036854775807",
    starts,
  )
  expect(link.snapshotSequence).toBe("9223372036854775807")
  expect(link.from.toISOString()).toBe(from)
  expect(link.through.toISOString()).toBe(through)
})
test("invalid report account routes fail before querying", () => {
  for (const [account, first, last, snapshot] of [
    ["", from, through, "42"],
    [id, "bad", through, "42"],
    [id, through, from, "42"],
    [id, from, through, "01"],
    [id, from, through, "9223372036854775808"],
    [id, "2026-09-30T00:00:00Z", through, "42"],
  ])
    expect(() =>
      prepareFinanceReportLink(
        account ?? "",
        first ?? "",
        last ?? "",
        snapshot ?? "",
        starts,
      ),
    ).toThrow("invalid")
})
