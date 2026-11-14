import { describe, expect, test } from "bun:test"
import { allocateReturnables } from "./returnables"

const at = (minute: number) => new Date(Date.UTC(2026, 10, 14, 9, minute))
const move = (
  kind: "ISSUED" | "RETURNED" | "WRITTEN_OFF",
  quantity: number,
  minute: number,
  orderId: string | null = null,
) => ({
  kind,
  quantity,
  orderId,
  occurredAt: at(minute),
  createdAt: at(minute),
})

describe("returnables allocation", () => {
  test("returns with no order clear the oldest items first", () => {
    const rows = allocateReturnables([
      move("ISSUED", 20, 1, "#1031"),
      move("ISSUED", 58, 2, "#1042"),
      move("RETURNED", 30, 3),
    ])
    expect(rows.map((row) => [row.orderId, row.open, row.returned])).toEqual([
      ["#1031", 0, 20],
      ["#1042", 48, 10],
    ])
  })

  test("a return on an order clears that order before older ones", () => {
    const rows = allocateReturnables([
      move("ISSUED", 20, 1, "#1031"),
      move("ISSUED", 58, 2, "#1042"),
      move("WRITTEN_OFF", 60, 3, "#1042"),
    ])
    expect(rows.map((row) => [row.orderId, row.open, row.writtenOff])).toEqual([
      ["#1031", 18, 2],
      ["#1042", 0, 58],
    ])
  })

  test("order follows time, not input order", () => {
    const rows = allocateReturnables([
      move("RETURNED", 5, 9),
      move("ISSUED", 5, 2, "#b"),
      move("ISSUED", 5, 1, "#a"),
    ])
    expect(rows.map((row) => [row.orderId, row.open])).toEqual([
      ["#a", 0],
      ["#b", 5],
    ])
  })
})
