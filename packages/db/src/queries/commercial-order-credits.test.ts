import { expect, test } from "bun:test"
import { returnedValueMinor } from "./commercial-order-credits"

test("returned value follows each line's own total, pro rata", () => {
  expect(
    returnedValueMinor([
      { quantity: "50", totalMinor: 4250000, returned: "2" },
      { quantity: "2", totalMinor: 2800000, returned: "1" },
    ]),
  ).toBe(170000 + 1400000)
  // Order-priced or discounted lines still split their total evenly.
  expect(
    returnedValueMinor([{ quantity: "3", totalMinor: 1000, returned: "1" }]),
  ).toBe(333)
  expect(
    returnedValueMinor([
      { quantity: "12.4", totalMinor: 3720000, returned: "0" },
    ]),
  ).toBe(0)
})
