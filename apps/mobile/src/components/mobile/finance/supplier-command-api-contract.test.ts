import { expect, test } from "bun:test"
import {
  financeSupplierAdvanceSchema,
  financeSupplierCreateSchema,
  financeSupplierOpeningSchema,
  financeSupplierReversalSchema,
} from "../../../../../api/src/schemas/finance-suppliers"
import {
  prepareSupplierEntry,
  prepareSupplierIdentity,
  prepareSupplierReversal,
} from "./supplier-command-state"

test("native supplier payloads are accepted unchanged by the actual strict API schemas", () => {
  const clientCommandId = "owned-native-contract-command"
  const identity = {
    ...prepareSupplierIdentity({
      bookId: "book",
      code: "nsf-014",
      name: "Northside Foods",
    }),
    clientCommandId,
  }
  expect(financeSupplierCreateSchema.parse(identity)).toEqual(identity)
  for (const kind of ["PAYABLE", "ADVANCE"] as const) {
    const opening = {
      ...prepareSupplierEntry({
        bookId: "book",
        supplierId: "supplier",
        amount: "90071992547.41",
        description: "Original opening",
        date: "2026-10-01",
        startsAt: new Date("2026-10-01T12:34:56.789Z"),
        kind,
        opening: true,
      }),
      clientCommandId,
    }
    expect(financeSupplierOpeningSchema.parse(opening)).toEqual(opening)
    expect(opening.effectiveAt.toISOString()).toBe("2026-10-01T12:34:56.789Z")
  }
  const advance = {
    ...prepareSupplierEntry({
      bookId: "book",
      supplierId: "supplier",
      amount: "12345.67",
      description: "Paid advance",
      date: "2026-10-02",
      startsAt: "2026-10-01T12:34:56.789Z",
      today: "2026-10-02",
      moneyAccountId: "cash",
      activeMoneyAccountIds: ["cash"],
    }),
    clientCommandId,
  }
  expect(financeSupplierAdvanceSchema.parse(advance)).toEqual(advance)
  const reversal = {
    ...prepareSupplierReversal({
      bookId: "book",
      entryId: "entry",
      reason: "Original entry correction",
      date: "2026-10-02",
      originalAt: "2026-10-02T12:34:56.789Z",
      today: "2026-10-02",
    }),
    clientCommandId,
  }
  expect(financeSupplierReversalSchema.parse(reversal)).toEqual(reversal)
  expect(reversal.effectiveAt.toISOString()).toBe("2026-10-02T12:34:56.789Z")
})
