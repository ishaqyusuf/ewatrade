import { describe, expect, it } from "bun:test"
import { inventoryOperationRecovery } from "./inventory-operation-recovery"

describe("inventory operation recovery", () => {
  it("refreshes only a structured stock rejection", () => {
    expect(
      inventoryOperationRecovery({
        code: "CONFLICT",
        appError: { code: "STOCK_CONFLICT" },
      }),
    ).toBe("refresh")
  })
  it("allows repair after a validation or permission rejection", () => {
    for (const code of ["BAD_REQUEST", "FORBIDDEN", "NOT_FOUND"]) {
      expect(inventoryOperationRecovery({ code })).toBe("edit")
    }
  })
  it("retains the original request for ambiguous outcomes and identity conflicts", () => {
    for (const data of [
      undefined,
      { code: "CONFLICT" },
      { code: "CONFLICT", appError: { code: "IDEMPOTENCY_CONFLICT" } },
      {
        code: "INTERNAL_SERVER_ERROR",
        appError: { code: "DATABASE_WRITE_CONFLICT" },
      },
      { code: "TIMEOUT" },
    ])
      expect(inventoryOperationRecovery(data)).toBe("retry")
  })
})
