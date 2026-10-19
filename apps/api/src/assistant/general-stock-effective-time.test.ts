import { expect, test } from "bun:test"
import { generalActionSchema } from "@ewatrade/assistant/general/contracts"
import { TRPCError } from "@trpc/server"
import { stockAdjust } from "./general-stock-adjustment"
import { generalStockEffectiveTime } from "./general-stock-effective-time"
import { stockReceive } from "./general-stock-receipt"

const receive = {
  action: "stock_receive",
  balanceSourceId: "source",
  enteredInventoryUnitId: "unit",
  enteredQuantity: "2",
  source: "Delivery",
  reason: "Received goods",
}
const adjust = {
  action: "stock_adjust",
  balanceSourceId: "source",
  enteredInventoryUnitId: "unit",
  enteredQuantity: "2",
  direction: "decrease",
  purpose: "adjustment",
  categories: [{ name: "Damaged" }],
  reason: "Counted damaged goods",
}
async function invoke(adapter: object, method: string, payload: unknown) {
  const run = Reflect.get(adapter, method)
  if (typeof run !== "function") throw Error(`Missing actual ${method}`)
  // Invalid time must fail before reading scope or any persistence delegate.
  const ctx = new Proxy(
    {},
    {
      get() {
        throw Error("Unexpected context read")
      },
    },
  )
  return Reflect.apply(run, adapter, [
    ctx,
    payload,
    method === "validate" ? true : "same-command",
  ])
}
function preparedEffectiveAt(value: unknown) {
  if (!value || typeof value !== "object")
    throw Error("Expected the actual prepared stock payload")
  const effectiveAt = Reflect.get(value, "effectiveAt")
  if (typeof effectiveAt !== "string")
    throw Error("Expected the actual prepared stock time")
  return effectiveAt
}

test("both actual adapters reject unrepresentable pending times before scope, locks or effects", async () => {
  for (const [adapter, payload] of [
    [stockReceive, receive],
    [stockAdjust, adjust],
  ] as const) {
    for (const method of ["prepare", "review", "validate", "execute"]) {
      try {
        await invoke(adapter, method, {
          ...payload,
          effectiveAt: "2026-10-15T09:00:00.123456Z",
        })
        throw Error("Unsupported stock time was admitted")
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect(error instanceof TRPCError && error.code).toBe("BAD_REQUEST")
        expect(error instanceof Error && error.message).toContain("millisecond")
      }
    }
  }
})

test("new review preparation preserves representable explicit text and fills only absent time", async () => {
  for (const [adapter, payload] of [
    [stockReceive, receive],
    [stockAdjust, adjust],
  ] as const) {
    for (const raw of ["2026-10-15T09:00:00Z", "2026-10-15T09:00:00.123000Z"]) {
      const prepared = await invoke(adapter, "prepare", {
        ...payload,
        effectiveAt: raw,
      })
      expect(preparedEffectiveAt(prepared)).toBe(raw)
      expect(generalStockEffectiveTime(raw)?.getTime()).toBe(
        new Date(raw).getTime(),
      )
    }
    const prepared = await invoke(adapter, "prepare", payload)
    expect(
      generalStockEffectiveTime(preparedEffectiveAt(prepared)),
    ).toBeInstanceOf(Date)
  }
  expect(generalStockEffectiveTime(undefined)).toBeUndefined()
})

test("old stored action payloads remain parseable for terminal receipt recovery", () => {
  for (const payload of [receive, adjust])
    expect(
      generalActionSchema.safeParse({
        ...payload,
        effectiveAt: "2026-10-15T09:00:00.123456Z",
      }).success,
    ).toBe(true)
})
